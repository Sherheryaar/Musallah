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

// The harvest decides what is confident and stamps it on each match, so this
// script never re-implements the rule. A file without the flag predates that
// and must not be guessed at: registering the wrong mosque's source would put
// another mosque's prayer times in front of a user.
const unstamped = matches.filter((m) => typeof m.confident !== "boolean");
if (unstamped.length > 0) {
  console.error(
    `${unstamped.length} match(es) have no \`confident\` flag — re-run scripts/harvest-sirat.mjs to regenerate sirat-matches.json.`,
  );
  process.exit(1);
}

const links = matches
  .filter((m) => m.confident)
  .map((m) => ({
    placeId: m.placeId,
    source: "sirat",
    placeName: m.placeName,
    siratId: m.siratId,
    siratName: m.siratName,
    matchedDistanceM: m.distanceM,
    // What actually justified this link, kept on the row so a future audit
    // can tell a name match from a postcode match without re-harvesting.
    matchedOn: [
      ...(m.nameOverlap ? ["name"] : []),
      ...(m.postcode === "agree" ? ["postcode"] : []),
    ].join("+"),
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

// One Sirat mosque may back at most ONE place. A harvest run cannot break
// this on its own (it picks a single best place per mosque), but successive
// runs merging additively could, and did: an audit found mosque-000176
// registered to both Jamia Shan-e-Islam and Jamiyat Tabligh ul Islam — two
// mosques 131 m apart in different postal districts — so one of them had been
// showing the other's jamā'ah times.
const existingSiratIds = new Set(
  existing.filter((l) => l.source === "sirat").map((l) => l.siratId),
);
const takenIds = [];
const newLinks = links.filter((l) => {
  if (existingPlaceIds.has(l.placeId)) return false;
  if (existingSiratIds.has(l.siratId)) {
    takenIds.push(l);
    return false;
  }
  existingSiratIds.add(l.siratId);
  return true;
});
const skipped = links.filter((l) => existingPlaceIds.has(l.placeId)).length;

const merged = [...existing, ...newLinks].sort((a, b) =>
  a.placeId.localeCompare(b.placeId),
);
writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
console.log(
  `Wrote ${merged.length} registry entries to ${outPath} (${newLinks.length} new sirat, ${existing.length} kept${skipped ? `, ${skipped} sirat match(es) skipped — already registered` : ""}).`,
);
for (const l of takenIds) {
  console.warn(
    `  ! ${l.placeId} not registered: Sirat ${l.siratId} already backs another place — confirm which one is right by hand.`,
  );
}
