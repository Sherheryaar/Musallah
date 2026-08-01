#!/usr/bin/env node
// Builds scripts/mawaqit-links.json — the durable place<->Mawaqit link table
// that scripts/refresh-mawaqit-jummah.mjs re-checks on a schedule.
//
//   node scripts/gen-mawaqit-links.mjs <harvest-output-dir>
//
// Reads mawaqit-matches.json + mawaqit-checkpoint.json written by
// scripts/harvest-mawaqit.mjs. Only NAME-AGREEING, non-closed matches are
// linked: proximity alone is not identity (two different mosques can sit
// metres apart), and a wrong link would keep overwriting a place with
// another mosque's Jumu'ah time every week. Matches without a current
// Jumu'ah time ARE linked — if the mosque publishes one later, the weekly
// refresh picks it up.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inDir = process.argv[2];
if (!inDir) {
  console.error("Usage: node scripts/gen-mawaqit-links.mjs <harvest-output-dir>");
  process.exit(1);
}

const { matches } = JSON.parse(
  readFileSync(join(inDir, "mawaqit-matches.json"), "utf8"),
);
const { mosques } = JSON.parse(
  readFileSync(join(inDir, "mawaqit-checkpoint.json"), "utf8"),
);
const bySlug = new Map(mosques.map((m) => [m.slug, m]));

const links = [];
for (const m of matches) {
  if (!m.nameOverlap || m.closed) continue;
  const mosque = bySlug.get(m.mawaqitSlug);
  if (!mosque?.uuid) {
    console.warn(`skipping ${m.placeId}: no checkpoint record for slug ${m.mawaqitSlug}`);
    continue;
  }
  links.push({
    placeId: m.placeId,
    placeName: m.placeName,
    mawaqitUuid: mosque.uuid,
    mawaqitSlug: m.mawaqitSlug,
    mawaqitName: m.mawaqitName,
    // The MOSQUE's own coordinates (not our pin): the refresh script
    // re-queries the search API around this point and matches by uuid.
    lat: Number(mosque.latitude),
    lng: Number(mosque.longitude),
    matchedDistanceM: m.distanceM,
  });
}

links.sort((a, b) => a.placeId.localeCompare(b.placeId));
const outPath = join(root, "scripts", "mawaqit-links.json");
writeFileSync(outPath, JSON.stringify(links, null, 2) + "\n");
console.log(`Wrote ${links.length} links to ${outPath}`);
