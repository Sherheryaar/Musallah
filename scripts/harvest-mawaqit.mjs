#!/usr/bin/env node
// Harvests Jumu'ah times from Mawaqit, matched against our own places.
//
//   node scripts/harvest-mawaqit.mjs [--limit N] [--out DIR]
//
// WHY MAWAQIT: mawaqit.net is the prayer-times platform a large share of UK
// mosques use to publish their own timetables. The data is entered by the
// mosques themselves, which makes it far better evidence than scraping
// times out of homepage HTML (see scripts/harvest-jummah-times.mjs, which
// managed ~8%: most mosque sites render times with JavaScript widgets).
// Their public search endpoint returns, per mosque: name, coordinates,
// contact details, a `jumua` time, today's daily times, facility flags, and
// a `closed` flag.
//
// WHAT WE IMPORT, AND WHAT WE DELIBERATELY DON'T:
//   * jumua / jumua2  -> imported. A mosque's Jumu'ah sitting is stable for
//     months, so a stored value stays true and is what people plan around.
//   * daily times     -> recorded in the JSON output for future work, but
//     NOT imported. They change every single day, so a snapshot baked into
//     the bundled dataset would be wrong within a week. Serving those needs
//     a live fetch with a "published by the mosque, fetched today" label.
//   * facility flags / closed -> reported as corroboration for the place
//     audit, never auto-applied.
//
// ATTRIBUTION: anything imported must be credited to Mawaqit in the app's
// About screen, and this script identifies itself honestly. Check Mawaqit's
// terms before shipping an import, and consider asking them directly —
// a community directory crediting them is plausibly something they'd
// support, and an agreed feed beats scraping.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const numArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const LIMIT = numArg("--limit", Infinity);
const outArg = args.indexOf("--out");
const OUT_DIR = outArg >= 0 ? args[outArg + 1] : root;

const API = "https://mawaqit.net/api/2.0/mosque/search";
const UA = {
  "User-Agent":
    "MasjidLocatorBot/0.1 (UK masjid directory; crediting Mawaqit; low volume)",
  Accept: "application/json",
};
// Mawaqit rate-limits: a first run at 700 ms went fine for ~110 requests
// and then returned HTTP 429 for everything after. So the harvest is
// RESUMABLE — completed cells are checkpointed to disk and skipped next
// time, and a 429 backs the pace off instead of burning through the run.
// Several polite runs accumulate full coverage; one greedy run cannot.
const THROTTLE_MS = 2500;
const MAX_THROTTLE_MS = 30_000;
const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const CHECKPOINT_EVERY = 20;
// If the quota is simply spent, grinding through retries for hours is both
// pointless and rude. Stop cleanly after this many consecutive rate-limited
// cells; the checkpoint means a later run picks up exactly where this left
// off. Reports are still written from whatever has been collected so far.
const GIVE_UP_AFTER_CONSECUTIVE_LIMITS = 5;

// Search queries are deduped onto a ~2 km grid: each call returns the
// mosques nearest that point, so one call covers a neighbourhood.
const GRID_DEG = 0.02;

// Match thresholds. A wrong match writes another mosque's Jumu'ah time onto
// a place, so these are deliberately tight.
const NEAR_M = 60; // this close: accept on distance alone
const SAME_SITE_M = 250; // within this: require a name-token overlap
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Words that appear in half the dataset and so prove nothing about identity.
const STOPWORDS = new Set([
  "masjid", "mosque", "islamic", "centre", "center", "muslim", "trust",
  "association", "community", "society", "cultural", "education",
  "educational", "the", "and", "of", "jamia", "jame", "jami", "jamie",
  "madrassa", "madressa", "academy", "institute", "uk", "ltd", "welfare",
  "prayer", "room", "musalla", "musallah", "mussalla", "hall", "al", "e",
]);

function nameTokens(name) {
  return new Set(
    name
      .toLowerCase()
      .replace(/['’`]/g, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Bounded edit distance, so transliteration variants still match. */
function withinEdits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] <= max;
}

const flatten = (name) =>
  name
    .toLowerCase()
    .replace(/['’`]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Do two names plausibly describe the same organisation? Transliteration
 * varies wildly in this domain ("Masjid al-Falah" / "Masjid Alfalah",
 * "Hidayah" / "Hadayat"), so distinctive tokens are compared with a small
 * edit budget rather than exactly.
 */
function namesOverlap(a, b) {
  const ta = [...nameTokens(a)];
  const tb = [...nameTokens(b)];
  if (ta.length === 0 || tb.length === 0) {
    // Both names are entirely generic ("Islamic Cultural Centre" vs
    // "Islamic Cultural Centre (Wembley)"): fall back to containment.
    const fa = flatten(a);
    const fb = flatten(b);
    if (!fa || !fb) return false;
    return fa.includes(fb) || fb.includes(fa);
  }
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) return true;
      const budget = Math.min(x.length, y.length) >= 5 ? 2 : 1;
      if (withinEdits(x, y, budget)) return true;
    }
  }
  return false;
}

function toHHMM(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  // Jumu'ah sits around midday; anything else is a data-entry error.
  const total = h * 60 + min;
  if (total < 11 * 60 || total > 16 * 60 + 30) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

let throttleMs = THROTTLE_MS;

async function requestOnce(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?lat=${lat}&lon=${lng}`, {
      headers: UA,
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      return {
        rateLimited: true,
        waitMs: Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : null,
      };
    }
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return { mosques: Array.isArray(json) ? json : [] };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search with backoff. Returns { mosques }, or { error }, or
 * { rateLimited: true } when the quota looks spent.
 */
async function searchNear(lat, lng) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await requestOnce(lat, lng);
    if (!result.rateLimited) {
      // Ease the pace back down after a clean run of successes.
      if (result.mosques && throttleMs > THROTTLE_MS) {
        throttleMs = Math.max(THROTTLE_MS, Math.round(throttleMs * 0.9));
      }
      return result;
    }
    // Rate limited: slow the whole harvest down, then wait it out.
    throttleMs = Math.min(MAX_THROTTLE_MS, Math.round(throttleMs * 1.8));
    const wait = result.waitMs ?? throttleMs * (attempt + 1);
    console.log(
      `    rate limited — waiting ${Math.round(wait / 1000)}s (pace now ${throttleMs}ms)`,
    );
    await sleep(wait);
  }
  return { rateLimited: true, error: "HTTP 429 after retries" };
}

// --- gather -----------------------------------------------------------------
const places = JSON.parse(
  readFileSync(join(root, "src", "data", "places.json"), "utf8"),
);

const cells = new Map(); // "lat:lng" -> {lat,lng}
for (const p of places) {
  const key = `${Math.round(p.lat / GRID_DEG)}:${Math.round(p.lng / GRID_DEG)}`;
  if (!cells.has(key)) {
    cells.set(key, {
      lat: Math.round(p.lat / GRID_DEG) * GRID_DEG,
      lng: Math.round(p.lng / GRID_DEG) * GRID_DEG,
    });
  }
}
// Checkpoint: which cells have been queried, and every mosque seen so far.
// Lives next to the reports so a run can be stopped and resumed freely.
const checkpointPath = join(OUT_DIR, "mawaqit-checkpoint.json");
const mosques = new Map(); // uuid -> mosque
const doneCells = new Set();
if (existsSync(checkpointPath)) {
  try {
    const saved = JSON.parse(readFileSync(checkpointPath, "utf8"));
    for (const key of saved.doneCells ?? []) doneCells.add(key);
    for (const m of saved.mosques ?? []) if (m?.uuid) mosques.set(m.uuid, m);
    console.log(
      `Resuming: ${doneCells.size} cells already queried, ${mosques.size} mosques known.`,
    );
  } catch {
    console.log("Checkpoint unreadable — starting fresh.");
  }
}

const saveCheckpoint = () => {
  mkdirSync(OUT_DIR, { recursive: true });
  // Write-then-rename, not a direct write: this runs after every cell (see
  // callers below), and a process kill mid-write would otherwise truncate
  // the checkpoint file, silently erasing every cell already collected --
  // exactly the "costs one cell, not the whole run" guarantee this file
  // documents. rename() replaces the destination atomically.
  const tmpPath = `${checkpointPath}.tmp`;
  writeFileSync(
    tmpPath,
    JSON.stringify(
      { doneCells: [...doneCells], mosques: [...mosques.values()] },
      null,
      1,
    ),
  );
  renameSync(tmpPath, checkpointPath);
};

const pending = [...cells.entries()]
  .filter(([key]) => !doneCells.has(key))
  .slice(0, LIMIT);
console.log(
  `${places.length} places -> ${cells.size} grid cells total; ${pending.length} still to query this run.`,
);

let failures = 0;
let queried = 0;
// Save progress even if the run is interrupted.
process.on("SIGINT", () => {
  saveCheckpoint();
  console.log("\nInterrupted — checkpoint saved. Re-run to continue.");
  process.exit(130);
});

let consecutiveLimits = 0;
let quotaSpent = false;
for (const [key, cell] of pending) {
  const { mosques: found, error, rateLimited } = await searchNear(
    cell.lat,
    cell.lng,
  );
  queried++;
  if (error) {
    failures++;
    // Leave the cell unmarked so a later run retries it.
    if (failures <= 5) console.log(`  cell ${key}: ${error}`);
    consecutiveLimits = rateLimited ? consecutiveLimits + 1 : 0;
    if (consecutiveLimits >= GIVE_UP_AFTER_CONSECUTIVE_LIMITS) {
      quotaSpent = true;
      console.log(
        `\nRate limit persists after ${consecutiveLimits} cells — stopping here.`,
      );
      break;
    }
  } else {
    consecutiveLimits = 0;
    doneCells.add(key);
    for (const m of found) {
      if (m && m.uuid && !mosques.has(m.uuid)) mosques.set(m.uuid, m);
    }
  }
  if (queried % CHECKPOINT_EVERY === 0) {
    saveCheckpoint();
    console.log(
      `  ${queried}/${pending.length} this run · ${doneCells.size}/${cells.size} cells done · ${mosques.size} mosques · ${failures} failures`,
    );
  }
  await sleep(throttleMs);
}
saveCheckpoint();
console.log(
  `\nCollected ${mosques.size} unique Mawaqit mosques (${doneCells.size}/${cells.size} cells done).`,
);
if (doneCells.size < cells.size) {
  console.log(
    `${cells.size - doneCells.size} cells still outstanding — run again later to continue from the checkpoint${quotaSpent ? " (rate limit needs time to reset)" : ""}.`,
  );
}

// --- match ------------------------------------------------------------------
const matches = [];
const unmatchedMosques = [];
const usedPlaceIds = new Set();

for (const m of mosques.values()) {
  const mLat = Number(m.latitude);
  const mLng = Number(m.longitude);
  if (!Number.isFinite(mLat) || !Number.isFinite(mLng)) continue;

  let best = null;
  for (const p of places) {
    const d = distanceM(mLat, mLng, p.lat, p.lng);
    if (d > SAME_SITE_M) continue;
    const overlap = namesOverlap(m.name ?? "", p.name);
    if (d > NEAR_M && !overlap) continue;
    const score = d - (overlap ? 100 : 0); // prefer name agreement
    if (!best || score < best.score) {
      best = { place: p, distance: d, overlap, score };
    }
  }

  if (!best) {
    unmatchedMosques.push({
      name: m.name,
      slug: m.slug,
      lat: mLat,
      lng: mLng,
      jumua: m.jumua,
    });
    continue;
  }

  const jumuahTimes = [m.jumua, m.jumua2, m.jumua3]
    .map(toHHMM)
    .filter((t, i, arr) => t !== null && arr.indexOf(t) === i);

  matches.push({
    placeId: best.place.id,
    placeName: best.place.name,
    placeAddress: best.place.address,
    existingTimes: best.place.jumuahTimes ?? [],
    mawaqitName: m.name,
    mawaqitSlug: m.slug,
    distanceM: Math.round(best.distance),
    nameOverlap: best.overlap,
    jumuahTimes,
    closed: m.closed === true,
    // Recorded for a future live-fetch feature, deliberately not imported.
    dailyTimesSnapshot: m.times ?? null,
    facilityFlags: {
      womenSpace: m.womenSpace,
      janazaPrayer: m.janazaPrayer,
      handicapAccessibility: m.handicapAccessibility,
      ablutions: m.ablutions,
    },
  });
  usedPlaceIds.add(best.place.id);
}

// One Mawaqit mosque per place: if two matched the same place, the tighter
// match wins and the other is reported for manual review.
const byPlace = new Map();
const duplicates = [];
for (const match of matches.sort((a, b) => a.distanceM - b.distanceM)) {
  if (byPlace.has(match.placeId)) duplicates.push(match);
  else byPlace.set(match.placeId, match);
}
// Only NAME-AGREEING matches may be imported automatically. Proximity alone
// is not enough: in dense areas two different mosques sit metres apart (a
// 50 m "Salahuddin Mosque" / "Masjid Bilal" pairing in testing was two
// separate places on one street), and writing another mosque's Jumu'ah time
// onto a place would make someone miss the prayer.
const confident = [...byPlace.values()].filter(
  (m) => m.jumuahTimes.length > 0 && !m.closed && m.nameOverlap,
);
const needsReview = [...byPlace.values()].filter(
  (m) => m.jumuahTimes.length > 0 && !m.closed && !m.nameOverlap,
);
const newTimes = confident.filter((m) => m.existingTimes.length === 0);

// --- output -----------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "mawaqit-matches.json"),
  JSON.stringify(
    {
      cellsDone: doneCells.size,
      cellsTotal: cells.size,
      uniqueMosques: mosques.size,
      matches: [...byPlace.values()],
      duplicates,
      unmatchedMosques,
    },
    null,
    2,
  ),
);

const row = (m) =>
  `| ${m.placeName.slice(0, 38)} | ${m.jumuahTimes.join(", ")} | ${m.distanceM} m | ${m.nameOverlap ? "yes" : "no"} | ${m.mawaqitName.slice(0, 34)} |`;
const header =
  "| Place | Jumu'ah | Gap | Name match | Mawaqit record |\n|---|---|---|---|---|";

const report = `# Jumu'ah times from Mawaqit

Harvested by scripts/harvest-mawaqit.mjs. Times are published by the mosques
themselves on mawaqit.net, so this is mosque-managed data rather than
scraped guesswork — but each row still shows the distance between our pin
and theirs, and whether the names agree, so a mismatch is visible.

**Nothing is in the app until the SQL is run.** Mawaqit must be credited in
the About screen for anything imported.

- ${doneCells.size} of ${cells.size} grid cells queried${doneCells.size < cells.size ? " (**incomplete** — re-run to continue from the checkpoint)" : ""}, ${mosques.size} unique Mawaqit mosques found
- ${byPlace.size} matched to our places
- **${newTimes.length} places would gain a Jumu'ah time** (we currently have ${places.filter((p) => p.jumuahTimes?.length).length} in total)
- ${confident.length - newTimes.length} matched places already had times (cross-check these)
- ${needsReview.length} matched on PROXIMITY ONLY with different names — held back for review, not in the SQL
- ${duplicates.length} ambiguous (two Mawaqit records near one place) — review by hand
- ${unmatchedMosques.length} Mawaqit mosques matched nothing in our data — possible gaps in our dataset
- ${[...byPlace.values()].filter((m) => m.closed).length} matched records are flagged CLOSED on Mawaqit — check these

## New Jumu'ah times (${newTimes.length})

${header}
${newTimes.map(row).join("\n")}

## Already had times — cross-check for drift

${header}
${confident
  .filter((m) => m.existingTimes.length > 0)
  .map((m) => `${row(m)} (ours: ${m.existingTimes.join(", ")})`)
  .join("\n")}

## Proximity-only matches — NOT imported, confirm by hand (${needsReview.length})

The pins are close but the names don't agree, so these could be two
different mosques near each other. Confirm each before using the time.

${header}
${needsReview.map(row).join("\n")}

## Flagged closed on Mawaqit

${
  [...byPlace.values()]
    .filter((m) => m.closed)
    .map((m) => `- ${m.placeName} (\`${m.placeId}\`) — Mawaqit: ${m.mawaqitName}`)
    .join("\n") || "_none_"
}

## Ambiguous matches (review by hand)

${
  duplicates
    .map(
      (m) =>
        `- ${m.placeName} (\`${m.placeId}\`) also matched "${m.mawaqitName}" at ${m.distanceM} m`,
    )
    .join("\n") || "_none_"
}

## Mawaqit mosques with no match in our dataset (${unmatchedMosques.length})

These are candidates for places we are missing. Check each against the
dataset policy before adding anything.

${unmatchedMosques
  .map(
    (m) =>
      `- ${m.name} — ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}${m.jumua ? ` (Jumu'ah ${m.jumua})` : ""}`,
  )
  .join("\n")}
`;
writeFileSync(join(OUT_DIR, "mawaqit-jummah-report.md"), report);

/**
 * Safe to place after `-- ` on one line of the generated SQL: Mawaqit's
 * `name` is untrusted, and a literal newline in it would close the `--`
 * comment early, turning the `update ...;` that follows into LIVE SQL the
 * moment a human runs this file per the documented workflow.
 */
const sqlComment = (text) => text.replace(/[\r\n]+/g, " ");
/** Safe inside a single-quoted SQL string literal. */
const sqlLiteral = (text) => text.replace(/'/g, "''");

const today = new Date().toISOString().slice(0, 10);
const sql = `-- Jumu'ah times from Mawaqit (mosque-published), harvested ${today}
-- by scripts/harvest-mawaqit.mjs.
--
-- Included ONLY where the mosque name agrees with ours AND the place had no
-- Jumu'ah time. Proximity-only matches are deliberately excluded (see the
-- report's "Proximity-only matches" section) because two different mosques
-- can sit metres apart.
--
-- Review, then run, then: npm run sync:places
-- Credit Mawaqit in the app's About screen for this data.
${newTimes
  .map(
    (m) =>
      `-- ${sqlComment(m.placeName)} <- "${sqlComment(m.mawaqitName)}" (${m.distanceM} m, names agree)\nupdate public.places set jumuah_times = '${JSON.stringify(m.jumuahTimes)}'::jsonb where id = '${sqlLiteral(m.placeId)}';`,
  )
  .join("\n")}
`;
writeFileSync(join(OUT_DIR, "apply-mawaqit-jummah.sql"), sql);

console.log(
  `\nMatched ${byPlace.size} places; ${newTimes.length} would gain a Jumu'ah time (${needsReview.length} held for review).`,
);
console.log(`Reports written to ${OUT_DIR}`);
