import { describe, expect, it } from "vitest";

import { distanceKm, formatDistance } from "./distance";

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
