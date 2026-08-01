import { describe, expect, it } from "vitest";

import {
  assessCompass,
  describeAccuracy,
  magnitude,
  tiltFromFlat,
} from "./compassQuality";

describe("tiltFromFlat", () => {
  it("reads zero when the phone lies flat", () => {
    // Gravity straight down through the screen (either sign convention).
    expect(tiltFromFlat({ x: 0, y: 0, z: -1 })).toBeCloseTo(0, 5);
    expect(tiltFromFlat({ x: 0, y: 0, z: 1 })).toBeCloseTo(0, 5);
  });

  it("reads 90 degrees when the phone is upright", () => {
    expect(tiltFromFlat({ x: 0, y: -1, z: 0 })).toBeCloseTo(90, 5);
  });

  it("reads 45 degrees when propped halfway", () => {
    const s = Math.SQRT1_2;
    expect(tiltFromFlat({ x: 0, y: s, z: s })).toBeCloseTo(45, 5);
  });

  it("does not cry wolf in free fall / with no data", () => {
    expect(tiltFromFlat({ x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe("magnitude", () => {
  it("computes vector length", () => {
    expect(magnitude({ x: 3, y: 4, z: 0 })).toBe(5);
  });
});

describe("assessCompass", () => {
  const base = {
    fieldMicroTesla: 49,
    tiltDeg: 5,
    accuracy: 5,
    platform: "ios" as const,
  };

  it("trusts a clean reading", () => {
    const q = assessCompass(base);
    expect(q.issue).toBe("none");
    expect(q.trustworthy).toBe(true);
    expect(q.advice).toBeNull();
  });

  it("flags a magnet or metal from an impossible field strength", () => {
    // A MagSafe case or car mount pushes the field far past Earth's range.
    const q = assessCompass({ ...base, fieldMicroTesla: 300 });
    expect(q.issue).toBe("interference");
    expect(q.trustworthy).toBe(false);
    expect(q.advice).toMatch(/magnetic/i);
  });

  it("flags a shielded / near-zero field too", () => {
    const q = assessCompass({ ...base, fieldMicroTesla: 4 });
    expect(q.issue).toBe("interference");
  });

  it("accepts the full range of genuine Earth field strengths", () => {
    for (const field of [26, 35, 48, 55, 64]) {
      expect(assessCompass({ ...base, fieldMicroTesla: field }).issue).toBe(
        "none",
      );
    }
  });

  it("flags a tilted phone", () => {
    const q = assessCompass({ ...base, tiltDeg: 60 });
    expect(q.issue).toBe("tilted");
    expect(q.advice).toMatch(/flat/i);
  });

  it("flags a poor iOS accuracy figure", () => {
    expect(assessCompass({ ...base, accuracy: 35 }).issue).toBe("uncalibrated");
    expect(assessCompass({ ...base, accuracy: -1 }).issue).toBe("uncalibrated");
  });

  it("reads Android's accuracy as an enum, not degrees", () => {
    const android = { ...base, platform: "android" as const };
    // 3 = high quality on Android; the same number would be excellent on iOS.
    expect(assessCompass({ ...android, accuracy: 3 }).issue).toBe("none");
    expect(assessCompass({ ...android, accuracy: 1 }).issue).toBe(
      "uncalibrated",
    );
  });

  it("puts interference ahead of other complaints", () => {
    // Interference makes the heading meaningless, so it is what to say.
    const q = assessCompass({
      ...base,
      fieldMicroTesla: 500,
      tiltDeg: 80,
      accuracy: 40,
    });
    expect(q.issue).toBe("interference");
  });

  it("degrades gracefully when a platform reports nothing", () => {
    const q = assessCompass({
      fieldMicroTesla: null,
      tiltDeg: null,
      accuracy: null,
      platform: "other",
    });
    expect(q.issue).toBe("none");
    expect(q.trustworthy).toBe(true);
  });
});

describe("describeAccuracy", () => {
  it("uses degrees on iOS", () => {
    expect(describeAccuracy(5, "ios")).toBe("±5°");
    expect(describeAccuracy(-1, "ios")).toBe("Unreliable");
  });

  it("uses words on Android, where the value is an enum", () => {
    expect(describeAccuracy(3, "android")).toBe("High accuracy");
    expect(describeAccuracy(0, "android")).toBe("Unreliable");
  });

  it("says nothing when there is nothing to report", () => {
    expect(describeAccuracy(null, "ios")).toBeNull();
  });
});
