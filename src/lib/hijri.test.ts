import { describe, expect, it } from "vitest";

import { formatHijri, gregorianToHijri } from "./hijri";

// The tabular (Kuwaiti) algorithm is expected to sit within ±1 day of the
// observational Umm al-Qura calendar. The Ramadan anchors below land
// EXACTLY on the Umm al-Qura dates for 1446 and 1445 — verified 2026-07-29.

describe("gregorianToHijri", () => {
  it("1 Ramadan 1446 = 1 March 2025 (matches Umm al-Qura exactly)", () => {
    expect(gregorianToHijri(new Date(2025, 2, 1))).toEqual({
      day: 1,
      month: 9,
      year: 1446,
    });
  });

  it("1 Ramadan 1445 = 11 March 2024 (matches Umm al-Qura exactly)", () => {
    expect(gregorianToHijri(new Date(2024, 2, 11))).toEqual({
      day: 1,
      month: 9,
      year: 1445,
    });
  });

  it("regression goldens", () => {
    expect(gregorianToHijri(new Date(2026, 6, 29))).toEqual({
      day: 13,
      month: 2,
      year: 1448,
    });
    expect(gregorianToHijri(new Date(2000, 0, 1))).toEqual({
      day: 24,
      month: 9,
      year: 1420,
    });
    expect(gregorianToHijri(new Date(2030, 10, 26))).toEqual({
      day: 30,
      month: 7,
      year: 1452,
    });
  });

  it("always yields a valid month (1-12) and day (1-30)", () => {
    // Walk ~3 years day by day; the arithmetic must never step outside the
    // calendar (month 0/13 would crash the month-name lookup).
    const d = new Date(2025, 0, 1);
    for (let i = 0; i < 1100; i++) {
      const h = gregorianToHijri(d);
      expect(h.month).toBeGreaterThanOrEqual(1);
      expect(h.month).toBeLessThanOrEqual(12);
      expect(h.day).toBeGreaterThanOrEqual(1);
      expect(h.day).toBeLessThanOrEqual(30);
      d.setDate(d.getDate() + 1);
    }
  });
});

describe("formatHijri", () => {
  it("renders day, month name, and year", () => {
    expect(formatHijri(new Date(2025, 2, 1))).toBe("1 RAMADAN 1446 AH");
  });
});
