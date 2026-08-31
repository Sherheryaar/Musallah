#!/usr/bin/env node
// Harvests mosque IDENTITY (not times) from the Sirat.uk mosque directory
// and matches it against places that have no jamaat/jumu'ah source yet.
//
//   node scripts/harvest-sirat.mjs [--out DIR]
//
// WHY SIRAT.UK: it publishes a keyless, paginated directory of UK mosques
// (https://sirat.uk/mosques/developers) refreshed from public mosque
// sources, independent of anything already in scripts/timetable-links.json.
// As of the run that wrote this comment it covered 605 mosques nationwide,
// against 2,081 of our 2,244 places having no timetable source at all — so
// unlike Mawaqit/Masjidbox (which need a mosque to have signed up to that
// platform), this can fill gaps for mosques that publish times nowhere else
// we can already read.
//
// WHAT THIS SCRIPT DOES, AND WHAT IT DOESN'T:
//   * fetches every mosque's id/name/address/lat/lng (GET /v1/mosques) —
//     never the times themselves. Matching happens ONCE, here; the DAILY
//     fetch is scripts/timetable-sources.mjs's `sirat` provider, keyed by
//     the id captured below. This mirrors harvest-mawaqit.mjs exactly: a
//     harvest establishes identity, a separate live provider fetches times.
//   * only considers places NOT already registered to another source
//     (scripts/timetable-links.json) — Sirat.uk is an aggregator, not the
//     mosque's own platform, so a place already on Mawaqit/Masjidbox/its own
//     site keeps that stronger, mosque-published source.
//   * matches on the SAME thresholds as harvest-mawaqit.mjs: distance alone
//     is only trusted within NEAR_M, anything out to SAME_SITE_M also needs
//     a name-token overlap. Proximity-only matches are held for manual
//     review, never linked automatically — two mosques can sit metres apart.
//   * corroborates identity with the FULL POSTCODE as well as the name, and
//     a name match is not required when the postcodes agree. Very many
//     mosques are known by two unrelated names ("Bangladeshi Cultural
//     Centre" is "Limehouse Masjid"), which no string comparison can ever
//     resolve; the postcode can. On its introduction this turned 62 matches
//     that had been held for review into links, 49 of which produced real
//     prayer times the same day. See scripts/lib/identity.mjs.
//   * refuses to offer a Sirat mosque that already backs another place. One
//     building cannot be two places, and successive additive runs had
//     managed to register mosque-000176 to two of them.
//
// Nothing is written to the registry by this script. Review the report,
// then run scripts/gen-sirat-links.mjs to turn confident matches into
// registry rows.
//
// Attribution: Sirat.uk's dataset is ODC-By 1.0 licensed — anything sourced
// from it must be credited (see app/settings.tsx's About section) and this
// script identifies itself honestly in its User-Agent.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { comparePostcodes } from "./lib/identity.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const OUT_DIR = outArg >= 0 ? args[outArg + 1] : root;

const API = "https://sirat.uk/mosques/v1";
const UA = {
  "User-Agent":
    "MasjidLocatorBot/0.1 (UK masjid directory; crediting Sirat.uk; low volume; +https://github.com/Sherheryaar/Musallah)",
  Accept: "application/json",
};
const PAGE_LIMIT = 1000; // API max; one page comfortably covers today's ~605 mosques
const TIMEOUT_MS = 15_000;
const THROTTLE_MS = 600; // well under the documented 120 req/min per-origin limit
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A wrong match writes another mosque's jamā'ah time onto a place, so these
// are deliberately tight — tighter than harvest-mawaqit.mjs's SAME_SITE_M,
// because Sirat.uk names often fold in the mosque's town ("Banbury ...",
// "... bi Manchester"), and a shared town name is not evidence of shared
// identity. Widening this past 150m in testing matched "Banbury Makkah
// Masjid" to "Banbury Sheikh Bin Baaz Masjid" and "Markaz as-Salafi bi
// Manchester" to "Al-Sunnah Mosque Manchester" — different mosques that
// happen to share a town.
const NEAR_M = 60; // this close: accept on distance alone
const SAME_SITE_M = 150; // within this: require a name-token overlap

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

const STOPWORDS = new Set([
  "masjid", "mosque", "islamic", "centre", "center", "muslim", "trust",
  "association", "society", "cultural", "education", "educational", "the",
  "and", "of", "jamia", "jame", "jami", "jamie", "madrassa", "madressa",
  "academy", "institute", "uk", "ltd", "welfare", "prayer", "room",
  "musalla", "musallah", "mussalla", "hall", "al", "e",
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

/**
 * How many edits a token of this length may differ by and still count as
 * the same word. Deliberately stingy below 8 characters: at budget 2, a
 * 5-character word like "sunni" is within edit distance of "sunnah" —
 * theologically unrelated terms that happened to collide in testing.
 */
function editBudget(length) {
  if (length >= 8) return 2;
  if (length >= 5) return 1;
  return 0; // short tokens must match exactly, never fuzzily
}

/**
 * Bounded edit distance, so transliteration variants still match — counting
 * an adjacent-letter transposition as ONE edit (Damerau, not plain
 * Levenshtein). Without that, "Sawfia" vs "Swafia" (a transposed pair that
 * really is the same word) costs 2 and gets rejected at the same budget
 * that must reject "sunni" vs "sunnah" (which has no transposition and
 * should stay rejected).
 */
function withinEdits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2 = null;
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
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1] &&
        prev2
      ) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    [prev2, prev, curr] = [prev, curr, prev2 ?? new Array(b.length + 1)];
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

function namesOverlap(a, b) {
  const ta = [...nameTokens(a)];
  const tb = [...nameTokens(b)];
  if (ta.length === 0 || tb.length === 0) {
    const fa = flatten(a);
    const fb = flatten(b);
    if (!fa || !fb) return false;
    return fa.includes(fb) || fb.includes(fa);
  }
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) return true;
      const budget = Math.min(editBudget(x.length), editBudget(y.length));
      if (budget > 0 && withinEdits(x, y, budget)) return true;
    }
  }
  return false;
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { json: await res.json() };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// --- fetch every mosque the directory has ------------------------------------
const mosques = [];
let offset = 0;
for (;;) {
  const { json, error } = await getJson(
    `${API}/mosques?limit=${PAGE_LIMIT}&offset=${offset}`,
  );
  if (error) {
    console.error(`Sirat.uk fetch failed at offset ${offset}: ${error}`);
    process.exit(1);
  }
  const page = Array.isArray(json) ? json : [];
  mosques.push(...page);
  if (page.length < PAGE_LIMIT) break;
  offset += PAGE_LIMIT;
  await sleep(THROTTLE_MS);
}
console.log(`Fetched ${mosques.length} mosque(s) from Sirat.uk.`);

// --- candidates: places with no timetable source at all ---------------------
const places = JSON.parse(
  readFileSync(join(root, "src", "data", "places.json"), "utf8"),
);
const registry = JSON.parse(
  readFileSync(join(root, "scripts", "timetable-links.json"), "utf8"),
);
const alreadyRegistered = new Set(registry.map((l) => l.placeId));
const candidates = places.filter((p) => !alreadyRegistered.has(p.id));
// A Sirat mosque already backing one of our places is not available to back a
// second: it is one building, and two places cannot both be it. Without this
// the harvest happily re-offers a taken record to the next-nearest place, and
// because the two are often on one site with a shared postcode, the postcode
// signal agrees and it looks confident. That is how mosque-000471 came to be
// registered to both Aylesbury places.
const takenSiratIds = new Set(
  registry.filter((l) => l.source === "sirat").map((l) => l.siratId),
);
const available = mosques.filter((m) => !takenSiratIds.has(m.id));
console.log(
  `${places.length} places total, ${alreadyRegistered.size} already have a source, ${candidates.length} candidate(s) for Sirat.uk.`,
);
if (available.length < mosques.length) {
  console.log(
    `${mosques.length - available.length} Sirat mosque(s) already back a place — not offered again.`,
  );
}

// --- match: for each Sirat mosque, the nearest eligible place ---------------
const matches = [];
const unmatchedMosques = [];

for (const m of available) {
  const mLat = Number(m.lat);
  const mLng = Number(m.lng);
  if (!Number.isFinite(mLat) || !Number.isFinite(mLng) || !m.id || !m.name) {
    continue;
  }

  let best = null;
  for (const p of candidates) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
    const d = distanceM(mLat, mLng, p.lat, p.lng);
    if (d > SAME_SITE_M) continue;
    const overlap = namesOverlap(m.name, p.name);
    if (d > NEAR_M && !overlap) continue;
    const score = d - (overlap ? 100 : 0); // prefer name agreement over raw distance
    if (!best || score < best.score) {
      best = { place: p, distance: d, overlap, score };
    }
  }

  if (!best) {
    unmatchedMosques.push({ id: m.id, name: m.name, lat: mLat, lng: mLng });
    continue;
  }

  matches.push({
    placeId: best.place.id,
    placeName: best.place.name,
    placeType: best.place.type,
    siratId: m.id,
    siratName: m.name,
    siratAddress: m.address,
    distanceM: Math.round(best.distance),
    nameOverlap: best.overlap,
    // Third signal, independent of both distance and name — see
    // scripts/lib/identity.mjs for why it outranks a name-token overlap.
    postcode: comparePostcodes(best.place.address, m.address),
  });
}

// One Sirat mosque per place: if two matched the same place, the tighter
// match wins and the other is reported for manual review.
const byPlace = new Map();
const duplicates = [];
for (const match of matches.sort((a, b) => a.distanceM - b.distanceM)) {
  if (byPlace.has(match.placeId)) duplicates.push(match);
  else byPlace.set(match.placeId, match);
}

/**
 * Is this match strong enough to register without a human deciding?
 *
 * Two independent routes to yes, because the two signals fail in different
 * places (scripts/lib/identity.mjs explains both at length):
 *   * the names agree — the original rule
 *   * the full postcodes agree — catches every mosque known by a second
 *     name, which no name matcher can ever resolve
 *
 * And one veto: a different postal DISTRICT blocks the match even when the
 * names agree, because that is two different addresses rather than two
 * spellings of one. Note it is only the district that vetoes — a
 * same-district, different-unit pair is routine noise between two datasets
 * describing one building, and treating that as a mismatch would demote 37
 * of the 38 such links found when the existing registry was audited.
 */
const isConfident = (m) =>
  m.postcode !== "differ-district" &&
  (m.nameOverlap || m.postcode === "agree");

// Only NAME-AGREEING matches are considered confident, same rule as
// harvest-mawaqit.mjs and for the same reason: in dense areas two different
// mosques can sit metres apart, and writing another mosque's jamā'ah time
// onto a place would send someone to pray at the wrong time.
const confident = [...byPlace.values()].filter(isConfident);
const needsReview = [...byPlace.values()].filter((m) => !isConfident(m));

// --- output -------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "sirat-matches.json"),
  JSON.stringify(
    {
      mosquesFetched: mosques.length,
      candidatePlaces: candidates.length,
      // `confident` is stamped here, not recomputed downstream: the rule that
      // decides what gets registered lives in exactly one place (isConfident
      // above), so gen-sirat-links.mjs cannot drift away from it.
      matches: [...byPlace.values()].map((m) => ({
        ...m,
        confident: isConfident(m),
      })),
      duplicates,
      unmatchedMosques,
    },
    null,
    2,
  ),
);

const POSTCODE_LABEL = {
  agree: "same",
  "differ-unit": "same district",
  "differ-district": "**DIFFERENT district**",
  unknown: "—",
};
const row = (m) =>
  `| ${m.placeName.slice(0, 40)} | ${m.distanceM} m | ${m.nameOverlap ? "yes" : "no"} | ${POSTCODE_LABEL[m.postcode]} | ${m.siratName.slice(0, 34)} | \`${m.siratId}\` |`;
const header =
  "| Place | Gap | Name match | Postcode | Sirat.uk record | id |\n|---|---|---|---|---|---|";

const vetoed = needsReview.filter(
  (m) => m.postcode === "differ-district" && m.nameOverlap,
);

const report = `# Sirat.uk mosque matches

Harvested by scripts/harvest-sirat.mjs. This is a THIRD-PARTY DIRECTORY, not
a platform mosques publish to directly, so identity here is geo+name
matched rather than mosque-entered — treat it with the same caution as a
proximity match, even for the confident bucket.

**Nothing is in the registry until scripts/gen-sirat-links.mjs is run.**
Sirat.uk must be credited (ODC-By 1.0) in the About screen for anything
sourced from it.

- ${mosques.length} mosques fetched from Sirat.uk
- ${candidates.length} of our places had no timetable source at all (the only ones considered)
- ${byPlace.size} matched to one of our places
- **${confident.length} confident match(es)** (the name agrees, or the full postcode does) — these are what \`gen-sirat-links.mjs\` will register
- ${needsReview.length} held back, not registered${vetoed.length ? ` — including ${vetoed.length} whose NAMES agree but which sit in a different postal district, vetoed on purpose` : ""}
- ${duplicates.length} ambiguous (two Sirat.uk records near one place) — review by hand
- ${unmatchedMosques.length} Sirat.uk mosques matched none of our places — possible gaps in our dataset (or already covered by another source)

## Confident matches — would gain a jamaat/jumu'ah source (${confident.length})

${header}
${confident.map(row).join("\n") || "_none_"}

## Held back — NOT registered, confirm by hand (${needsReview.length})

Either the pins are close but neither the names nor the postcodes agree (so
these could be two different mosques near each other), or the postcodes
positively disagree — which vetoes the match even when the names look right,
because two different full postcodes are two different addresses.

${header}
${needsReview.map(row).join("\n") || "_none_"}

## Ambiguous matches (review by hand, ${duplicates.length})

${
  duplicates
    .map(
      (m) =>
        `- ${m.placeName} (\`${m.placeId}\`) also matched "${m.siratName}" (\`${m.siratId}\`) at ${m.distanceM} m`,
    )
    .join("\n") || "_none_"
}

## Sirat.uk mosques with no match in our dataset (${unmatchedMosques.length})

Check each against the dataset policy before treating any of these as a
missing place — some may already be covered under a different name/pin, or
may not meet the bar for inclusion.

${unmatchedMosques
  .slice(0, 200)
  .map((m) => `- ${m.name} (\`${m.id}\`) — ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`)
  .join("\n")}
${unmatchedMosques.length > 200 ? `\n_(${unmatchedMosques.length - 200} more, truncated — see sirat-matches.json)_` : ""}
`;
writeFileSync(join(OUT_DIR, "sirat-report.md"), report);

console.log(
  `\nMatched ${byPlace.size} places (${confident.length} confident, ${needsReview.length} held for review, ${duplicates.length} ambiguous).`,
);
console.log(`Reports written to ${OUT_DIR}`);
