import { describe, expect, it } from "vitest";

import { computePrayerTimesUtc } from "./prayerCalc";

// Golden regression values, captured 2026-07-29 and cross-checked against
// independent sources: sunrise/sunset agree with published ephemeris data
// for London (e.g. 21 Dec 2026 sunrise 08:04 UTC exactly), the Moonsighting
// seasonal coefficients match the adhan library's published tables, and the
// Hanafi/Shafi Asr split behaves per definition. If any of these move by
// more than a minute, the astronomy changed — that must be deliberate.

const LONDON = { lat: 51.5074, lng: -0.1278 };

/** Assert a fractional-hours UTC value equals "HH:MM" within ±1 minute. */
function expectTime(actual: number, expected: string) {
  const [hh, mm] = expected.split(":").map(Number);
  const actualMinutes = ((actual % 24) + 24) % 24 * 60;
  const expectedMinutes = hh * 60 + mm;
  // Compare on the shorter way around midnight.
  let diff = Math.abs(actualMinutes - expectedMinutes);
  if (diff > 12 * 60) diff = 24 * 60 - diff;
  expect(diff, `expected ${expected}, got ${actual}`).toBeLessThanOrEqual(1);
}

describe("computePrayerTimesUtc — London goldens", () => {
  it("moonsighting, midsummer (2026-07-29)", () => {
    const t = computePrayerTimesUtc(LONDON.lat, LONDON.lng, {
      year: 2026,
      month: 7,
      day: 29,
    });
    expect(t).not.toBeNull();
    expectTime(t!.fajr, "02:31");
    expectTime(t!.sunrise, "04:20");
    expectTime(t!.dhuhr, "12:12");
    expectTime(t!.asr, "16:18");
    expectTime(t!.maghrib, "19:56");
    expectTime(t!.isha, "21:03");
  });

  it("moonsighting, winter solstice (2026-12-21)", () => {
    const t = computePrayerTimesUtc(LONDON.lat, LONDON.lng, {
      year: 2026,
      month: 12,
      day: 21,
    });
    expect(t).not.toBeNull();
    expectTime(t!.fajr, "06:22");
    expectTime(t!.sunrise, "08:04"); // published ephemeris: 08:04 UTC
    expectTime(t!.dhuhr, "12:04");
    expectTime(t!.asr, "13:38");
    expectTime(t!.maghrib, "15:56");
    expectTime(t!.isha, "17:32");
  });

  it("moonsighting, spring equinox (2026-03-20)", () => {
    const t = computePrayerTimesUtc(LONDON.lat, LONDON.lng, {
      year: 2026,
      month: 3,
      day: 20,
    });
    expect(t).not.toBeNull();
    expectTime(t!.fajr, "04:30");
    expectTime(t!.sunrise, "06:03");
    expectTime(t!.dhuhr, "12:13");
    expectTime(t!.asr, "15:26");
    expectTime(t!.maghrib, "18:17");
    expectTime(t!.isha, "19:31");
  });

  it("MWL method (2026-07-29): different fajr/isha and offsets", () => {
    const t = computePrayerTimesUtc(
      LONDON.lat,
      LONDON.lng,
      { year: 2026, month: 7, day: 29 },
      { method: "mwl" },
    );
    expect(t).not.toBeNull();
    expectTime(t!.fajr, "01:18");
    expectTime(t!.dhuhr, "12:08"); // zenith +1 min, not +5
    expectTime(t!.maghrib, "19:53"); // sunset, no +3 min
    expectTime(t!.isha, "22:33");
  });
});

describe("madhab (Asr shadow factor)", () => {
  it("hanafi Asr is later than shafi Asr", () => {
    const date = { year: 2026, month: 7, day: 29 };
    const shafi = computePrayerTimesUtc(LONDON.lat, LONDON.lng, date)!;
    const hanafi = computePrayerTimesUtc(LONDON.lat, LONDON.lng, date, {
      madhab: "hanafi",
    })!;
    expectTime(shafi.asr, "16:18");
    expectTime(hanafi.asr, "17:27");
    expect(hanafi.asr).toBeGreaterThan(shafi.asr);
  });
});

describe("shafaq (moonsighting Isha twilight)", () => {
  it("abyad Isha is later than general Isha in midsummer", () => {
    const date = { year: 2026, month: 7, day: 29 };
    const general = computePrayerTimesUtc(LONDON.lat, LONDON.lng, date)!;
    const abyad = computePrayerTimesUtc(LONDON.lat, LONDON.lng, date, {
      shafaq: "abyad",
    })!;
    expectTime(general.isha, "21:03");
    expectTime(abyad.isha, "21:44");
    expect(abyad.isha).toBeGreaterThan(general.isha);
  });
});

describe("high latitudes", () => {
  it("Lerwick (60.2°N) midsummer uses the 1/7-of-night rule and stays finite", () => {
    // At 60°N in June the sun never reaches 18° below the horizon; the
    // moonsighting spec falls back to night/7 above 55° latitude.
    const t = computePrayerTimesUtc(60.155, -1.145, {
      year: 2026,
      month: 6,
      day: 21,
    });
    expect(t).not.toBeNull();
    expectTime(t!.fajr, "01:55");
    expectTime(t!.sunrise, "02:39");
    expectTime(t!.maghrib, "21:37");
    expectTime(t!.isha, "22:18");
  });

  it("returns null in polar day and polar night (Svalbard)", () => {
    expect(
      computePrayerTimesUtc(78.22, 15.65, { year: 2026, month: 6, day: 21 }),
    ).toBeNull();
    expect(
      computePrayerTimesUtc(78.22, 15.65, { year: 2026, month: 12, day: 21 }),
    ).toBeNull();
  });
});

describe("invariants", () => {
  it("fajr < sunrise < dhuhr < asr < maghrib < isha, every month, both methods", () => {
    for (const method of ["moonsighting", "mwl"] as const) {
      for (let month = 1; month <= 12; month++) {
        const t = computePrayerTimesUtc(
          LONDON.lat,
          LONDON.lng,
          { year: 2026, month, day: 15 },
          { method },
        );
        expect(t, `${method} month ${month}`).not.toBeNull();
        const seq = [t!.fajr, t!.sunrise, t!.dhuhr, t!.asr, t!.maghrib, t!.isha];
        for (let i = 1; i < seq.length; i++) {
          expect(
            seq[i],
            `${method} month ${month}: entry ${i} out of order`,
          ).toBeGreaterThan(seq[i - 1]);
        }
      }
    }
  });
});
