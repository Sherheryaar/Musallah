#!/usr/bin/env node
// Sanity-checks every place's coordinates against its address postcode
// using postcodes.io (free, no key, bulk lookup). A place whose stored
// point is far from its postcode's centroid either has wrong coordinates
// or a wrong address — both worth a human look.
//
//   node scripts/verify-coords.mjs [report-path.md]
//
// Postcode centroids are precise to ~100 m in cities, so:
//   > 2 km   almost certainly wrong — fix before trusting directions
//   0.5–2 km worth checking (large sites like hospitals can be legitimate)
//   ≤ 0.5 km fine
// Irish addresses (Eircodes) and rows with no postcode can't be checked.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const places = JSON.parse(
  readFileSync(join(root, "src", "data", "places.json"), "utf8"),
);
const reportPath = process.argv[2] ?? join(root, "coord-report.md");

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;

function extractPostcode(address) {
  let match = null;
  for (const m of address.matchAll(POSTCODE_RE)) match = m; // last one wins
  return match ? `${match[1]} ${match[2]}`.toUpperCase() : null;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// --- collect postcodes ------------------------------------------------------
const withPostcode = [];
const unverifiable = [];
for (const p of places) {
  const postcode = extractPostcode(p.address ?? "");
  if (postcode) withPostcode.push({ place: p, postcode });
  else unverifiable.push(p);
}

// --- bulk lookup (100 per request) ------------------------------------------
const centroids = new Map(); // postcode -> {lat,lng} | null
const unique = [...new Set(withPostcode.map((e) => e.postcode))];
console.log(
  `${places.length} places; ${withPostcode.length} with a UK postcode (${unique.length} unique); ${unverifiable.length} unverifiable.`,
);
for (let i = 0; i < unique.length; i += 100) {
  const batch = unique.slice(i, i + 100);
  const res = await fetch("https://api.postcodes.io/postcodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postcodes: batch }),
  });
  if (!res.ok) {
    console.error(`postcodes.io responded ${res.status}`);
    process.exit(1);
  }
  const { result } = await res.json();
  for (const entry of result) {
    // Some postcodes exist but have no geolocation (special/PO-box codes).
    const r = entry.result;
    centroids.set(
      entry.query.toUpperCase(),
      r && typeof r.latitude === "number" && typeof r.longitude === "number"
        ? { lat: r.latitude, lng: r.longitude }
        : null,
    );
  }
  process.stdout.write(`  looked up ${Math.min(i + 100, unique.length)}/${unique.length}\r`);
}
console.log();

// --- classify ----------------------------------------------------------------
const rows = [];
let notFound = 0;
for (const { place, postcode } of withPostcode) {
  const c = centroids.get(postcode);
  if (!c) {
    notFound++;
    continue;
  }
  const km = distanceKm(place.lat, place.lng, c.lat, c.lng);
  rows.push({ place, postcode, km, centroid: c });
}
rows.sort((a, b) => b.km - a.km);

const red = rows.filter((r) => r.km > 2);
const amber = rows.filter((r) => r.km > 0.5 && r.km <= 2);
const ok = rows.filter((r) => r.km <= 0.5);

const line = (r) =>
  `| ${r.place.name.slice(0, 48)} | \`${r.place.id.slice(0, 40)}\` | ${r.postcode} | ${r.km.toFixed(2)} km | ${r.place.lat.toFixed(5)}, ${r.place.lng.toFixed(5)} | ${r.centroid.lat.toFixed(5)}, ${r.centroid.lng.toFixed(5)} |`;

const header =
  "| Name | id | Postcode | Off by | Stored coords | Postcode centroid |\n|---|---|---|---|---|---|";

const report = `# Coordinate verification report

Generated ${new Date().toISOString().slice(0, 10)} by scripts/verify-coords.mjs
(stored coordinates vs. the address postcode's centroid, postcodes.io).

- **${red.length} red flags** (> 2 km — coordinates or address almost certainly wrong)
- **${amber.length} worth checking** (0.5–2 km — can be legitimate for large sites)
- ${ok.length} fine (≤ 0.5 km)
- ${notFound} postcodes unknown to postcodes.io (typo'd or retired postcodes)
- ${unverifiable.length} places with no UK postcode in the address (incl. Ireland)

## Red flags (fix these first)

${header}
${red.map(line).join("\n")}

## Worth checking (0.5–2 km)

${header}
${amber.map(line).join("\n")}

## Postcodes not found

${withPostcode
  .filter((e) => centroids.get(e.postcode) === null)
  .map((e) => `- ${e.place.name} (\`${e.place.id}\`): ${e.postcode}`)
  .join("\n")}

## No postcode in address

${unverifiable.map((p) => `- ${p.name} (\`${p.id}\`): ${p.address || "no address"}`).join("\n")}
`;

writeFileSync(reportPath, report);
console.log(
  `Red: ${red.length}  Amber: ${amber.length}  OK: ${ok.length}  Postcode-not-found: ${notFound}  Unverifiable: ${unverifiable.length}`,
);
console.log(`Report written to ${reportPath}`);
