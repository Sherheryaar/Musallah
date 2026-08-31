import { describe, expect, it } from "vitest";

import { getPrayerStatus } from "./prayerStatus";
import type { PrayerScheduleEntry } from "./prayerTimes";

// A real London day: 31 August 2026, the day the Fajr bug was caught on a
// physical device at 11:04 with the screen claiming "Now - Fajr".
const at = (h: number, m: number) => new Date(2026, 7, 31, h, m);

const entry = (
  key: PrayerScheduleEntry["key"],
  label: string,
  h: number,
  m: number,
): PrayerScheduleEntry => ({
  key,
  label,
  time: at(h, m),
  display: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
});

const DAY: PrayerScheduleEntry[] = [
  entry("fajr", "Fajr", 4, 32),
  entry("sunrise", "Sunrise", 6, 11),
  entry("dhuhr", "Dhuhr", 13, 5),
  entry("asr", "Asr", 17, 42),
  entry("maghrib", "Maghrib", 19, 52),
  entry("isha", "Isha", 21, 1),
];

const TOMORROW_FAJR = new Date(2026, 7, 32, 4, 34);

describe("getPrayerStatus — the Fajr window closes at sunrise", () => {
  it("names Fajr as current between Fajr and sunrise", () => {
    const s = getPrayerStatus(DAY, TOMORROW_FAJR, at(5, 0))!;
    expect(s.currentKey).toBe("fajr");
    expect(s.nowLabel).toBe("Now · Fajr");
  });

  it("stops naming Fajr the moment sunrise arrives", () => {
    const s = getPrayerStatus(DAY, TOMORROW_FAJR, at(6, 11))!;
    expect(s.currentKey).toBeNull();
    expect(s.nowLabel).toBe("Fajr ended · 06:11");
  });

  it("claims no current prayer at 11:04 — the case found on the device", () => {
    const s = getPrayerStatus(DAY, TOMORROW_FAJR, at(11, 4))!;
    // The whole point: this used to say "fajr" and highlight that row.
    expect(s.currentKey).toBeNull();
    expect(s.nowLabel).toBe("Fajr ended · 06:11");
    // The countdown itself was always right and must stay right.
    expect(s.nextLabel).toBe("Dhuhr");
    expect(s.msUntilNext).toBe(at(13, 5).getTime() - at(11, 4).getTime());
  });

  it("highlights nothing for the whole sunrise-to-Dhuhr gap", () => {
    for (const [h, m] of [
      [6, 11],
      [7, 30],
      [9, 0],
      [11, 4],
      [13, 4],
    ] as const) {
      expect(getPrayerStatus(DAY, TOMORROW_FAJR, at(h, m))!.currentKey).toBeNull();
    }
  });
});

describe("getPrayerStatus — every other window runs to the next prayer", () => {
  it("Dhuhr stays current right up to Asr", () => {
    expect(getPrayerStatus(DAY, TOMORROW_FAJR, at(13, 5))!.currentKey).toBe(
      "dhuhr",
    );
    expect(getPrayerStatus(DAY, TOMORROW_FAJR, at(17, 41))!.currentKey).toBe(
      "dhuhr",
    );
  });

  it("Asr stays current right up to Maghrib", () => {
    expect(getPrayerStatus(DAY, TOMORROW_FAJR, at(17, 42))!.currentKey).toBe(
      "asr",
    );
    expect(getPrayerStatus(DAY, TOMORROW_FAJR, at(19, 51))!.currentKey).toBe(
      "asr",
    );
  });

  it("Maghrib stays current right up to Isha", () => {
    expect(getPrayerStatus(DAY, TOMORROW_FAJR, at(19, 52))!.currentKey).toBe(
      "maghrib",
    );
  });

  it("before Fajr, the current prayer is still last night's Isha", () => {
    const s = getPrayerStatus(DAY, TOMORROW_FAJR, at(2, 0))!;
    expect(s.currentKey).toBe("isha");
    expect(s.nextLabel).toBe("Fajr");
  });

  it("after Isha, counts down to tomorrow's Fajr", () => {
    const s = getPrayerStatus(DAY, TOMORROW_FAJR, at(22, 0))!;
    expect(s.currentKey).toBe("isha");
    expect(s.nextLabel).toBe("Fajr");
    expect(s.msUntilNext).toBe(TOMORROW_FAJR.getTime() - at(22, 0).getTime());
  });

  it("returns null after Isha when tomorrow's Fajr is unknown", () => {
    expect(getPrayerStatus(DAY, null, at(22, 0))).toBeNull();
  });
});

describe("getPrayerStatus — degenerate input", () => {
  it("returns null for an empty schedule", () => {
    expect(getPrayerStatus([], TOMORROW_FAJR, at(11, 4))).toBeNull();
  });

  it("still names Fajr current when the day has no sunrise entry", () => {
    // Without a sunrise boundary there is nothing to close Fajr with, so the
    // old behaviour is the only honest fallback — but it must not crash.
    const noSunrise = DAY.filter((e) => e.key !== "sunrise");
    expect(getPrayerStatus(noSunrise, TOMORROW_FAJR, at(11, 4))!.currentKey).toBe(
      "fajr",
    );
  });
});
