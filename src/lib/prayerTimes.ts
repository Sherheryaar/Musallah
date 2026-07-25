// Prayer times, computed entirely on-device (see prayerCalc.ts for the
// astronomy and the Moonsighting Committee method). No network calls, no
// cache, no API keys -- times are available instantly and offline, and the
// method matches what apps like Pillars use for the UK.

import { CalcOptions, computePrayerTimesUtc } from "./prayerCalc";

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

  const utc = computePrayerTimesUtc(lat, lng, { year, month, day }, options);
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

  const utc = computePrayerTimesUtc(lat, lng, { year, month, day }, options);
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
