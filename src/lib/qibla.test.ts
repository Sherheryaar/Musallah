import { describe, expect, it } from "vitest";

import {
  angleDelta,
  compassPoint,
  distanceToKaabaKm,
  KAABA,
  normalizeAngle,
  qiblaBearing,
  qiblaGuidance,
  smoothAngle,
} from "./qibla";

describe("qiblaBearing", () => {
  // Goldens are the widely published qibla bearings for these cities;
  // London's 118.99° is the canonical check.
  it.each([
    ["London", 51.5074, -0.1278, 118.99],
    ["Birmingham", 52.4862, -1.8904, 117.96],
    ["Edinburgh", 55.9533, -3.1883, 119.51],
    ["Dublin", 53.3498, -6.2603, 114.1],
    ["New York", 40.7128, -74.006, 58.48],
    ["Cairo", 30.0444, 31.2357, 136.14],
    ["Sydney", -33.8688, 151.2093, 277.5],
    ["Jakarta", -6.2088, 106.8456, 295.15],
  ])("%s points at %s°", (_city, lat, lng, expected) => {
    expect(qiblaBearing(lat, lng)).toBeCloseTo(expected as number, 1);
  });

  it("always returns a bearing in 0–360", () => {
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lng = -180; lng <= 180; lng += 30) {
        const b = qiblaBearing(lat, lng);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
      }
    }
  });

  it("points due north from directly south of the Kaaba", () => {
    expect(qiblaBearing(KAABA.lat - 10, KAABA.lng)).toBeCloseTo(0, 5);
  });

  it("points due south from directly north of the Kaaba", () => {
    expect(qiblaBearing(KAABA.lat + 10, KAABA.lng)).toBeCloseTo(180, 5);
  });
});

describe("distanceToKaabaKm", () => {
  it("matches known distances", () => {
    expect(distanceToKaabaKm(51.5074, -0.1278)).toBeCloseTo(4794, -1); // London
    expect(distanceToKaabaKm(30.0444, 31.2357)).toBeCloseTo(1287, -1); // Cairo
  });

  it("is zero at the Kaaba itself", () => {
    expect(distanceToKaabaKm(KAABA.lat, KAABA.lng)).toBeCloseTo(0, 6);
  });
});

describe("angleDelta", () => {
  it("takes the shortest way round, signed", () => {
    expect(angleDelta(10, 40)).toBe(30);
    expect(angleDelta(40, 10)).toBe(-30);
    // Across the 0/360 wrap: 350° -> 10° is +20, not -340.
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });

  it("stays within -180..180", () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 11) {
        const d = angleDelta(a, b);
        expect(d).toBeGreaterThan(-181);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("smoothAngle", () => {
  it("moves toward the new reading without overshooting", () => {
    expect(smoothAngle(0, 100, 0.5)).toBeCloseTo(50, 6);
  });

  it("smooths across the 359/0 boundary instead of spinning", () => {
    // Naive averaging would give ~180 here; wrap-aware gives ~355.
    expect(smoothAngle(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(smoothAngle(358, 2, 0.25)).toBeCloseTo(359, 6);
  });

  it("converges on the target when applied repeatedly", () => {
    let angle = 0;
    for (let i = 0; i < 100; i++) angle = smoothAngle(angle, 119, 0.3);
    expect(angle).toBeCloseTo(119, 3);
  });
});

describe("normalizeAngle", () => {
  it("folds any input into 0..360", () => {
    expect(normalizeAngle(-10)).toBe(350);
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-370)).toBe(350);
    expect(normalizeAngle(0)).toBe(0);
  });
});

describe("compassPoint", () => {
  it("names the 16-point direction", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(118.99)).toBe("ESE"); // the UK qibla
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(359)).toBe("N"); // wraps back to N
  });
});

describe("qiblaGuidance", () => {
  it("reports alignment within tolerance", () => {
    expect(qiblaGuidance(119, 119).aligned).toBe(true);
    expect(qiblaGuidance(115, 119).aligned).toBe(true);
    expect(qiblaGuidance(119, 119).instruction).toBe("Facing the qibla");
  });

  it("tells the user which way to turn, the short way round", () => {
    expect(qiblaGuidance(90, 119).instruction).toBe("Turn right 29°");
    expect(qiblaGuidance(150, 119).instruction).toBe("Turn left 31°");
    // Facing just west of north, qibla ESE: shortest turn is right.
    expect(qiblaGuidance(350, 20).instruction).toBe("Turn right 30°");
  });
});
