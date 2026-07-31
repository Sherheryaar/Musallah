import { describe, expect, it } from "vitest";

import { FALLBACK_LOCATION, isInCoverage } from "./geo";

describe("isInCoverage", () => {
  it("accepts places across the UK and Ireland", () => {
    expect(isInCoverage(51.5074, -0.1278)).toBe(true); // London
    expect(isInCoverage(52.4862, -1.8904)).toBe(true); // Birmingham
    expect(isInCoverage(55.8642, -4.2518)).toBe(true); // Glasgow
    expect(isInCoverage(54.5973, -5.9301)).toBe(true); // Belfast
    expect(isInCoverage(53.3498, -6.2603)).toBe(true); // Dublin
    expect(isInCoverage(60.155, -1.145)).toBe(true); // Lerwick, Shetland
  });

  it("rejects places outside the dataset's coverage", () => {
    expect(isInCoverage(48.8566, 2.3522)).toBe(false); // Paris
    expect(isInCoverage(40.7128, -74.006)).toBe(false); // New York
    expect(isInCoverage(43.3731, -80.9821)).toBe(false); // Stratford, Ontario
  });

  it("fallback location is inside coverage", () => {
    expect(isInCoverage(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng)).toBe(
      true,
    );
  });
});
