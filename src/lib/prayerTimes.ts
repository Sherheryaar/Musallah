// Prayer times, computed entirely on-device (see prayerCalc.ts for the
// astronomy and the Moonsighting Committee method). No network calls, no
// API keys -- times are available instantly and offline, and the method
// matches what apps like Pillars use for the UK.

import {
  CalcOptions,
  computePrayerTimesUtc,
  type PrayerTimesUtcHours,
} from "./prayerCalc";

export type {
  CalcOptions,
  CalculationMethodKey,
  Madhab,
  Shafaq,
} from "./prayerCalc";

export type PrayerTimes = {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
};

// ---------------------------------------------------------------------------
// Memo over the astronomy
//
// A day's event times are a pure function of (coordinates, method, calendar
// day), and the screens ask for the same handful of days over and over: the
// home screen's countdown recomputes yesterday, today AND tomorrow on every
// minute tick, and the prayer screen recomputes today and tomorrow on the
// same cadence — around thirty solar solves a minute, every one of them
// reproducing a result that cannot have changed.
//
// What is cached is the raw UTC hours, NOT the formatted output. Handing the
// same Date objects to every caller would make them shared mutable state:
// notificationPlan puts `entry.time` straight into a notification plan, so one
// stray setMinutes() somewhere would corrupt the times every other screen
// reads. Rebuilding six Dates per call costs nothing next to twelve solar
// solves, and it keeps both public functions below returning fresh objects.
// ---------------------------------------------------------------------------

const utcCache = new Map<string, PrayerTimesUtcHours | null>();
/** Bounded so a long session can't accumulate keys without limit. */
const UTC_CACHE_MAX = 96;

/**
 * Coordinates are quantised to ~11 m before they reach the key: without that
 * a walking user's GPS jitter invalidates the entry on every fix, while
 * changing the times by far less than the minute they are displayed to.
 */
function cachedTimesUtc(
  lat: number,
  lng: number,
  options: CalcOptions,
  year: number,
  month: number,
  day: number,
): PrayerTimesUtcHours | null {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${options.method ?? ""},${
    options.madhab ?? ""
  },${options.shafaq ?? ""},${year}-${month}-${day}`;
  const cached = utcCache.get(key);
  // `undefined` is "not cached"; a cached `null` (polar day/night) is a real
  // answer and must not be recomputed.
  if (cached !== undefined) return cached;

  const computed = computePrayerTimesUtc(lat, lng, { year, month, day }, options);
  if (utcCache.size >= UTC_CACHE_MAX) {
    // Oldest-first eviction: Map iterates in insertion order, and the days
    // being asked for advance monotonically, so the oldest key is also the
    // least likely to be wanted again.
    const oldest = utcCache.keys().next();
    if (!oldest.done) utcCache.delete(oldest.value);
  }
  utcCache.set(key, computed);
  return computed;
}

/**
 * Prayer times for a location on a calendar day (defaults to today),
 * formatted "HH:MM" in the device's local time zone.
 *
 * Returns null only in polar day/night conditions where sunrise/sunset
 * don't exist -- callers should treat that as "nothing to show".
 */
export function computePrayerTimes(
  lat: number,
  lng: number,
  options: CalcOptions = {},
  date: Date = new Date(),
): PrayerTimes | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const utc = cachedTimesUtc(lat, lng, options, year, month, day);
  if (!utc) return null;

  const format = (hoursUtc: number): string => {
    // Round to the nearest minute, then let Date render it in local time.
    const ms = Date.UTC(year, month - 1, day) + Math.round(hoursUtc * 60) * 60_000;
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  return {
    Fajr: format(utc.fajr),
    Sunrise: format(utc.sunrise),
    Dhuhr: format(utc.dhuhr),
    Asr: format(utc.asr),
    Maghrib: format(utc.maghrib),
    Isha: format(utc.isha),
  };
}

export type PrayerScheduleEntry = {
  key: "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
  label: string;
  time: Date;
  display: string;
};

/**
 * Like computePrayerTimes, but returns real Date objects (plus "HH:MM"
 * display strings) so screens can run countdowns, highlight the current
 * prayer, and draw the sun arc.
 *
 * The astronomy behind this is memoized (see cachedTimesUtc), but the array,
 * the entries and the Dates are built fresh on every call — callers own what
 * they get back.
 */
export function computePrayerSchedule(
  lat: number,
  lng: number,
  options: CalcOptions = {},
  date: Date = new Date(),
): PrayerScheduleEntry[] | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const utc = cachedTimesUtc(lat, lng, options, year, month, day);
  if (!utc) return null;

  const make = (
    key: PrayerScheduleEntry["key"],
    label: string,
    hoursUtc: number,
  ): PrayerScheduleEntry => {
    const time = new Date(
      Date.UTC(year, month - 1, day) + Math.round(hoursUtc * 60) * 60_000,
    );
    const display = `${String(time.getHours()).padStart(2, "0")}:${String(
      time.getMinutes(),
    ).padStart(2, "0")}`;
    return { key, label, time, display };
  };

  return [
    make("fajr", "Fajr", utc.fajr),
    make("sunrise", "Sunrise", utc.sunrise),
    make("dhuhr", "Dhuhr", utc.dhuhr),
    make("asr", "Asr", utc.asr),
    make("maghrib", "Maghrib", utc.maghrib),
    make("isha", "Isha", utc.isha),
  ];
}

export type ForbiddenWindow = {
  key: "shurooq" | "zawal";
  label: string;
  start: Date;
  end: Date;
  display: string;
};

/**
 * Computes Makruh (prohibited) prayer windows when optional/voluntary (Nafl)
 * prayers are forbidden:
 * 1. Shurooq: from sunrise until ~15 minutes after sunrise.
 * 2. Zawal: ~10 minutes immediately preceding Dhuhr when the sun is at its zenith.
 */
export function computeForbiddenWindows(
  schedule: PrayerScheduleEntry[],
): ForbiddenWindow[] {
  const sunrise = schedule.find((e) => e.key === "sunrise")?.time;
  const dhuhr = schedule.find((e) => e.key === "dhuhr")?.time;
  if (!sunrise || !dhuhr) return [];

  const formatHm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const shurooqEnd = new Date(sunrise.getTime() + 15 * 60_000);
  const zawalStart = new Date(dhuhr.getTime() - 10 * 60_000);

  return [
    {
      key: "shurooq",
      label: "Post-Sunrise (Shurooq)",
      start: sunrise,
      end: shurooqEnd,
      display: `${formatHm(sunrise)} - ${formatHm(shurooqEnd)}`,
    },
    {
      key: "zawal",
      label: "Pre-Dhuhr Zenith (Zawal)",
      start: zawalStart,
      end: dhuhr,
      display: `${formatHm(zawalStart)} - ${formatHm(dhuhr)}`,
    },
  ];
}

/**
 * Calculates the Tahajjud window (the blessed last third of the night)
 * between Maghrib (sunset) and tomorrow's Fajr (dawn).
 */
export function computeTahajjudWindow(
  maghribTime: Date,
  tomorrowFajrTime: Date,
): { start: Date; end: Date; display: string } {
  const nightDurationMs = tomorrowFajrTime.getTime() - maghribTime.getTime();
  const start = new Date(maghribTime.getTime() + Math.round((2 / 3) * nightDurationMs));
  const end = tomorrowFajrTime;

  const formatHm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return {
    start,
    end,
    display: `${formatHm(start)} - ${formatHm(end)}`,
  };
}

