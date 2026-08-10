import { describe, expect, it } from "vitest";

import { computePrayerSchedule, computePrayerTimes } from "./prayerTimes";
import { computePrayerTimesUtc } from "./prayerCalc";

// The astronomy itself is covered by prayerCalc.test.ts. What is tested here
// is the layer the app actually calls, and specifically that memoizing it
// stayed invisible: identical inputs must keep giving identical answers, and
// no caller may receive an object another caller can mutate underneath it.

const LONDON = { lat: 51.5074, lng: -0.1278 };
const OPTIONS = { method: "moonsighting", madhab: "shafi" } as const;
const DAY = new Date(2026, 7, 10, 12); // 10 Aug 2026, local noon

describe("computePrayerSchedule", () => {
  it("returns the six events in chronological order", () => {
    const schedule = computePrayerSchedule(
      LONDON.lat,
      LONDON.lng,
      OPTIONS,
      DAY,
    );
    expect(schedule?.map((e) => e.key)).toEqual([
      "fajr",
      "sunrise",
      "dhuhr",
      "asr",
      "maghrib",
      "isha",
    ]);
    const times = schedule!.map((e) => e.time.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("display strings match their Date, to the minute", () => {
    const schedule = computePrayerSchedule(
      LONDON.lat,
      LONDON.lng,
      OPTIONS,
      DAY,
    )!;
    for (const entry of schedule) {
      const hh = String(entry.time.getHours()).padStart(2, "0");
      const mm = String(entry.time.getMinutes()).padStart(2, "0");
      expect(entry.display).toBe(`${hh}:${mm}`);
    }
  });

  it("is a pure function of its inputs, cache or no cache", () => {
    const a = computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY);
    const b = computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY);
    expect(b).toEqual(a);
    // ...and agrees with the uncached astronomy underneath it.
    const utc = computePrayerTimesUtc(
      LONDON.lat,
      LONDON.lng,
      { year: 2026, month: 8, day: 10 },
      OPTIONS,
    )!;
    const expected = new Date(
      Date.UTC(2026, 7, 10) + Math.round(utc.fajr * 60) * 60_000,
    );
    expect(a![0].time.getTime()).toBe(expected.getTime());
  });

  // The reason the memo holds raw UTC hours rather than finished entries.
  // notificationPlan puts `entry.time` straight into a notification plan, so a
  // shared Date would let one caller's edit rewrite every other screen's times.
  it("never hands two callers the same mutable objects", () => {
    const first = computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY)!;
    const second = computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY)!;
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].time).not.toBe(first[0].time);

    const fajr = first[0].time.getTime();
    first[0].time.setFullYear(1990);
    first.length = 0;
    const third = computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY)!;
    expect(third).toHaveLength(6);
    expect(third[0].time.getTime()).toBe(fajr);
  });

  it("keys on the calculation options", () => {
    const shafi = computePrayerSchedule(LONDON.lat, LONDON.lng, {
      ...OPTIONS,
      madhab: "shafi",
    }, DAY)!;
    const hanafi = computePrayerSchedule(LONDON.lat, LONDON.lng, {
      ...OPTIONS,
      madhab: "hanafi",
    }, DAY)!;
    const asr = (s: typeof shafi) =>
      s.find((e) => e.key === "asr")!.time.getTime();
    // Hanafi Asr (2 mithl) is strictly later than Shafi'i (1 mithl).
    expect(asr(hanafi)).toBeGreaterThan(asr(shafi));

    const mwl = computePrayerSchedule(LONDON.lat, LONDON.lng, {
      ...OPTIONS,
      method: "mwl",
    }, DAY)!;
    expect(mwl.find((e) => e.key === "isha")!.display).not.toBe(
      shafi.find((e) => e.key === "isha")!.display,
    );
  });

  it("keys on the calendar day", () => {
    const aug = computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY)!;
    const dec = computePrayerSchedule(
      LONDON.lat,
      LONDON.lng,
      OPTIONS,
      new Date(2026, 11, 10, 12),
    )!;
    expect(dec[0].display).not.toBe(aug[0].display);
    // And re-asking for August still gives August, not the newer entry.
    expect(
      computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY)![0].display,
    ).toBe(aug[0].display);
  });

  it("keys on location, and survives eviction", () => {
    const golden = computePrayerSchedule(
      LONDON.lat,
      LONDON.lng,
      OPTIONS,
      DAY,
    )!.map((e) => e.display);

    // Push well past the cache bound so London is certainly evicted, checking
    // as we go that distant places really do get their own times.
    let differed = 0;
    for (let i = 0; i < 200; i++) {
      const lat = 50 + (i % 100) * 0.05;
      const other = computePrayerSchedule(lat, LONDON.lng, OPTIONS, DAY)!;
      if (other[0].display !== golden[0]) differed++;
    }
    expect(differed).toBeGreaterThan(0);

    // Recomputed from scratch after eviction, it must be the same answer.
    expect(
      computePrayerSchedule(LONDON.lat, LONDON.lng, OPTIONS, DAY)!.map(
        (e) => e.display,
      ),
    ).toEqual(golden);
  });

  it("returns null in polar day, and keeps returning it", () => {
    // Svalbard in midsummer: the sun never sets, so there is no schedule.
    const polar = () =>
      computePrayerSchedule(78.22, 15.63, OPTIONS, new Date(2026, 5, 21, 12));
    expect(polar()).toBeNull();
    // A cached `null` is a real answer, not a cache miss.
    expect(polar()).toBeNull();
  });
});

describe("computePrayerTimes", () => {
  it("agrees with computePrayerSchedule, which now shares its cache", () => {
    const times = computePrayerTimes(LONDON.lat, LONDON.lng, OPTIONS, DAY)!;
    const schedule = computePrayerSchedule(
      LONDON.lat,
      LONDON.lng,
      OPTIONS,
      DAY,
    )!;
    const byKey = Object.fromEntries(schedule.map((e) => [e.key, e.display]));
    expect(times.Fajr).toBe(byKey.fajr);
    expect(times.Sunrise).toBe(byKey.sunrise);
    expect(times.Dhuhr).toBe(byKey.dhuhr);
    expect(times.Asr).toBe(byKey.asr);
    expect(times.Maghrib).toBe(byKey.maghrib);
    expect(times.Isha).toBe(byKey.isha);
  });

  it("returns a fresh object each call", () => {
    const a = computePrayerTimes(LONDON.lat, LONDON.lng, OPTIONS, DAY);
    const b = computePrayerTimes(LONDON.lat, LONDON.lng, OPTIONS, DAY);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
