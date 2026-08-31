import { describe, expect, it } from "vitest";

import {
  distanceKm,
  estimateDrivingMinutes,
  estimateWalkingMinutes,
  formatDistance,
  formatTravelEstimate,
} from "./distance";

describe("distanceKm", () => {
  it("London to Paris is ~343.6 km (known great-circle distance)", () => {
    const km = distanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(km).toBeGreaterThan(341);
    expect(km).toBeLessThan(346);
  });

  it("identical points are 0 km", () => {
    expect(distanceKm(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it("is symmetric", () => {
    const a = distanceKm(51.5169, -0.0655, 51.5289, -0.1647);
    const b = distanceKm(51.5289, -0.1647, 51.5169, -0.0655);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("formatDistance", () => {
  it("shows metres under 1 km", () => {
    expect(formatDistance(0.35)).toBe("350 m");
    expect(formatDistance(0.9994)).toBe("999 m");
  });

  it("0.9996 km rounds up to km display, never '1000 m'", () => {
    expect(formatDistance(0.9996)).toBe("1.0 km");
  });

  it("shows one decimal in km from 1 km up", () => {
    expect(formatDistance(2.44)).toBe("2.4 km");
    expect(formatDistance(30)).toBe("30.0 km");
  });
});

describe("estimateWalkingMinutes", () => {
  it("uses 4.8 km/h with a 1.15x street-grid detour (14.4 min per km)", () => {
    expect(estimateWalkingMinutes(1)).toBe(14);
    expect(estimateWalkingMinutes(0.5)).toBe(7);
  });

  it("never shows zero minutes for a place you still have to reach", () => {
    expect(estimateWalkingMinutes(0.01)).toBe(1);
  });

  it("is zero only when you are already there", () => {
    expect(estimateWalkingMinutes(0)).toBe(0);
    expect(estimateWalkingMinutes(-1)).toBe(0);
  });
});

describe("estimateDrivingMinutes", () => {
  it("steps down through the speed tiers as distance grows", () => {
    // 2 km at 25 km/h x 1.25 detour = 6 min.
    expect(estimateDrivingMinutes(2)).toBe(6);
    // 10 km at 40 km/h x 1.25 = 18.75 -> 19 min.
    expect(estimateDrivingMinutes(10)).toBe(19);
    // 30 km at 60 km/h x 1.25 = 37.5 -> 38 min.
    expect(estimateDrivingMinutes(30)).toBe(38);
  });

  it("is zero only when you are already there", () => {
    expect(estimateDrivingMinutes(0)).toBe(0);
    expect(estimateDrivingMinutes(-1)).toBe(0);
  });
});

describe("formatTravelEstimate", () => {
  it("walks under 2.5 km", () => {
    expect(formatTravelEstimate(0.5)).toEqual({
      mode: "walk",
      minutes: 7,
      label: "7 min walk",
    });
  });

  it("drives from 2.5 km up", () => {
    // 5 km sits in the 40 km/h tier: 5 x 1.25 / 40 x 60 = 9.375 -> 9 min.
    expect(formatTravelEstimate(5)).toEqual({
      mode: "drive",
      minutes: 9,
      label: "9 min drive",
    });
  });

  it("switches mode exactly at the 2.5 km boundary", () => {
    expect(formatTravelEstimate(2.49).mode).toBe("walk");
    expect(formatTravelEstimate(2.5).mode).toBe("drive");
  });

  it("spells out minutes, so it can never be read as metres", () => {
    // "6m" next to formatDistance's "350 m" reads as six metres.
    expect(formatTravelEstimate(0.35).label).toContain(" min ");
  });
});

