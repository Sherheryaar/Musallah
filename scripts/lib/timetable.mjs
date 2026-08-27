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

/**
 * Reads one mosque's day out of a Sirat.uk snapshot entry's `times` array.
 *
 * Two separate questions, deliberately answered from different days:
 *
 *   * JAMĀ'AH comes from today's record only. These move with the sun, so a
 *     neighbouring day's values would be quietly wrong.
 *   * JUMU'AH comes from the soonest record from today onwards that actually
 *     carries one — which is this week's Friday, and on a Friday is today.
 *     Sirat publishes Jumu'ah on Friday's record rather than on every day's,
 *     so reading only today would return nothing six days in seven, and a
 *     mosque registered on a Tuesday would show no Jumu'ah until Friday.
 *
 * Returns { jamaat, jumuah, skipped } — `skipped` names the prayers with no
 * time today, so the caller can report them rather than drop them silently.
 */
export function siratDayTimes(days, isoDate) {
  const rows = Array.isArray(days) ? days : [];
  const today = rows.find((d) => d?.date === isoDate);

  const jamaat = {};
  const skipped = [];
  for (const key of JAMAAT_KEYS) {
    const time = toHHMM(today?.[key]);
    if (time) jamaat[key] = time;
    else skipped.push(key);
  }

  const jumuahDay = rows
    .filter((d) => typeof d?.date === "string" && d.date >= isoDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((d) => Array.isArray(d.jumuah) && d.jumuah.length > 0);
  const jumuah = [
    ...new Set(
      (jumuahDay?.jumuah ?? []).map((j) => toHHMM(j?.time)).filter(Boolean),
    ),
  ].sort();

  return { jamaat, jumuah, skipped };
}

/** Is this cell a clock time rather than a label? */
function isTimeCell(text) {
  return /^\d{1,2}[:.]\d{2}\s*(?:am|pm)?$/i.test(String(text ?? "").trim());
}

/**
 * "5:00 pm" -> "17:00", "12:30 am" -> "00:30", "17.30" -> "17:30".
 * An explicit am/pm is stronger evidence than the per-prayer guess to24Hour
 * has to make, so it is resolved here and the result left unambiguous.
 */
function normaliseTimeCell(text) {
  const raw = String(text ?? "").trim().replace(".", ":");
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(raw);
  if (!m) return raw;
  const meridiem = m[3]?.toLowerCase();
  if (!meridiem) return `${m[1]}:${m[2]}`;
  let h = Number(m[1]) % 12;
  if (meridiem === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * The OTHER common mosque timetable shape: one row PER PRAYER for today only,
 * rather than one row per date for the year.
 *
 *   27/08/2026
 *   Prayer   | Begins | Iqamah
 *   Fajr فجر |  04:40 |  05:00
 *   'Asr عصر |  17:16 |  17:30
 *
 * Three things make this readable without guessing, and each is required:
 *
 *   * TODAY'S DATE must appear in the table. A page of this shape shows one
 *     day, so without that check a stale or cached page would be published
 *     as if it were today's — the one failure worse than having no time.
 *   * A HEADER must actually name an iqāmah/jamā'ah column. Plenty of
 *     mosques publish "Begins | Ends" instead, and those are not jamā'ah
 *     times; if nothing names one, this returns null rather than assume the
 *     second time is it.
 *   * The header decides WHICH time to take, by its position among the time
 *     columns — not "the last one". A table ordering them Iqamah | Begins
 *     would otherwise yield the start of the prayer as the jamā'ah.
 *
 * Rows are scanned label-by-label rather than by column index, because these
 * tables are often laid out two prayers to a row and flatten to
 * ["Sunrise", "06:20", "Dhuhr", "13:27", "13:40"]. Times are attributed to
 * the label they follow, so Sunrise's time cannot land on Dhuhr.
 */
export function parseDailyIqamahTable(rows, isoDate) {
  const [y, m, d] = isoDate.split("-");
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const month = monthNames[Number(m) - 1];
  const day = String(Number(d));
  const dateForms = [
    `${d}/${m}/${y}`,
    `${d}-${m}-${y}`,
    `${d}.${m}.${y}`,
    isoDate,
  ].map((s) => s.toLowerCase());
  const flat = rows.flat().map((c) => String(c ?? "").toLowerCase());
  const showsToday =
    flat.some((cell) => dateForms.some((form) => cell.includes(form))) ||
    // "27 August 2026" / "August 27, 2026", allowing an ordinal suffix.
    flat.some((cell) =>
      new RegExp(
        `(?:\\b${day}(?:st|nd|rd|th)?\\s+${month}\\b|\\b${month}\\s+${day}(?:st|nd|rd|th)?\\b)[^0-9]*${y}`,
      ).test(cell),
    );
  if (!showsToday) return null;

  // The header: a row naming the time columns, one of which is the jamā'ah.
  let timeColumns = null;
  for (const row of rows) {
    const labels = row.filter((c) => !isTimeCell(c));
    if (labels.length !== row.length) continue; // a data row, not a header
    // A header names at least a row-label column and one time column, and its
    // cells are short labels rather than sentences. Both checks exist because
    // these pages carry prose that mentions the very words a header does:
    // Harrow Central Mosque opens with a one-cell banner reading "IQAMAH
    // CHANGES: Fajr: 5:30 AM Isha: 9:30 PM", which was being read as a
    // single-column header and made every real row unparseable.
    if (row.length < 2) continue;
    if (labels.some((c) => String(c).trim().length > 30)) continue;
    const named = labels.filter((c) =>
      /iqam|iqaa?ma|jama|jamaah|jama'ah|congregation/i.test(c),
    );
    if (named.length === 0) continue;
    // Drop the leading "Prayer"/"Salah" column: it labels the rows, not a time.
    const columns = labels.filter(
      (c) => !/^\s*(?:prayer|salah|salat|namaz|صلاة)\b/i.test(c) && c.trim() !== "",
    );
    const index = columns.findIndex((c) =>
      /iqam|iqaa?ma|jama|jamaah|jama'ah|congregation/i.test(c),
    );
    if (index < 0) continue;
    timeColumns = { count: columns.length, index };
    break;
  }
  if (!timeColumns) return null;

  const jamaat = {};
  const take = (prayer, times) => {
    if (!prayer || times.length !== timeColumns.count) return;
    const time = to24Hour(times[timeColumns.index], prayer);
    if (time && !jamaat[prayer]) jamaat[prayer] = time;
  };

  for (const row of rows) {
    let prayer = null;
    let times = [];
    for (const cell of row) {
      if (isTimeCell(cell)) {
        times.push(normaliseTimeCell(cell));
        continue;
      }
      take(prayer, times);
      // A non-time cell starts a new label, even one we don't recognise
      // (Sunrise, Zawal) — which is what stops its time bleeding onto the
      // prayer named next in the same row.
      prayer = prayerKeyFromLabel(cell);
      times = [];
    }
    take(prayer, times);
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

// ---------------------------------------------------------------------------
// Platform fingerprints
//
// Path segments that follow the host but are never a mosque slug: CDN asset
// folders and the platform's own pages. Without this, "first match after the
// host" yields `widgets`, `donations` or `content` on most real sites — a
// mistake that produced 34 confident-looking but entirely junk candidates
// before it was caught.
// ---------------------------------------------------------------------------

const NOT_A_SLUG =
  /^(content|public|assets|static|images|img|css|js|fonts|embed|embeds|api|widget|widgets|loader|applications|donations|awqat-salat|prayer-times|prayertimes|en|ar|fr)$/i;

/**
 * Masjidbox mosque identifiers, in the two shapes it actually publishes:
 *   https://masjidbox.com/prayer-times/<slug>   (embed / share link)
 *   https://masjidbox.net/<slug>                (standalone page)
 * cdn.masjidbox.com serves images only and must never be read as a slug.
 */
export function masjidboxSlugs(html) {
  const slugs = [];
  for (const [, slug] of html.matchAll(
    /masjidbox\.com\/prayer-times\/([a-z0-9][a-z0-9-]{2,79})/gi,
  )) {
    slugs.push(slug);
  }
  for (const [, slug] of html.matchAll(
    /(?<!cdn\.)masjidbox\.net\/([a-z0-9][a-z0-9-]{2,79})/gi,
  )) {
    slugs.push(slug);
  }
  return [...new Set(slugs)].filter((s) => !NOT_A_SLUG.test(s));
}

/** Mawaqit slugs from an embedded widget or link. */
export function mawaqitSlugs(html) {
  const slugs = [];
  for (const [, slug] of html.matchAll(
    /mawaqit\.net\/(?:[a-z]{2}\/)?([a-z0-9][a-z0-9-]{2,79})/gi,
  )) {
    slugs.push(slug);
  }
  return [...new Set(slugs)].filter((s) => !NOT_A_SLUG.test(s));
}

/** Maps a heading like "Zuhr Jamā'ah" or "ISHA" onto our jamaat key. */
export function prayerKeyFromLabel(label) {
  const s = label.toLowerCase();
  if (/\bfajr\b|\bfajar\b/.test(s)) return "fajr";
  if (/\bzuhr\b|\bdhuhr\b|\bduhr\b|\bzohar\b/.test(s)) return "dhuhr";
  if (/\basr\b/.test(s)) return "asr";
  if (/\bmaghrib\b|\bmagrib\b/.test(s)) return "maghrib";
  if (/\bish/.test(s)) return "isha";
  return null;
}

// ---------------------------------------------------------------------------
// Masjidbox
//
// PREFERRED PATH: every masjidbox.net page — both the server-rendered theme
// and the client-rendered one — embeds `window.REDUX_STATE`, a percent-encoded
// JSON blob holding a month of timetable rows. Each row names its own times:
//
//   { date, fajr, sunrise, dhuhr, asr, maghrib, isha,   <- adhan
//     iqamah: { fajr, ..., isha, jumuah: [...] } }      <- JAMAAT, labelled
//
// That is strictly better than reading the rendered grid: the jamaat times are
// labelled rather than positional, the values are ISO datetimes so there is no
// 12-hour ambiguity, and the row carries the date it belongs to. It also works
// on the client-rendered theme, whose HTML contains no times at all.
// ---------------------------------------------------------------------------

/**
 * The REDUX_STATE blob mixes %XX escapes with literal UTF-8 (Arabic month
 * names), which decodeURIComponent rejects outright. Decode to bytes first,
 * then read those bytes as UTF-8.
 */
export function decodePercentMixed(encoded) {
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded[i];
    if (c === "%" && /^[0-9A-Fa-f]{2}$/.test(encoded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of Buffer.from(c, "utf8")) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** The parsed REDUX_STATE from a Masjidbox page, or null. */
export function masjidboxState(html) {
  const m = html.match(/window\.REDUX_STATE\s*=\s*'([^']*)'/);
  if (!m) return null;
  try {
    return JSON.parse(decodePercentMixed(m[1]));
  } catch {
    return null;
  }
}

/**
 * "2026-08-02T04:01:00+01:00" -> "04:01".
 *
 * Read the wall-clock time STRAIGHT OUT OF THE STRING. Never via `new Date`:
 * the offset in these values is the mosque's local time, and the refresh runs
 * on a UTC CI runner, so parsing to a Date and formatting would publish 03:01
 * for a 04:01 jamā'ah every British Summer Time.
 */
export function hhmmFromIso(iso) {
  const m = typeof iso === "string" ? iso.match(/T(\d{2}):(\d{2})/) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Today's date in a named timezone, as "YYYY-MM-DD". */
export function todayInZone(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Is this iqamah earlier than the adhan it belongs to? Both are full ISO
 * datetimes carrying their own offset, so comparing the parsed instants is
 * safe (and correct across midnight) — it is only *formatting* a time in the
 * runner's timezone that would be wrong. Unknown or unparseable adhan means
 * no opinion: keep the time.
 */
function isBeforeAdhan(iqamahIso, adhanIso) {
  if (typeof iqamahIso !== "string" || typeof adhanIso !== "string") return false;
  const iqamah = Date.parse(iqamahIso);
  const adhan = Date.parse(adhanIso);
  if (Number.isNaN(iqamah) || Number.isNaN(adhan)) return false;
  return iqamah < adhan;
}

/**
 * Masjidbox serves two different pages, with the SAME row shape under
 * different keys:
 *
 *   masjidbox.net/<slug>              -> azan.masjidAzan.item        (a month)
 *   masjidbox.com/prayer-times/<slug> -> masjidbox.masjidboxAthany   (a week)
 *
 * The .com page is the one every mosque has; the .net page only exists for
 * mosques that also bought the website product. Reading both means one source
 * covers every Masjidbox masjid instead of the minority with a website.
 */
function masjidboxAthany(state) {
  const net = state?.azan?.masjidAzan?.item;
  if (Array.isArray(net?.timetable)) {
    return { timetable: net.timetable, timezone: net.timezone, name: state?.core?.account?.item?.name };
  }
  const com = state?.masjidbox?.masjidboxAthany;
  if (Array.isArray(com?.timetable)) {
    return {
      timetable: com.timetable,
      timezone: com.settings?.timezone,
      name: com.name,
      closed: com.athany?.closed === true,
    };
  }
  return null;
}

/**
 * Pulls one day's jamā'ah (and Jumu'ah) out of a Masjidbox REDUX_STATE.
 *
 * The row is found by its own `date`, so a stale or short timetable yields
 * nothing rather than yesterday's times.
 *
 * ONLY `iqamah` is read. The row's top-level prayer fields are the adhan, and
 * so is `row.jumuah` — Ilford Islamic Centre calls the Friday adhan at 13:10
 * and holds the prayer at 13:30, and those are separate fields. Falling back
 * from `iqamah.jumuah` to `jumuah` would quietly publish the adhan as the
 * jamā'ah, sending people 20 minutes early.
 */
export function masjidboxDay(state, isoDate) {
  const src = masjidboxAthany(state);
  if (!src || src.closed || src.timetable.length === 0) return null;
  const row = src.timetable.find(
    (r) => typeof r?.date === "string" && r.date.startsWith(isoDate),
  );
  if (!row?.iqamah) return null;

  const jamaat = {};
  for (const key of JAMAAT_KEYS) {
    const time = hhmmFromIso(row.iqamah[key]);
    // A jamā'ah cannot be called before the prayer's time enters. Where the
    // row gives us the adhan, use it: two mosques publish a Fajr jamā'ah of
    // 02:00 and 03:30 against adhans of 03:40-odd, which is a typo in their
    // own dashboard, not a very early congregation. Compare the instants
    // (not the clock faces) so an Isha that runs past midnight survives.
    if (time && isBeforeAdhan(row.iqamah[key], row[key])) continue;
    if (time) jamaat[key] = time;
  }
  // Jumu'ah only exists on Friday rows, and a mosque may hold several.
  const jumuah = [...new Set((row.iqamah.jumuah ?? []).map(hhmmFromIso))]
    .filter(Boolean)
    .sort();

  if (Object.keys(jamaat).length === 0 && jumuah.length === 0) return null;
  return {
    jamaat: Object.keys(jamaat).length > 0 ? jamaat : undefined,
    jumuah: jumuah.length > 0 ? jumuah : undefined,
  };
}

/** The mosque's own timezone, so "today" means today where the masjid is. */
export function masjidboxTimezone(state) {
  const tz = masjidboxAthany(state)?.timezone;
  return typeof tz === "string" && tz.includes("/") ? tz : null;
}

/** How the mosque names itself — used to check a slug is the right masjid. */
export function masjidboxName(state) {
  const name = masjidboxAthany(state)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * FALLBACK for a page with no REDUX_STATE.
 *
 * Masjidbox (masjidbox.net/<slug>) server-renders today's grid as one block
 * per prayer: a title, then exactly two times — Athan then Iqamah. Iqamah is
 * the jamaat time we want.
 *
 * `columns` is [{ title, times: [...] }] — the caller pulls those out of the
 * markup, keeping this pure.
 *
 * ALWAYS index 1, never "the last time": the final column's block runs to the
 * end of the document, so it also picks up the whole month table and the
 * Jumu'ah section. Reading the last value there gave Isha 21:15 for one
 * mosque and 14:15 (a Jumu'ah time) for another — both wrong, both
 * plausible-looking. Extra times beyond the first two are bleed and ignored.
 *
 * A column with only ONE time is skipped: that value could be the athan or
 * the iqamah, and a prayer time is not something to guess at.
 */
export function masjidboxJamaat(columns) {
  const jamaat = {};
  for (const { title, times } of columns) {
    const key = prayerKeyFromLabel(title ?? "");
    if (!key || !Array.isArray(times) || times.length < 2) continue;
    const iqamah = toHHMM(times[1]);
    if (iqamah) jamaat[key] = iqamah;
  }
  return Object.keys(jamaat).length > 0 ? jamaat : null;
}

/** Do two jamaat objects hold the same times? (Avoids pointless writes.) */
export function sameJamaat(a, b) {
  if (!a || !b) return false;
  return JAMAAT_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

export { JAMAAT_KEYS };
