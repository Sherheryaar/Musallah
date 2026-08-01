#!/usr/bin/env node
// Harvests Jumu'ah times from the mosque websites already in the dataset.
//
//   node scripts/harvest-jummah-times.mjs [--limit N] [--out DIR]
//
// Why Jumu'ah specifically: it is the one prayer whose time is fixed for
// months at a time (so it is worth storing), it is what people most need to
// look up in advance, and mosques almost always publish it on their
// homepage. Daily jamaat times change every day and cannot be usefully
// scraped once into a static dataset.
//
// This script NEVER writes to src/data/places.json. Scraped text is not
// fact: every hit is emitted as a CANDIDATE with the source URL and the
// surrounding snippet so a human can confirm it before it reaches users.
// A wrong jamaat time makes someone miss a prayer, which is far worse than
// having no time at all.
//
// Politeness: one request at a time, throttled, short timeout, honest
// User-Agent, at most a few pages per site.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const outArg = args.indexOf("--out");
const OUT_DIR = outArg >= 0 ? args[outArg + 1] : root;

const UA =
  "MasjidLocatorBot/0.1 (+prayer-times directory; contact via app suggestion form)";
const REQUEST_TIMEOUT_MS = 10_000;
const THROTTLE_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Jumu'ah plausibility window ------------------------------------------
// Jumu'ah replaces Dhuhr, so in the UK it lands between roughly 12:00 and
// 15:00 (earliest winter Dhuhr ~11:50; latest summer sittings ~14:30, with
// a little slack for large mosques running late shifts). Anything outside
// this window is a false positive — usually Fajr, Isha, or a phone number
// that happened to look like a time.
const MIN_MINUTES = 11 * 60 + 30; // 11:30
const MAX_MINUTES = 16 * 60; // 16:00

/** Strip HTML to readable text (no dependencies, good enough for regex). */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|tr|td|th|li|h\d)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a clock time into minutes-from-midnight, resolving the common
 * "1:30" (meaning 13:30) case. Returns null when implausible for Jumu'ah.
 */
function parseTime(hourRaw, minuteRaw, meridiem) {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute > 59) return null;
  const m = (meridiem ?? "").toLowerCase().replace(/[.\s]/g, "");
  if (m === "pm" && hour < 12) hour += 12;
  else if (m === "am" && hour === 12) hour = 0;
  else if (!m && hour >= 1 && hour <= 4) hour += 12; // "1:30" = 13:30
  if (hour > 23) return null;
  const total = hour * 60 + minute;
  if (total < MIN_MINUTES || total > MAX_MINUTES) return null;
  return total;
}

const toHHMM = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// Jumu'ah spelled every way the community spells it, plus "Friday prayer".
const JUMUAH_WORD =
  "(?:jum[u']?[ua]?[h']?a?h?|jummah|jumma|juma'?h?|friday\\s+(?:prayer|salah|salaat|jama'?at))";
// A time, tolerating 13:30 / 1.30 / 1:30pm / 13h30.
const TIME = "(\\d{1,2})\\s*[:.h]\\s*(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?";

/**
 * Find Jumu'ah times in page text. Requires the time to appear within a
 * short distance of a Jumu'ah word — a mosque page lists many times, and
 * proximity is what distinguishes Jumu'ah from Fajr.
 */
function findJumuahTimes(text) {
  const found = new Map(); // "HH:MM" -> snippet
  const patterns = [
    // "Jumu'ah 1:30pm", "Jummah Salah: 13:30", "1st Jummah - 1:00 pm"
    new RegExp(`${JUMUAH_WORD}[^|0-9]{0,40}${TIME}`, "gi"),
    // "1:30pm Jumu'ah" (time first)
    new RegExp(`${TIME}[^|a-z0-9]{0,20}${JUMUAH_WORD}`, "gi"),
  ];
  for (const [index, re] of patterns.entries()) {
    for (const match of text.matchAll(re)) {
      // Group order differs between the two patterns.
      const [h, mi, mer] = index === 0
        ? [match[1], match[2], match[3]]
        : [match[1], match[2], match[3]];
      const mins = parseTime(h, mi, mer);
      if (mins === null) continue;
      const key = toHHMM(mins);
      if (!found.has(key)) {
        const start = Math.max(0, match.index - 40);
        found.set(
          key,
          text.slice(start, match.index + match[0].length + 40).trim(),
        );
      }
    }
  }
  return found;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return { error: `not HTML (${type.split(";")[0] || "unknown"})` };
    }
    return { html: await res.text(), finalUrl: res.url };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Links that look like a prayer timetable, for a second-hop attempt. */
function timetableLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    const label = htmlToText(m[2]);
    if (
      /prayer|timetable|time-table|namaz|namaaz|salah|salaah|jum|friday/i.test(
        href + " " + label,
      )
    ) {
      try {
        const resolved = new URL(href, baseUrl).toString();
        if (/^https?:/i.test(resolved) && !out.includes(resolved)) {
          out.push(resolved);
        }
      } catch {
        // Ignore unparseable hrefs.
      }
    }
  }
  return out.slice(0, 2);
}

// --- main -----------------------------------------------------------------
const places = JSON.parse(
  readFileSync(join(root, "src", "data", "places.json"), "utf8"),
);
const targets = places
  .filter((p) => typeof p.website === "string" && /^https?:/i.test(p.website))
  // Places that already have times don't need re-harvesting.
  .filter((p) => !(Array.isArray(p.jumuahTimes) && p.jumuahTimes.length > 0))
  .slice(0, LIMIT);

console.log(`${targets.length} places with a website and no Jumu'ah time yet.`);

const hits = [];
const misses = [];
let done = 0;

for (const place of targets) {
  done++;
  const first = await fetchText(place.website);
  await sleep(THROTTLE_MS);

  let times = new Map();
  let sourceUrl = place.website;

  if (first.html) {
    times = findJumuahTimes(htmlToText(first.html));
    if (times.size === 0) {
      // Homepage didn't say — try an obvious timetable page.
      for (const link of timetableLinks(first.html, first.finalUrl)) {
        const page = await fetchText(link);
        await sleep(THROTTLE_MS);
        if (!page.html) continue;
        const t = findJumuahTimes(htmlToText(page.html));
        if (t.size > 0) {
          times = t;
          sourceUrl = link;
          break;
        }
      }
    }
  }

  if (times.size > 0) {
    hits.push({
      id: place.id,
      name: place.name,
      address: place.address,
      sourceUrl,
      times: [...times.keys()].sort(),
      evidence: [...times.entries()].map(([time, snippet]) => ({
        time,
        snippet,
      })),
    });
    console.log(`  [${done}/${targets.length}] ${place.name} -> ${[...times.keys()].join(", ")}`);
  } else {
    misses.push({
      id: place.id,
      name: place.name,
      website: place.website,
      reason: first.error ?? "no Jumu'ah time found on page",
    });
    if (done % 25 === 0) {
      console.log(`  [${done}/${targets.length}] ${hits.length} found so far`);
    }
  }
}

// --- output ---------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const multi = hits.filter((h) => h.times.length > 1);
const single = hits.filter((h) => h.times.length === 1);

writeFileSync(
  join(OUT_DIR, "jummah-candidates.json"),
  JSON.stringify({ hits, misses }, null, 2),
);

const report = `# Jumu'ah time candidates

Harvested by scripts/harvest-jummah-times.mjs from mosque websites already
in the dataset. **Nothing here is in the app yet.** Each row shows the page
it came from and the text it matched, so it can be confirmed before users
see it — a wrong jamaat time is worse than no time.

- ${targets.length} websites checked
- **${hits.length} places with at least one candidate time** (${single.length} single, ${multi.length} multiple sittings)
- ${misses.length} with nothing usable found

## Single time (most likely safe to accept)

| Place | Time | Source | Matched text |
|---|---|---|---|
${single
  .map(
    (h) =>
      `| ${h.name.slice(0, 40)} | ${h.times[0]} | [link](${h.sourceUrl}) | ${h.evidence[0].snippet.replace(/\|/g, "/").slice(0, 90)} |`,
  )
  .join("\n")}

## Multiple sittings (check which are current)

| Place | Times | Source | Matched text |
|---|---|---|---|
${multi
  .map(
    (h) =>
      `| ${h.name.slice(0, 40)} | ${h.times.join(", ")} | [link](${h.sourceUrl}) | ${h.evidence.map((e) => e.snippet.replace(/\|/g, "/")).join(" ⁄ ").slice(0, 90)} |`,
  )
  .join("\n")}

## Nothing found

${misses.map((m) => `- ${m.name} (${m.website}) — ${m.reason}`).join("\n")}
`;
writeFileSync(join(OUT_DIR, "jummah-candidates.md"), report);

const today = new Date().toISOString().slice(0, 10);
const sql = `-- Jumu'ah times harvested from mosque websites ${today}
-- by scripts/harvest-jummah-times.mjs. REVIEW BEFORE RUNNING: each line
-- carries the page it came from. Delete any you have not confirmed.
-- After running: npm run sync:places
${hits
  .map(
    (h) =>
      `-- ${h.name} — ${h.sourceUrl}\nupdate public.places set jumuah_times = '${JSON.stringify(h.times)}'::jsonb where id = '${h.id}';`,
  )
  .join("\n")}
`;
writeFileSync(join(OUT_DIR, "apply-jummah-times.sql"), sql);

console.log(
  `\nFound times for ${hits.length}/${targets.length} (${Math.round((hits.length / Math.max(targets.length, 1)) * 100)}%).`,
);
console.log(`Wrote jummah-candidates.md, jummah-candidates.json, apply-jummah-times.sql to ${OUT_DIR}`);
