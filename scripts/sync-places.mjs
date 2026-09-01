#!/usr/bin/env node
// Syncs src/data/places.json from the live Supabase `places` table.
//
// places.json is the PIPELINE's snapshot, never the app's: the harvest and
// verify scripts match against it, and it makes the dataset reviewable in a
// diff. The app itself reads Supabase live and never bundles this file (see
// src/data/places.ts), so a stale snapshot only ever weakens matching.
//
//   node scripts/sync-places.mjs
//
// Reads the Supabase URL + anon key from .env (never the service key --
// this only needs the public read policy). Rows are validated with the
// same SHAPE rules the app enforces at runtime (src/data/placesRepo.ts):
// required fields, coordinate ranges, HH:MM times, known enum values.
// Invalid rows are reported and skipped, never written.
//
// Deliberately NOT applied here, because they are display-time transforms
// the harvest scripts must not match against: cleanAddress, disambiguateName
// and the masjid facility defaults. The snapshot is the raw table, tidied
// only enough to be trustworthy.
//
// No dependencies -- plain Node 18+ (built-in fetch).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { JAMAAT_KEYS, toHHMM } from "./lib/timetable.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src", "data", "places.json");

// --- read .env (no dotenv dependency; real env wins, for CI) ----------------
const env = {};
try {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  // No .env (e.g. CI) — environment variables must carry the values.
}
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

// --- validation (same shape rules as src/data/placesRepo.ts) ----------------
const PLACE_TYPES = new Set(["masjid", "musalla", "multi_faith_room"]);
const FACILITY_KEYS = ["sistersSpace", "wudu", "disabledAccess", "parking", "jumuah", "janazah"];
const CONFIDENCE_VALUES = new Set(["verified", "community", "unverified"]);

const str = (v) => (typeof v === "string" && v !== "" ? v : undefined);
const url = (v) => {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};
const inRange = (v, min, max) => typeof v === "number" && v >= min && v <= max;

function mapRow(row, problems) {
  if (typeof row.id !== "string" || !row.id) return problems.push("row with no id"), null;
  if (typeof row.name !== "string" || !row.name) return problems.push(`${row.id}: no name`), null;
  if (!inRange(row.lat, -90, 90)) return problems.push(`${row.id}: bad lat`), null;
  if (!inRange(row.lng, -180, 180)) return problems.push(`${row.id}: bad lng`), null;

  // Hand-edited rows arrive with "Masjid" or " masjid"; the app normalises
  // those, so the snapshot must too or the two disagree about a place's type.
  const type = typeof row.type === "string" ? row.type.trim().toLowerCase() : row.type;
  const place = {
    id: row.id,
    name: row.name,
    type: PLACE_TYPES.has(type) ? type : "musalla",
    address: typeof row.address === "string" ? row.address : "",
    lat: row.lat,
    lng: row.lng,
    facilities: Object.fromEntries(
      FACILITY_KEYS.map((k) => [k, row.facilities?.[k] === true]),
    ),
  };

  if (row.jumuah_only === true) place.jumuahOnly = true;
  if (Array.isArray(row.jumuah_times) && row.jumuah_times.length > 0) {
    const times = row.jumuah_times.map(toHHMM);
    if (times.every((t) => t !== null)) place.jumuahTimes = times;
    else problems.push(`${row.id}: jumuah_times has a malformed entry (skipped)`);
  }
  if (row.jamaat && typeof row.jamaat === "object") {
    const source = str(row.jamaat.source);
    const recordedOn = str(row.jamaat.recordedOn);
    if (source && recordedOn) {
      const jamaat = { source, recordedOn };
      let hasTime = false;
      for (const k of JAMAAT_KEYS) {
        const t = toHHMM(row.jamaat[k]);
        if (t) {
          jamaat[k] = t;
          hasTime = true;
        }
      }
      if (hasTime) place.jamaat = jamaat;
      else problems.push(`${row.id}: jamaat has no valid times (skipped jamaat)`);
    } else {
      problems.push(`${row.id}: jamaat missing source/recordedOn (skipped jamaat)`);
    }
  }

  for (const [col, key] of [
    ["notes", "notes"],
    ["last_verified", "lastVerified"],
    ["source", "source"],
    ["phone", "phone"],
  ]) {
    const v = str(row[col]);
    if (v) place[key] = v;
  }
  for (const key of ["website", "facebook", "instagram"]) {
    const v = url(row[key]);
    if (v) place[key] = v;
  }
  // Same rule as the app: a PRESENT but unrecognised value is treated as
  // "unverified", never as "not set" (which the app reads as corroborated).
  if (typeof row.confidence === "string" && row.confidence.trim() !== "") {
    const normalized = row.confidence.trim().toLowerCase();
    place.confidence = CONFIDENCE_VALUES.has(normalized) ? normalized : "unverified";
  }

  return place;
}

// --- fetch all rows (paginated -- PostgREST caps at 1000/request) ----------
// Paged by a KEYSET (id > lastSeenId), not offset: an offset re-runs "skip
// N rows" on every request, so a row written elsewhere between two page
// requests shifts every later row's position and the next page silently
// skips or repeats one. Ordering by id makes id > lastSeenId a stable
// cursor regardless of concurrent writes.
const rows = [];
let lastSeenId = null;
for (;;) {
  const filter = lastSeenId ? `&id=gt.${encodeURIComponent(lastSeenId)}` : "";
  const res = await fetch(
    `${URL_}/rest/v1/places?select=*&order=id.asc&limit=1000${filter}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!res.ok) {
    console.error(`Supabase responded ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const page = await res.json();
  if (page.length === 0) break;
  rows.push(...page);
  lastSeenId = page[page.length - 1].id;
  if (page.length < 1000) break;
}

const problems = [];
const places = rows.map((r) => mapRow(r, problems)).filter(Boolean);

if (problems.length) {
  console.warn(`\n${problems.length} row problem(s):`);
  for (const p of problems) console.warn("  - " + p);
}
if (places.length === 0) {
  console.error("No valid places -- refusing to write an empty dataset.");
  process.exit(1);
}

// A schema drift that makes mapRow() reject MOST (not literally all) rows
// must not silently overwrite the snapshot with a gutted one: this
// runs unattended in CI and auto-commits its output (refresh-jummah.yml),
// with no human review gate before the push.
let previousCount = 0;
try {
  previousCount = JSON.parse(readFileSync(outPath, "utf8")).length;
} catch {
  // No previous file (first run ever) -- nothing to compare against.
}
const MIN_RETENTION = 0.9;
if (previousCount > 0 && places.length < previousCount * MIN_RETENTION) {
  console.error(
    `Refusing to write: ${places.length} places is a ${Math.round((1 - places.length / previousCount) * 100)}% drop from the previous ${previousCount}. That looks like a validation/schema problem, not real data loss -- investigate before re-running.`,
  );
  process.exit(1);
}

writeFileSync(outPath, JSON.stringify(places, null, "\t") + "\n");
const kb = Math.round(Buffer.byteLength(JSON.stringify(places)) / 1024);
console.log(`\nWrote ${places.length} places (${kb} KB) to ${outPath}`);
