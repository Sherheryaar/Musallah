import { describe, expect, it } from "vitest";

import { FACILITY_KEYS, type FacilityKey, type Place } from "@/data/places";
import { buildPinGroups, clusterBucket, type PinCandidate } from "./mapPins";

const facilities = Object.fromEntries(
  FACILITY_KEYS.map((k) => [k, false]),
) as Record<FacilityKey, boolean>;

function pin(id: string, lat: number, lng: number, km = 1): PinCandidate {
  const place: Place = {
    id,
    name: id,
    type: "masjid",
    address: "",
    lat,
    lng,
    facilities,
  };
  return { place, km };
}

const LONDON = {
  latitude: 51.5,
  longitude: -0.1,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

describe("buildPinGroups", () => {
  it("renders everything as individual pins when under budget", () => {
    const results = [
      pin("a", 51.5, -0.1),
      pin("b", 51.51, -0.11),
      pin("c", 51.49, -0.09),
    ];
    const groups = buildPinGroups(results, LONDON, 300);
    expect(groups.singles).toEqual(results);
    expect(groups.clusters).toEqual([]);
  });

  it("excludes places outside the padded viewport", () => {
    const results = [
      pin("inside", 51.5, -0.1),
      pin("manchester", 53.48, -2.24),
      pin("cardiff", 51.48, -3.18),
    ];
    const groups = buildPinGroups(results, LONDON, 300);
    expect(groups.singles.map((r) => r.place.id)).toEqual(["inside"]);
  });

  it("keeps pins just off-screen so panning doesn't pop markers", () => {
    // 0.05 outside the visible half-delta but inside the 0.6x padding.
    const results = [pin("edge", 51.5 + 0.055, -0.1)];
    expect(buildPinGroups(results, LONDON, 300).singles).toHaveLength(1);
  });

  it("over budget: shared cells cluster, lone places stay pins, nothing is lost", () => {
    // 40 pins crammed into one corner cell, 3 pins alone in far cells.
    const dense = Array.from({ length: 40 }, (_, i) =>
      pin(`dense-${i}`, 51.46 + i * 0.00001, -0.14 + i * 0.00001, i),
    );
    const sparse = [
      pin("ne", 51.54, -0.06, 100),
      pin("nw", 51.54, -0.14, 101),
      pin("mid", 51.5, -0.1, 102),
    ];
    const groups = buildPinGroups([...dense, ...sparse], LONDON, 10);
    // The dense corner becomes one numbered cluster...
    expect(groups.clusters).toHaveLength(1);
    expect(groups.clusters[0].count).toBe(40);
    // ...every lone place still renders as a pin...
    expect(groups.singles.map((r) => r.place.id).sort()).toEqual([
      "mid",
      "ne",
      "nw",
    ]);
    // ...and every in-view place is represented exactly once.
    const represented =
      groups.singles.length +
      groups.clusters.reduce((n, c) => n + c.count, 0);
    expect(represented).toBe(43);
  });

  it("NEVER exceeds the marker budget, even for pathological spreads", () => {
    // 2,000 places scattered so most grid cells hold exactly one place —
    // the worst case for the singles count. The grid must coarsen itself.
    const results = Array.from({ length: 2000 }, (_, i) =>
      pin(`p-${i}`, 51.44 + (i % 45) * 0.0027, -0.16 + Math.floor(i / 45) * 0.0027),
    );
    const groups = buildPinGroups(results, LONDON, 50);
    const total = groups.singles.length + groups.clusters.length;
    expect(total).toBeLessThanOrEqual(50);
    // Everything in view is still represented.
    const represented =
      groups.singles.length +
      groups.clusters.reduce((n, c) => n + c.count, 0);
    expect(represented).toBeGreaterThan(1000);
  });

  it("keeps cluster identity while panning (world-anchored grid)", () => {
    const results = Array.from({ length: 400 }, (_, i) =>
      pin(`p-${i}`, 51.47 + (i % 20) * 0.0001, -0.13 + Math.floor(i / 20) * 0.0001),
    );
    const before = buildPinGroups(results, LONDON, 100);
    // Pan the viewport a third of a screen — same zoom.
    const panned = { ...LONDON, latitude: 51.53, longitude: -0.07 };
    const after = buildPinGroups(results, panned, 100);
    const beforeKeys = new Set(before.clusters.map((c) => c.key));
    // Every cluster still in view keeps the exact same key.
    for (const c of after.clusters) {
      expect(beforeKeys.has(c.key)).toBe(true);
    }
    expect(after.clusters.length).toBeGreaterThan(0);
  });

  it("centres a cluster on its members and gives it a tap-to-zoom region", () => {
    const results = [
      ...Array.from({ length: 200 }, (_, i) =>
        pin(`a-${i}`, 51.47, -0.13 + i * 0.00001),
      ),
      ...Array.from({ length: 200 }, (_, i) =>
        pin(`b-${i}`, 51.53, -0.07 + i * 0.00001),
      ),
    ];
    const groups = buildPinGroups(results, LONDON, 300);
    expect(groups.clusters).toHaveLength(2);
    for (const c of groups.clusters) {
      expect(c.count).toBe(200);
      // Zoom target must be a usable region, never zero/negative.
      expect(c.latitudeDelta).toBeGreaterThan(0);
      expect(c.longitudeDelta).toBeGreaterThan(0);
    }
    const south = groups.clusters.find((c) => c.lat < 51.5);
    expect(south).toBeDefined();
    expect(south!.lat).toBeCloseTo(51.47, 3);
  });
});

describe("clusterBucket", () => {
  it("maps counts onto the pre-rendered image set", () => {
    expect(clusterBucket(2)).toBe("2");
    expect(clusterBucket(9)).toBe("9");
    expect(clusterBucket(10)).toBe("10+");
    expect(clusterBucket(19)).toBe("10+");
    expect(clusterBucket(49)).toBe("30+");
    expect(clusterBucket(99)).toBe("50+");
    expect(clusterBucket(250)).toBe("200+");
    expect(clusterBucket(2280)).toBe("500+");
  });
});
