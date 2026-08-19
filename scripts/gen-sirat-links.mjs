#!/usr/bin/env node
// Turns confident matches from scripts/harvest-sirat.mjs into registry rows
// in scripts/timetable-links.json — mirrors scripts/gen-mawaqit-links.mjs.
// Entries belonging to other sources are preserved untouched: Sirat.uk is
// one provider among several, not the registry's owner.
//
//   node scripts/gen-sirat-links.mjs <harvest-output-dir>
//
// Only NAME-AGREEING matches (harvest's "confident" bucket) are linked.
// Proximity-only and ambiguous matches are deliberately left out of the
// registry — see sirat-report.md for those, and add them by hand only after
// checking each one is the right mosque.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inDir = process.argv[2];
if (!inDir) {
  console.error("Usage: node scripts/gen-sirat-links.mjs <harvest-output-dir>");
  process.exit(1);
}

const { matches } = JSON.parse(
  readFileSync(join(inDir, "sirat-matches.json"), "utf8"),
);

const links = matches
  .filter((m) => m.nameOverlap)
  .map((m) => ({
    placeId: m.placeId,
    source: "sirat",
    placeName: m.placeName,
    siratId: m.siratId,
    siratName: m.siratName,
    matchedDistanceM: m.distanceM,
  }));

const outPath = join(root, "scripts", "timetable-links.json");
const existing = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, "utf8"))
  : [];
// ADDITIVE, deliberately. This used to rebuild the sirat rows from scratch
// (`existing.filter(l => l.source !== "sirat")` plus this harvest's matches),
// which is only safe if a harvest can see every sirat candidate — and it
// cannot: harvest-sirat.mjs restricts itself to places that have NO source
// yet, so anything already registered is invisible to it. A second run
// therefore wrote back only the handful of newly-found matches and dropped
// the rest, taking the registry from 523 entries to 165 and leaving those
// mosques to freeze at whatever times were last written.
//
// A place already registered — to Sirat or anything else — keeps what it has.
// Re-pointing an existing link is a deliberate act, not a side effect of
// re-running discovery.
const existingPlaceIds = new Set(existing.map((l) => l.placeId));
const newLinks = links.filter((l) => !existingPlaceIds.has(l.placeId));
const skipped = links.length - newLinks.length;

const merged = [...existing, ...newLinks].sort((a, b) =>
  a.placeId.localeCompare(b.placeId),
);
writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
console.log(
  `Wrote ${merged.length} registry entries to ${outPath} (${newLinks.length} new sirat, ${existing.length} kept${skipped ? `, ${skipped} sirat match(es) skipped — already registered` : ""}).`,
);
