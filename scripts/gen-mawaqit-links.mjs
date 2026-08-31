#!/usr/bin/env node
// Refreshes the MAWAQIT entries in scripts/timetable-links.json — the
// registry scripts/refresh-times.mjs works from. Entries belonging to other
// sources (a mosque's own website, say) are preserved untouched: Mawaqit is
// one provider among several, not the registry's owner.
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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inDir = process.argv[2];
if (!inDir) {
  console.error("Usage: node scripts/gen-mawaqit-links.mjs <harvest-output-dir>");
  process.exit(1);
}

const { matches, cellsDone, cellsTotal } = JSON.parse(
  readFileSync(join(inDir, "mawaqit-matches.json"), "utf8"),
);
const { mosques } = JSON.parse(
  readFileSync(join(inDir, "mawaqit-checkpoint.json"), "utf8"),
);
const bySlug = new Map(mosques.map((m) => [m.slug, m]));

// This script REPLACES every mawaqit row (see the merge below), which is only
// safe if the harvest actually saw every mawaqit mosque. From a partial grid
// sweep it would silently delete the links for mosques in cells that were
// never queried, freezing those places at whatever times were last written.
// That exact regression has already happened once on the Sirat side — see the
// long comment in gen-sirat-links.mjs — so it is refused here rather than
// discovered later.
if (
  typeof cellsDone === "number" &&
  typeof cellsTotal === "number" &&
  cellsDone < cellsTotal
) {
  console.error(
    `Harvest is incomplete (${cellsDone}/${cellsTotal} grid cells queried). Re-run scripts/harvest-mawaqit.mjs to finish the sweep — rebuilding the mawaqit rows now would drop links for mosques in the ${cellsTotal - cellsDone} unqueried cell(s).`,
  );
  process.exit(1);
}

// The harvest decides what counts as the same mosque and stamps it on each
// match, so this script never re-implements that rule.
const unstamped = matches.filter(
  (m) => typeof m.identityConfident !== "boolean",
);
if (unstamped.length > 0) {
  console.error(
    `${unstamped.length} match(es) have no \`identityConfident\` flag — re-run scripts/harvest-mawaqit.mjs to regenerate mawaqit-matches.json.`,
  );
  process.exit(1);
}

const links = [];
for (const m of matches) {
  if (!m.identityConfident || m.closed) continue;
  const mosque = bySlug.get(m.mawaqitSlug);
  if (!mosque?.uuid) {
    console.warn(`skipping ${m.placeId}: no checkpoint record for slug ${m.mawaqitSlug}`);
    continue;
  }
  links.push({
    placeId: m.placeId,
    source: "mawaqit",
    placeName: m.placeName,
    mawaqitUuid: mosque.uuid,
    mawaqitSlug: m.mawaqitSlug,
    mawaqitName: m.mawaqitName,
    // What justified this link, kept on the row so a later audit can tell a
    // name match from a postcode match without re-harvesting.
    matchedOn: [
      ...(m.nameOverlap ? ["name"] : []),
      ...(m.postcode === "agree" ? ["postcode"] : []),
    ].join("+"),
    // The MOSQUE's own coordinates (not our pin): the refresh script
    // re-queries the search API around this point and matches by uuid.
    lat: Number(mosque.latitude),
    lng: Number(mosque.longitude),
    matchedDistanceM: m.distanceM,
  });
}

const outPath = join(root, "scripts", "timetable-links.json");
const existing = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, "utf8"))
  : [];
const otherSources = existing.filter((l) => l.source !== "mawaqit");

// ONE row per place, and when two sources both offer a place, the mosque's own
// platform wins over a third-party directory. Mawaqit's times are entered by
// the mosque itself; Sirat.uk is an aggregator that re-publishes what it can
// find. So a place that gained a Sirat link now has its Mawaqit link instead —
// the same precedence harvest-sirat.mjs already applies in the other
// direction by refusing to consider places that have any source.
//
// Where the existing row is ANOTHER mosque-published source (its own website,
// Masjidbox), the incumbent stays: both are the mosque's own publication and
// swapping between them every run would just add churn.
const AGGREGATOR_SOURCES = new Set(["sirat"]);
const incumbentBySource = new Map(otherSources.map((l) => [l.placeId, l]));

const supersededAggregators = [];
const yieldedToIncumbent = [];
const acceptedLinks = links.filter((link) => {
  const incumbent = incumbentBySource.get(link.placeId);
  if (!incumbent) return true;
  if (AGGREGATOR_SOURCES.has(incumbent.source)) {
    supersededAggregators.push(incumbent);
    return true;
  }
  yieldedToIncumbent.push({ link, incumbent });
  return false;
});
const supersededIds = new Set(supersededAggregators.map((l) => l.placeId));
const others = otherSources.filter((l) => !supersededIds.has(l.placeId));

// A registered row is NOT re-derived from proximity every run. Identity here
// is the uuid captured at link time — the rule the whole pipeline rests on —
// so an existing row survives as long as Mawaqit still publishes that uuid,
// even when the harvest no longer matches it to the place by distance.
//
// Without this, a mosque that MOVES loses its times: Taunton Central Masjid
// relocated from Tower Lane (TA1 4AR) to 113a East Reach (TA1 3HL), 961 m
// from our pin and so past SAME_SITE_M, and a straight rebuild deleted a link
// that was still working perfectly — the daily fetch finds the mosque by
// uuid and never cares how far it is from our pin.
//
// The uuid vanishing from Mawaqit is the one case that does justify dropping
// a row, and it is reported rather than done silently.
const liveUuids = new Set(mosques.map((m) => m.uuid).filter(Boolean));
const freshlyLinked = new Set(acceptedLinks.map((l) => l.placeId));
const keptUnmatched = existing.filter(
  (l) =>
    l.source === "mawaqit" &&
    !freshlyLinked.has(l.placeId) &&
    liveUuids.has(l.mawaqitUuid),
);
const goneFromMawaqit = existing.filter(
  (l) =>
    l.source === "mawaqit" &&
    !freshlyLinked.has(l.placeId) &&
    !liveUuids.has(l.mawaqitUuid),
);

const merged = [...others, ...acceptedLinks, ...keptUnmatched].sort((a, b) =>
  a.placeId.localeCompare(b.placeId),
);
writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");
console.log(
  `Wrote ${merged.length} registry entries to ${outPath} (${acceptedLinks.length} mawaqit matched this run, ${keptUnmatched.length} kept on a still-live uuid, ${others.length} from other sources kept).`,
);
for (const l of supersededAggregators) {
  console.log(
    `  + ${l.placeId}: moved from ${l.source} to mawaqit — the mosque publishes there itself.`,
  );
}
for (const { link, incumbent } of yieldedToIncumbent) {
  console.log(
    `  = ${link.placeId}: kept on ${incumbent.source} (also mosque-published); mawaqit match not registered.`,
  );
}
for (const l of keptUnmatched) {
  console.warn(
    `  ~ ${l.placeId}: kept — Mawaqit still publishes ${l.mawaqitUuid}, but the harvest no longer matches it to this place. Our pin or address may be out of date.`,
  );
}
for (const l of goneFromMawaqit) {
  console.warn(
    `  ! ${l.placeId}: DROPPED — uuid ${l.mawaqitUuid} is no longer in Mawaqit's data.`,
  );
}
