// Integrity checks on the timetable registry itself.
//
// This file is data, not code, but it decides which mosque's timetable is
// fetched for which place — so a bad row shows one mosque's jamā'ah times on
// another mosque's page. These assertions are the cheapest possible guard
// against the two ways that has actually happened.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SOURCES } from "./timetable-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const links = JSON.parse(
  readFileSync(join(root, "scripts", "timetable-links.json"), "utf8"),
);
const places = JSON.parse(
  readFileSync(join(root, "src", "data", "places.json"), "utf8"),
);

/** The identity a row uses to fetch times, or null for rows without one. */
const sourceKey = (link) => {
  if (link.siratId) return `sirat:${link.siratId}`;
  if (link.mawaqitUuid) return `mawaqit:${link.mawaqitUuid}`;
  if (link.slug) return `${link.source}:${link.slug}`;
  if (link.url) return `url:${link.url}`;
  return null;
};

describe("timetable registry", () => {
  it("is not empty", () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it("names only sources the pipeline can actually fetch", () => {
    const unknown = [...new Set(links.map((l) => l.source))].filter(
      (s) => !SOURCES[s],
    );
    expect(unknown).toEqual([]);
  });

  it("registers each place at most once", () => {
    const seen = new Map();
    const duplicates = [];
    for (const link of links) {
      if (seen.has(link.placeId)) {
        duplicates.push(`${link.placeId} (${seen.get(link.placeId)} + ${link.source})`);
      } else {
        seen.set(link.placeId, link.source);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("never points two places at the same upstream mosque", () => {
    // The real bug this catches: Sirat mosque-000176 was registered to both
    // Jamia Shan-e-Islam and Jamiyat Tabligh ul Islam, 131 m apart in
    // different postal districts, so one was serving the other's times.
    const byKey = new Map();
    const collisions = [];
    for (const link of links) {
      const key = sourceKey(link);
      if (!key) continue;
      if (byKey.has(key)) {
        collisions.push(`${key}: ${byKey.get(key)} + ${link.placeId}`);
      } else {
        byKey.set(key, link.placeId);
      }
    }
    expect(collisions).toEqual([]);
  });

  it("gives every row an identity to fetch by", () => {
    // A row with no id/uuid/slug/url cannot be fetched without falling back
    // to proximity, which is exactly what the pipeline refuses to do.
    const identityless = links
      .filter((l) => sourceKey(l) === null)
      .map((l) => l.placeId);
    expect(identityless).toEqual([]);
  });

  it("only registers places that exist in the dataset", () => {
    const placeIds = new Set(places.map((p) => p.id));
    const orphans = links
      .map((l) => l.placeId)
      .filter((id) => !placeIds.has(id));
    expect(orphans).toEqual([]);
  });
});
