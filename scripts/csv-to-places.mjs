#!/usr/bin/env node
// Converts data/places.csv into src/data/places.json -- the offline dataset
// bundled into the app.
//
// To refresh the bundled data:
//   1. Supabase Dashboard -> Table Editor -> `places` -> Export data -> CSV
//   2. Save it as data/places.csv (replacing the old one)
//   3. Run: npm run build:places
//
// Handles both Supabase export formats for the awkward columns:
//   - facilities / jamaat: JSON objects (jsonb columns)
//   - jumuah_times: JSON array `["13:15","14:15"]` or Postgres array literal
//     `{13:15,14:15}`
//
// No dependencies -- plain Node.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = process.argv[2] ?? join(root, "data", "places.csv");
const outPath = join(root, "src", "data", "places.json");

/** RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function parseBool(value) {
  return ["true", "t", "1", "yes"].includes(String(value).toLowerCase());
}

function parseJson(value, what, id) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Row "${id}": ${what} is not valid JSON: ${value}`);
  }
}

function parseStringArray(value, id) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) return parseJson(trimmed, "array", id);
  // Postgres array literal: {13:15,"14:15"}
  const inner = trimmed.replace(/^\{/, "").replace(/\}$/, "");
  if (!inner) return [];
  return inner.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
}

const csv = readFileSync(csvPath, "utf8");
const [header, ...records] = parseCsv(csv);
const index = Object.fromEntries(header.map((name, i) => [name.trim(), i]));

for (const required of ["id", "name", "type", "address", "lat", "lng", "facilities"]) {
  if (!(required in index)) {
    throw new Error(`places.csv is missing the required column "${required}"`);
  }
}

const OPTIONAL_TEXT_COLUMNS = [
  ["notes", "notes"],
  ["last_verified", "lastVerified"],
  ["source", "source"],
  ["phone", "phone"],
  ["website", "website"],
  ["facebook", "facebook"],
  ["instagram", "instagram"],
  ["confidence", "confidence"],
];

const PLACE_TYPES = new Set(["masjid", "musalla", "multi_faith_room"]);
const FACILITY_KEYS = [
  "sistersSpace",
  "wudu",
  "disabledAccess",
  "parking",
  "jumuah",
  "janazah",
];
const JAMAAT_PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const CONFIDENCE_VALUES = new Set(["verified", "community", "unverified"]);
const URL_COLUMNS = new Set(["website", "facebook", "instagram"]);
const TIME_RE = /^\d{1,2}:\d{2}$/;

/**
 * The app trusts places.json via a plain type cast (src/data/places.ts), so
 * this build step must enforce the full shape, not just "is valid JSON".
 */
function validateFacilities(value, id) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Row "${id}": facilities must be a JSON object`);
  }
  const facilities = {};
  for (const key of FACILITY_KEYS) {
    const v = value[key];
    if (v !== undefined && typeof v !== "boolean") {
      throw new Error(`Row "${id}": facilities.${key} must be true/false, got ${JSON.stringify(v)}`);
    }
    facilities[key] = v === true;
  }
  return facilities;
}

function validateJamaat(value, id) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Row "${id}": jamaat must be a JSON object`);
  }
  if (typeof value.source !== "string" || !value.source) {
    throw new Error(`Row "${id}": jamaat.source is required (where did the times come from?)`);
  }
  if (typeof value.recordedOn !== "string" || !value.recordedOn) {
    throw new Error(`Row "${id}": jamaat.recordedOn is required (ISO date the times were recorded)`);
  }
  const jamaat = { source: value.source, recordedOn: value.recordedOn };
  let hasTime = false;
  for (const key of JAMAAT_PRAYER_KEYS) {
    const t = value[key];
    if (t === undefined) continue;
    if (typeof t !== "string" || !TIME_RE.test(t.trim())) {
      throw new Error(`Row "${id}": jamaat.${key} must be "HH:MM", got ${JSON.stringify(t)}`);
    }
    jamaat[key] = t.trim();
    hasTime = true;
  }
  if (!hasTime) {
    throw new Error(`Row "${id}": jamaat has no prayer times`);
  }
  return jamaat;
}

const seen = new Set();
const places = records.map((record) => {
  const get = (name) => {
    const i = index[name];
    return i === undefined ? "" : (record[i] ?? "").trim();
  };

  const id = get("id");
  const place = {
    id,
    name: get("name"),
    type: get("type"),
    address: get("address"),
    lat: Number(get("lat")),
    lng: Number(get("lng")),
    facilities: validateFacilities(
      parseJson(get("facilities"), "facilities", id),
      id,
    ),
  };

  if (!id || !place.name || Number.isNaN(place.lat) || Number.isNaN(place.lng)) {
    throw new Error(`Bad row (missing id/name or non-numeric lat/lng): ${JSON.stringify(record)}`);
  }
  if (seen.has(id)) {
    throw new Error(`Duplicate id "${id}" in places.csv`);
  }
  seen.add(id);

  if (!PLACE_TYPES.has(place.type)) {
    throw new Error(
      `Row "${id}": unknown type "${place.type}" (expected one of: ${[...PLACE_TYPES].join(", ")})`,
    );
  }

  if (parseBool(get("jumuah_only"))) place.jumuahOnly = true;

  const jumuahTimes = get("jumuah_times");
  if (jumuahTimes) {
    const parsed = parseStringArray(jumuahTimes, id);
    if (parsed.length) place.jumuahTimes = parsed;
  }

  const jamaat = get("jamaat");
  if (jamaat) place.jamaat = validateJamaat(parseJson(jamaat, "jamaat", id), id);

  for (const [csvName, key] of OPTIONAL_TEXT_COLUMNS) {
    const value = get(csvName);
    if (!value) continue;
    if (key === "confidence" && !CONFIDENCE_VALUES.has(value)) {
      throw new Error(
        `Row "${id}": confidence "${value}" is not one of: ${[...CONFIDENCE_VALUES].join(", ")}`,
      );
    }
    if (URL_COLUMNS.has(key) && !/^https?:\/\//i.test(value)) {
      throw new Error(`Row "${id}": ${key} must start with http(s)://, got "${value}"`);
    }
    place[key] = value;
  }

  return place;
});

writeFileSync(outPath, JSON.stringify(places, null, "\t") + "\n");
console.log(`Wrote ${places.length} places to ${outPath}`);
