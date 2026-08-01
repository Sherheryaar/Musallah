// Timetable PROVIDERS. One module-shaped entry per system that mosques use
// to publish their own times.
//
// DESIGN RULE: no provider is privileged. Mawaqit reaches 131 of 2,244
// places and none of London's largest mosques are on it, so a pipeline
// built around any single provider would leave the most-used masjids
// permanently stale. Each source below fetches for the places registered to
// it in scripts/timetable-links.json and returns the same shape:
//
//   { jamaat?: {fajr,dhuhr,asr,maghrib,isha}, jumuah?: string[] }
//
// Adding a provider (Masjidbox, a council timetable, one mosque's own HTML)
// means adding an entry here plus registry rows — the orchestrator
// (scripts/refresh-times.mjs) needs no changes.
//
// Every provider must: identify itself honestly in its User-Agent, respect
// rate limits, and be credited in the app's About screen.

import {
  cellText,
  htmlTableRows,
  iqamaToJamaat,
  masjidboxJamaat,
  parseDatedJamaatTable,
  toHHMM,
} from "./lib/timetable.mjs";

const BROWSERISH_UA =
  "Mozilla/5.0 (compatible; MasjidLocatorBot/0.1; UK masjid directory; +https://github.com/Sherheryaar/Musallah)";

const TIMEOUT_MS = 15_000;

async function getText(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (res.status === 429) return { rateLimited: true };
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { text: await res.text() };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, headers) {
  const result = await getText(url, headers);
  if (!result.text) return result;
  try {
    return { json: JSON.parse(result.text) };
  } catch {
    return { error: "invalid JSON" };
  }
}

// --- Mawaqit ----------------------------------------------------------------
// Public search endpoint, used with Mawaqit's permission and credited in the
// app. Queries are deduped onto a ~2 km grid (one call returns the mosques
// nearest a point, so it covers a neighbourhood), and mosques are matched by
// the uuid captured at link time — never by proximity.

const MAWAQIT_API = "https://mawaqit.net/api/2.0/mosque/search";
const GRID_DEG = 0.02;

const mawaqit = {
  id: "mawaqit",
  label: "Mawaqit",
  credit: "Mawaqit.net (with permission)",
  // Slower than a website scrape on purpose: this hits one shared API for
  // 131 mosques, and a first greedy run got 429s after ~110 requests.
  throttleMs: 2500,
  headers: {
    "User-Agent":
      "MasjidLocatorBot/0.1 (UK masjid directory; crediting Mawaqit; low volume)",
    Accept: "application/json",
  },

  /**
   * Batches links onto the grid so one request serves several mosques.
   * Returns [{ key, run() }] — the orchestrator paces the runs.
   */
  plan(links) {
    const cells = new Map();
    for (const link of links) {
      const key = `${Math.round(link.lat / GRID_DEG)}:${Math.round(link.lng / GRID_DEG)}`;
      if (!cells.has(key)) {
        cells.set(key, {
          lat: Math.round(link.lat / GRID_DEG) * GRID_DEG,
          lng: Math.round(link.lng / GRID_DEG) * GRID_DEG,
          links: [],
        });
      }
      cells.get(key).links.push(link);
    }
    return [...cells.entries()].map(([key, cell]) => ({
      key,
      links: cell.links,
      run: () => this.fetchCell(cell),
    }));
  },

  async fetchCell(cell) {
    const { json, error, rateLimited } = await getJson(
      `${MAWAQIT_API}?lat=${cell.lat}&lon=${cell.lng}`,
      this.headers,
    );
    if (error || rateLimited) return { error, rateLimited };
    const mosques = Array.isArray(json) ? json : [];
    const results = new Map();
    for (const link of cell.links) {
      const m = mosques.find((x) => x?.uuid === link.mawaqitUuid);
      if (!m) continue;
      if (m.closed === true) {
        results.set(link.placeId, { closed: true });
        continue;
      }
      const { jamaat, skipped } = iqamaToJamaat(m.times, m.iqama, m.iqamaEnabled);
      const jumuah = [m.jumua, m.jumua2, m.jumua3]
        .map(toHHMM)
        .filter((t, i, arr) => t !== null && arr.indexOf(t) === i)
        .sort();
      results.set(link.placeId, {
        jamaat: Object.keys(jamaat).length > 0 ? jamaat : undefined,
        jumuah: jumuah.length > 0 ? jumuah : undefined,
        skipped,
      });
    }
    return { results };
  },
};

// --- Masjidbox --------------------------------------------------------------
// masjidbox.net/<slug> server-renders today's grid: one block per prayer,
// holding the prayer name then its Athan and Iqamah times. Iqamah is the
// jamaat time. Widely used by UK mosques (Al Furqan Hounslow among them),
// and each mosque enters its own times.

const masjidbox = {
  id: "masjidbox",
  label: "Masjidbox",
  credit: "Masjidbox (mosque-published timetable)",
  throttleMs: 1500,
  headers: { "User-Agent": BROWSERISH_UA, Accept: "text/html" },

  plan(links) {
    return links.map((link) => ({
      key: link.placeId,
      links: [link],
      run: () => this.fetchOne(link),
    }));
  },

  async fetchOne(link) {
    const url = link.url ?? `https://masjidbox.net/${link.slug}`;
    const { text, error, rateLimited } = await getText(url, this.headers);
    if (error || rateLimited) return { error, rateLimited };

    // Class names are semantic, not hashed: a prayer column carries a title
    // element and time elements. If the markup changes this yields nothing
    // and the run reports it — better than guessing a time.
    const columns = [];
    const blocks = text.split(/header-prayer-times-prayers-column/g).slice(1);
    for (const block of blocks) {
      const titleMatch = block.match(
        /header-prayer-times-prayers-title[^>]*>([\s\S]*?)<\/div>/i,
      );
      const times = [...block.matchAll(/shared-atoms-time[^>]*>([\s\S]*?)<\/div>/gi)]
        .map((m) => cellText(m[1]))
        .filter(Boolean);
      if (titleMatch && times.length > 0) {
        columns.push({ title: cellText(titleMatch[1]), times });
      }
    }
    const jamaat = masjidboxJamaat(columns);
    if (!jamaat) {
      return { error: "no prayer grid found (layout changed?)" };
    }
    const results = new Map();
    results.set(link.placeId, { jamaat, skipped: [] });
    return { results };
  },
};

// --- Generic dated timetable -------------------------------------------------
// Many mosques publish their own yearly or monthly calendar as a plain HTML
// table: one row per date, columns named per prayer. That is exactly the
// shape parseDatedJamaatTable reads — so ONE parser serves all of them, and
// registering a new mosque is a registry row with a url, not new code.
// East London Mosque (a full year of rows, no third-party platform) is
// simply the first entry of this kind, not a special case.
//
// scripts/discover-timetables.mjs finds candidates and checks that today's
// row parses before anything is registered here.

const datedTable = {
  id: "dated-table",
  label: "Mosque website (dated timetable)",
  credit: null, // per-place: the mosque's own site (see link.credit)
  throttleMs: 1500,
  headers: { "User-Agent": BROWSERISH_UA, Accept: "text/html" },

  plan(links) {
    return links.map((link) => ({
      key: link.placeId,
      links: [link],
      run: () => this.fetchOne(link),
    }));
  },

  async fetchOne(link) {
    const { text, error, rateLimited } = await getText(link.url, this.headers);
    if (error || rateLimited) return { error, rateLimited };
    const isoDate = new Date().toISOString().slice(0, 10);
    const jamaat = parseDatedJamaatTable(htmlTableRows(text), isoDate);
    if (!jamaat) {
      return { error: `no usable row for ${isoDate} (layout changed?)` };
    }
    const results = new Map();
    results.set(link.placeId, { jamaat, skipped: [] });
    return { results };
  },
};

export const SOURCES = { mawaqit, masjidbox, "dated-table": datedTable };
