#!/usr/bin/env node
// Syncs src/data/places.json (the offline fallback bundled into the app)
// from the live Supabase `places` table, so offline users see the real
// dataset rather than a stale sample.
//
//   node scripts/sync-places.mjs
//
// Reads the Supabase URL + anon key from .env (never the service key --
// this only needs the public read policy). Rows are validated with the
// same rules the app enforces at runtime (src/data/placesRepo.ts); invalid
// rows are reported and skipped, never written.
//
// No dependencies -- plain Node 18+ (built-in fetch).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src", "data", "places.json");

// --- read .env (no dotenv dependency) --------------------------------------
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

// --- validation (mirrors src/data/placesRepo.ts) ----------------------------
const PLACE_TYPES = new Set(["masjid", "musalla", "multi_faith_room"]);
const FACILITY_KEYS = ["sistersSpace", "wudu", "disabledAccess", "parking", "jumuah", "janazah"];
const JAMAAT_PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const CONFIDENCE_VALUES = new Set(["verified", "community", "unverified"]);
const TIME_RE = /^\d{1,2}:\d{2}$/;

const str = (v) => (typeof v === "string" && v !== "" ? v : undefined);
const url = (v) => {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

function mapRow(row, problems) {
  if (typeof row.id !== "string" || !row.id) return problems.push("row with no id"), null;
  if (typeof row.name !== "string" || !row.name) return problems.push(`${row.id}: no name`), null;
  if (typeof row.lat !== "number" || !Number.isFinite(row.lat)) return problems.push(`${row.id}: bad lat`), null;
  if (typeof row.lng !== "number" || !Number.isFinite(row.lng)) return problems.push(`${row.id}: bad lng`), null;

  const place = {
    id: row.id,
    name: row.name,
    type: PLACE_TYPES.has(row.type) ? row.type : "musalla",
    address: typeof row.address === "string" ? row.address : "",
    lat: row.lat,
    lng: row.lng,
    facilities: Object.fromEntries(
      FACILITY_KEYS.map((k) => [k, row.facilities?.[k] === true]),
    ),
  };

  if (row.jumuah_only === true) place.jumuahOnly = true;
  if (
    Array.isArray(row.jumuah_times) &&
    row.jumuah_times.length > 0 &&
    row.jumuah_times.every((t) => typeof t === "string")
  ) {
    place.jumuahTimes = row.jumuah_times;
  }
  if (row.jamaat && typeof row.jamaat === "object") {
    const source = str(row.jamaat.source);
    const recordedOn = str(row.jamaat.recordedOn);
    if (source && recordedOn) {
      const jamaat = { source, recordedOn };
      let hasTime = false;
      for (const k of JAMAAT_PRAYER_KEYS) {
        const t = row.jamaat[k];
        if (typeof t === "string" && TIME_RE.test(t.trim())) {
          jamaat[k] = t.trim();
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
  if (CONFIDENCE_VALUES.has(row.confidence)) place.confidence = row.confidence;

  return place;
}

// --- fetch all rows (paginated -- PostgREST caps at 1000/request) ----------
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const res = await fetch(
    `${URL_}/rest/v1/places?select=*&order=id.asc&limit=1000&offset=${offset}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!res.ok) {
    console.error(`Supabase responded ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const page = await res.json();
  rows.push(...page);
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

writeFileSync(outPath, JSON.stringify(places, null, "\t") + "\n");
const kb = Math.round(Buffer.byteLength(JSON.stringify(places)) / 1024);
console.log(`\nWrote ${places.length} places (${kb} KB) to ${outPath}`);
