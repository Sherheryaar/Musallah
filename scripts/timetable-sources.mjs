// Timetable PROVIDERS. One module-shaped entry per system that mosques use
// to publish their own times.
//
// DESIGN RULE: no provider is privileged. Mawaqit publishes only ~235 UK
// mosques and reaches 151 of our 2,239 places, with none of London's largest
// mosques among them, so a pipeline built around any single provider would
// leave the most-used masjids permanently stale. Each source below fetches
// for the places registered to it in scripts/timetable-links.json and
// returns the same shape:
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
  masjidboxDay,
  masjidboxJamaat,
  masjidboxState,
  masjidboxTimezone,
  parseDailyIqamahTable,
  parseDatedJamaatTable,
  siratDayTimes,
  toHHMM,
  todayInZone,
} from "./lib/timetable.mjs";

const BROWSERISH_UA =
  "Mozilla/5.0 (compatible; MasjidLocatorBot/0.1; UK masjid directory; +https://github.com/Sherheryaar/Musallah)";

// Fine for an API. Not fine for a mosque's own website: those sit on shared
// hosting and a first, uncached hit can take well over 15 s — Harrow Central
// Mosque times out at 15 s every run and would simply never be readable. The
// HTML sources below raise it, which costs nothing since they make one request
// per registered place and there are few of them.
const TIMEOUT_MS = 15_000;
const SLOW_SITE_TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, headers, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

async function getJson(url, headers, timeoutMs) {
  const result = await getText(url, headers, timeoutMs);
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
// masjidbox.net/<slug> embeds `window.REDUX_STATE`: a month of timetable rows,
// each carrying the adhan times AND a separate, explicitly-labelled `iqamah`
// object. That is what we read — labelled beats positional, and it is the only
// path that works on Masjidbox's client-rendered theme, whose HTML contains no
// times at all. Scraping the rendered grid remains as a fallback.
//
// Widely used by UK mosques (Al Furqan Hounslow among them), and each mosque
// enters its own times.

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

  /**
   * A mosque's timetable lives on ONE of two hosts and there is no way to tell
   * which from the outside: masjidbox.com/prayer-times/<slug> serves it for
   * most, masjidbox.net/<slug> for those on the website product (Al Furqan,
   * Romford and Tauheedul Islam among them), and the other host returns an
   * empty shell rather than a redirect. So try both before reporting nothing.
   */
  urlsFor(link) {
    const slug = link.slug ?? link.url?.split("/").filter(Boolean).pop();
    if (!slug) return link.url ? [link.url] : [];
    return [
      `https://masjidbox.com/prayer-times/${slug}`,
      `https://masjidbox.net/${slug}`,
    ];
  },

  async fetchOne(link) {
    let lastError = null;
    for (const url of this.urlsFor(link)) {
      const { text, error, rateLimited } = await getText(
        url,
        this.headers,
        SLOW_SITE_TIMEOUT_MS,
      );
      if (rateLimited) return { rateLimited };
      if (error) {
        lastError = error;
        continue;
      }
      const day = this.readDay(text);
      if (day) {
        const results = new Map();
        results.set(link.placeId, { ...day, skipped: [] });
        return { results };
      }
      await sleep(this.throttleMs);
    }
    return {
      error:
        lastError ?? "no timetable row for today (mosque has not published it)",
    };
  },

  /** Today's jamā'ah out of one page, or null if this page hasn't got it. */
  readDay(text) {
    // Preferred: the embedded state, where jamā'ah times are labelled.
    const state = masjidboxState(text);
    if (state) {
      const zone = masjidboxTimezone(state) ?? "Europe/London";
      const day = masjidboxDay(state, todayInZone(zone));
      if (day) return day;
    }

    // Fallback for a page with no usable state: scrape the rendered grid.
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
    return jamaat ? { jamaat } : null;
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
    const { text, error, rateLimited } = await getText(
      link.url,
      this.headers,
      SLOW_SITE_TIMEOUT_MS,
    );
    if (error || rateLimited) return { error, rateLimited };
    // Every mosque on this source is UK-based (the registry only carries
    // UK dated-table pages), so "today" means today in the UK, not UTC —
    // a run between 23:00-00:00 UTC during BST would otherwise read
    // yesterday's UK-local row and publish it as if it were today's.
    const isoDate = todayInZone("Europe/London");
    const jamaat = parseDatedJamaatTable(htmlTableRows(text), isoDate);
    if (!jamaat) {
      return { error: `no usable row for ${isoDate} (layout changed?)` };
    }
    const results = new Map();
    results.set(link.placeId, { jamaat, skipped: [] });
    return { results };
  },
};

// --- Daily iqāmah table ------------------------------------------------------
// The other half of the "mosque publishes its own HTML table" case: instead of
// a year of dated rows, the page shows TODAY only, one row per prayer, with a
// column named Iqamah or Jamā'ah (Belfast Islamic Centre is the first of
// these). parseDailyIqamahTable insists the page is actually showing today's
// date before it reads anything, because a page of this shape carries no other
// way to tell a live timetable from a cached one.
//
// Same deal as dated-table: one parser serves every mosque on this shape, so
// registering another is a registry row rather than new code.

const dailyIqamahTable = {
  id: "daily-iqamah",
  label: "Mosque website (daily iqāmah table)",
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
    const { text, error, rateLimited } = await getText(
      link.url,
      this.headers,
      SLOW_SITE_TIMEOUT_MS,
    );
    if (error || rateLimited) return { error, rateLimited };
    // UK-local date, for the same reason as the dated-table source above.
    const isoDate = todayInZone("Europe/London");
    const jamaat = parseDailyIqamahTable(htmlTableRows(text), isoDate);
    if (!jamaat) {
      return {
        error: `no iqāmah table showing ${isoDate} (page stale, or layout changed?)`,
      };
    }
    const results = new Map();
    results.set(link.placeId, { jamaat, skipped: [] });
    return { results };
  },
};

// --- Sirat.uk -----------------------------------------------------------------
// A third-party UK mosque-times directory (https://sirat.uk/mosques/developers),
// used only for places that had NO other source — see scripts/harvest-sirat.mjs
// for how a place gets linked here. Identity is the mosque id captured at link
// time (never proximity), same rule as every other provider.

const SIRAT_API = "https://sirat.uk/mosques/v1";

const sirat = {
  id: "sirat",
  label: "Sirat.uk",
  credit: "Sirat.uk (UK mosque directory, ODC-By 1.0)",
  // Only one request is made per run now (see plan), so the pace only
  // matters if that request has to be retried.
  throttleMs: 600,
  headers: { "User-Agent": BROWSERISH_UA, Accept: "application/json" },

  /**
   * ONE request serves every registered place. `/v1/snapshot` returns every
   * eligible mosque with the next 45 days of times, which replaced a
   * per-mosque `/times` call each — 422 requests, several minutes, and 422
   * chances to fail, against a documented 120-requests-per-minute limit.
   *
   * The snapshot is also the only way we see JUMU'AH reliably. A mosque's
   * Jumu'ah sits on FRIDAY's record, not on every day's, so asking only for
   * today (as the per-mosque call did) returned an empty `jumuah` array on
   * six days in seven and Jumu'ah could only ever be picked up if a run
   * happened to land on a Friday.
   *
   * The trade-off is that one failure now costs the whole source rather than
   * one place. That is acceptable here because the orchestrator keeps
   * whatever times it already had when a source goes quiet, and tomorrow's
   * run retries — the same outcome as 422 individual failures, minus the
   * load on Sirat.
   */
  plan(links) {
    return [{ key: "snapshot", links, run: () => this.fetchSnapshot(links) }];
  },

  async fetchSnapshot(links) {
    const { json, error, rateLimited } = await getJson(
      `${SIRAT_API}/snapshot`,
      this.headers,
    );
    if (error || rateLimited) return { error, rateLimited };
    const entries = Array.isArray(json?.mosques) ? json.mosques : [];
    if (entries.length === 0) return { error: "snapshot contained no mosques" };
    const byId = new Map(
      entries.filter((e) => e?.mosque?.id).map((e) => [e.mosque.id, e]),
    );

    // Sirat.uk is UK-only, so "today" means the UK-local date, not UTC (see
    // the identical fix on the dated-table source above).
    const isoDate = todayInZone("Europe/London");
    const results = new Map();

    for (const link of links) {
      const entry = byId.get(link.siratId);
      // Absent from the snapshot: leave it out entirely so the orchestrator
      // reports it as "not returned by its source" and keeps what we had.
      if (!entry) continue;
      const { jamaat, jumuah, skipped } = siratDayTimes(entry.times, isoDate);

      // In the snapshot but carrying nothing for today: Sirat holds an
      // identity for this mosque and no times. Left out rather than returned
      // empty, so the run counts it as "not returned by its source" instead
      // of quietly as "already current" — 111 of the 605 mosques are in this
      // state, and that number should stay visible.
      if (Object.keys(jamaat).length === 0 && jumuah.length === 0) continue;

      results.set(link.placeId, {
        jamaat: Object.keys(jamaat).length > 0 ? jamaat : undefined,
        jumuah: jumuah.length > 0 ? jumuah : undefined,
        skipped,
      });
    }
    return { results };
  },
};

export const SOURCES = {
  mawaqit,
  masjidbox,
  "dated-table": datedTable,
  "daily-iqamah": dailyIqamahTable,
  sirat,
};
