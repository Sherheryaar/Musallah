import { describe, expect, it } from "vitest";

import { formatCountdown } from "./time";

describe("formatCountdown", () => {
  it("shows minutes under an hour", () => {
    expect(formatCountdown(45 * 60_000)).toBe("45 mins");
    expect(formatCountdown(59 * 60_000)).toBe("59 mins");
  });

  it("uses the singular for one of each unit", () => {
    expect(formatCountdown(60_000)).toBe("1 min");
    expect(formatCountdown(60 * 60_000)).toBe("1 hr");
    expect(formatCountdown(61 * 60_000)).toBe("1 hr 1 min");
  });

  it("drops the minutes on a whole number of hours", () => {
    expect(formatCountdown(120 * 60_000)).toBe("2 hrs");
  });

  it("never counts down below a minute", () => {
    expect(formatCountdown(20_000)).toBe("1 min");
    expect(formatCountdown(0)).toBe("1 min");
    expect(formatCountdown(-5_000)).toBe("1 min");
  });

  it("rounds part-minutes up, so the label names a time still to come", () => {
    expect(formatCountdown(90_000)).toBe("2 mins");
    expect(formatCountdown(61 * 60_000 + 1_000)).toBe("1 hr 2 mins");
  });
});
