import { describe, expect, it } from "vitest";

import { FACILITY_KEYS, type FacilityKey, type Place } from "@/data/places";
import { selectPinsForRegion, type PinCandidate } from "./mapPins";

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

describe("selectPinsForRegion", () => {
  it("returns everything in view when under budget, order preserved", () => {
    const results = [
      pin("a", 51.5, -0.1),
      pin("b", 51.51, -0.11),
      pin("c", 51.49, -0.09),
    ];
    expect(selectPinsForRegion(results, LONDON, 300)).toEqual(results);
  });

  it("excludes places outside the padded viewport", () => {
    const results = [
      pin("inside", 51.5, -0.1),
      pin("manchester", 53.48, -2.24),
      pin("cardiff", 51.48, -3.18),
    ];
    const picked = selectPinsForRegion(results, LONDON, 300);
    expect(picked.map((r) => r.place.id)).toEqual(["inside"]);
  });

  it("keeps pins just off-screen so panning doesn't pop markers", () => {
    // 0.05 outside the visible half-delta but inside the 0.6x padding.
    const results = [pin("edge", 51.5 + 0.055, -0.1)];
    expect(selectPinsForRegion(results, LONDON, 300)).toHaveLength(1);
  });

  it("caps at the budget and spreads across the screen when over it", () => {
    // 40 pins crammed into one corner, 4 pins alone in far cells.
    const dense = Array.from({ length: 40 }, (_, i) =>
      pin(`dense-${i}`, 51.46 + i * 0.0001, -0.14 + i * 0.0001, i),
    );
    const sparse = [
      pin("ne", 51.54, -0.06, 100),
      pin("nw", 51.54, -0.14, 101),
      pin("se", 51.46, -0.06, 102),
      pin("mid", 51.5, -0.1, 103),
    ];
    const picked = selectPinsForRegion([...dense, ...sparse], LONDON, 10);
    expect(picked).toHaveLength(10);
    // Every sparse cell must be represented — the dense corner can't
    // consume the whole budget.
    for (const s of sparse) {
      expect(picked.some((r) => r.place.id === s.place.id)).toBe(true);
    }
  });

  it("prefers the nearest places within each cell", () => {
    // Same cell: the two nearest (first in sorted order) must win.
    const results = [
      pin("nearest", 51.5, -0.1, 1),
      pin("second", 51.5001, -0.1001, 2),
      ...Array.from({ length: 60 }, (_, i) =>
        pin(`far-${i}`, 51.5002 + i * 0.00001, -0.1002, 3 + i),
      ),
    ];
    const picked = selectPinsForRegion(results, LONDON, 1);
    expect(picked[0].place.id).toBe("nearest");
  });
});
