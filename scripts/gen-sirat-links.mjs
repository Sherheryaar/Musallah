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
const others = existing.filter((l) => l.source !== "sirat");

// A place already registered to another source keeps it — Sirat.uk only
// fills places that had nothing (harvest-sirat.mjs already restricts
// candidates this way, but a registry entry could have been added by hand
// since that harvest ran, so re-check here too).
const otherPlaceIds = new Set(others.map((l) => l.placeId));
const newLinks = links.filter((l) => !otherPlaceIds.has(l.placeId));
const skipped = links.length - newLinks.length;

const merged = [...others, ...newLinks].sort((a, b) =>
  a.placeId.localeCompare(b.placeId),
);
writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
console.log(
  `Wrote ${merged.length} registry entries to ${outPath} (${newLinks.length} sirat, ${others.length} from other sources kept${skipped ? `, ${skipped} sirat match(es) skipped — already registered elsewhere` : ""}).`,
);
