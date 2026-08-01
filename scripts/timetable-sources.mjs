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
  htmlTableRows,
  iqamaToJamaat,
  parseDatedJamaatTable,
  toHHMM,
} from "./lib/timetable.mjs";

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

// --- East London Mosque -----------------------------------------------------
// Not on Mawaqit (nor are Brick Lane, Croydon, Lewisham or London Central) —
// which is exactly why this pipeline is provider-agnostic. ELM publishes a
// FULL YEAR of Begins/Jamā'ah rows on its own site, keyed by Gregorian date
// and preceded by a header row naming each column; we read today's row. One
// request per run against one mosque's own public page.

const eastlondonmosque = {
  id: "eastlondonmosque",
  label: "East London Mosque",
  credit: "eastlondonmosque.org.uk (published timetable)",
  throttleMs: 1000,
  headers: {
    // Their server 403s an unknown agent; identify as a normal browser but
    // keep the bot's contact intent honest in the string.
    "User-Agent":
      "Mozilla/5.0 (compatible; MasjidLocatorBot/0.1; UK masjid directory; +https://github.com/Sherheryaar/Musallah)",
    Accept: "text/html",
  },

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
      // No row for today, or no named header columns: the page changed.
      // Report it — a plausible-looking wrong prayer time is worse than
      // yesterday's value plus a visible problem in the run log.
      return { error: `no usable row for ${isoDate} (layout changed?)` };
    }
    const results = new Map();
    results.set(link.placeId, {
      jamaat,
      // Their page states the Friday Zuhr Jama'ah IS the Jumu'ah prayer, so
      // Jumu'ah is only trustworthy from a Friday row — left to the
      // dedicated Jumu'ah data rather than inferred here.
      skipped: [],
    });
    return { results };
  },
};

export const SOURCES = { mawaqit, eastlondonmosque };
