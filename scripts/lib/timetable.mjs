// Pure helpers for turning a mosque's PUBLISHED timetable into the app's
// jamaat shape. No network, no filesystem — so every parsing rule here is
// unit-tested (scripts/lib/timetable.test.mjs).
//
// WHY THIS IS SOURCE-AGNOSTIC: mosques publish times in whatever system
// they use — Mawaqit, Masjidbox, a WordPress table, a hand-typed HTML page.
// No single provider covers the dataset (Mawaqit reaches 131 of 2,244
// places, and none of London's largest mosques are on it), so the refresh
// pipeline treats every provider as one source among many. Adding a source
// means adding a module that returns the shape below — never rewriting the
// core.
//
// THE SHAPE every source returns:
//   { jamaat?: { fajr?, dhuhr?, asr?, maghrib?, isha? },  // "HH:MM" 24h
//     jumuah?: string[] }                                  // ["13:30", ...]

/** "9:56" / "21:56" -> "21:56", else null. No time is better than a wrong one. */
export function toHHMM(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * UK mosque timetables are printed in 12-hour clock with no am/pm — "1:12"
 * means 13:12, "9:56" means 21:56. Disambiguated by which prayer it is,
 * because only the prayer tells you which side of noon a bare hour sits on.
 */
export function to24Hour(value, prayer) {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  // Fajr is always morning; the rest are afternoon/evening, and any hour
  // from 1 to 11 printed against them means PM.
  if (prayer !== "fajr" && prayer !== "sunrise" && h >= 1 && h <= 11) {
    h += 12;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const JAMAAT_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/**
 * Mawaqit publishes `iqama` as 5 entries matching [fajr, dhuhr, asr,
 * maghrib, isha], each EITHER a clock time ("13:30") or an offset from the
 * adhan ("+10", "+0"). Offsets are resolved against that mosque's own
 * `times` array — but only when the array has the exact documented shape
 * ([fajr, sunrise, dhuhr, asr, maghrib, isha]); some records carry a
 * seventh entry, and guessing the layout of a prayer time is not acceptable.
 *
 * Returns { jamaat, skipped } — `skipped` names the prayers that could not
 * be resolved, so the caller can report them instead of silently dropping.
 */
export function iqamaToJamaat(times, iqama, iqamaEnabled) {
  // A mosque that switched iqama off is saying "don't publish these".
  if (iqamaEnabled === false) return { jamaat: {}, skipped: JAMAAT_KEYS };
  if (!Array.isArray(iqama) || iqama.length !== 5) {
    return { jamaat: {}, skipped: JAMAAT_KEYS };
  }
  const adhan =
    Array.isArray(times) && times.length === 6
      ? {
          fajr: toHHMM(times[0]),
          dhuhr: toHHMM(times[2]),
          asr: toHHMM(times[3]),
          maghrib: toHHMM(times[4]),
          isha: toHHMM(times[5]),
        }
      : null;

  const jamaat = {};
  const skipped = [];
  JAMAAT_KEYS.forEach((key, i) => {
    const raw = iqama[i];
    const direct = toHHMM(raw);
    if (direct) {
      jamaat[key] = direct;
      return;
    }
    const offsetMatch =
      typeof raw === "string" ? raw.trim().match(/^\+(\d{1,3})$/) : null;
    if (offsetMatch && adhan?.[key]) {
      jamaat[key] = addMinutes(adhan[key], Number(offsetMatch[1]));
      return;
    }
    skipped.push(key);
  });
  return { jamaat, skipped };
}

/** "21:55" + 10 -> "22:05". Wraps within the day. */
export function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + minutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
}

/** "2026-08-01" -> "01/08/2026", the format ELM keys its rows by. */
export function toDMY(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * East London Mosque publishes a full year of rows keyed by Gregorian date,
 * preceded by a header row that NAMES every column ("Fajr Jamā'ah", "Zuhr
 * Begins", ...). Both facts are used deliberately:
 *
 *   * the row is found by its exact date cell, so a missing or reordered
 *     row can never be read as another day's times;
 *   * the columns are located by their header text, not by index, so the
 *     mosque adding a column (or moving Sunrise, which does not sit where
 *     the rendered page suggests) cannot silently shift Maghrib's jamā'ah
 *     into Isha's slot.
 *
 * If either the date row or a required header is missing, this returns null
 * and the caller reports it. A layout change must surface as an error, never
 * as a plausible-looking wrong prayer time.
 *
 * `rows` is [[cell, ...], ...] — pulling the table out of HTML is the
 * caller's job, so this stays pure and testable.
 */
export function parseDatedJamaatTable(rows, isoDate) {
  const wanted = toDMY(isoDate);
  const row = rows.find((cells) => cells[0]?.trim() === wanted);
  if (!row) return null;

  // The header row is the one naming the jamā'ah columns per prayer.
  const header = rows.find(
    (cells) =>
      cells.length === row.length &&
      cells.some((c) => /fajr\s+jam/i.test(c)) &&
      cells.some((c) => /zuhr\s+jam|dhuhr\s+jam/i.test(c)),
  );
  if (!header) return null;

  const columnFor = (prayerPattern) =>
    header.findIndex((c) => prayerPattern.test(c) && /jam/i.test(c));
  const wanted_columns = {
    fajr: columnFor(/fajr/i),
    dhuhr: columnFor(/zuhr|dhuhr/i),
    asr: columnFor(/asr/i),
    maghrib: columnFor(/maghrib/i),
    isha: columnFor(/ish/i),
  };

  const jamaat = {};
  for (const key of JAMAAT_KEYS) {
    const index = wanted_columns[key];
    if (index < 0) continue;
    const time = to24Hour(row[index], key);
    if (time) jamaat[key] = time;
  }
  return Object.keys(jamaat).length > 0 ? jamaat : null;
}

/** Strip tags/entities from an HTML table cell. */
export function cellText(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every <tr> in `html` as an array of cell strings. */
export function htmlTableRows(html) {
  const rows = [];
  for (const [, tr] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => cellText(m[1]),
    );
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** Do two jamaat objects hold the same times? (Avoids pointless writes.) */
export function sameJamaat(a, b) {
  if (!a || !b) return false;
  return JAMAAT_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

export { JAMAAT_KEYS };
