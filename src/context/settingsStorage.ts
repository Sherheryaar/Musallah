// Pure settings-persistence logic, kept out of the React context so it can
// be unit-tested without AsyncStorage or react-native.
//
// The persistence rule that matters: only fields the user has EXPLICITLY
// set are ever written to disk. Version 1 saved the whole settings object
// on any change, which froze the then-current defaults into storage — so
// when the default Asr madhab changed from shafi to hanafi, anyone who had
// ever touched any setting stayed on the old default forever.

import type { CalculationMethodKey, Madhab, Shafaq } from "@/lib/prayerCalc";
import { FACILITY_KEYS, type FacilityKey } from "@/data/places";

export const SETTINGS_STORAGE_KEY = "settings:v2";
export const LEGACY_SETTINGS_STORAGE_KEY = "settings:v1";

export type PrayerSettings = {
  /** Fajr/Isha rule set. Moonsighting Committee is recommended for the UK. */
  method: CalculationMethodKey;
  /** Asr juristic method: "shafi" = 1 mithl, "hanafi" = 2 mithl. */
  madhab: Madhab;
  /** Moonsighting Isha twilight rule: general (default), ahmer, or abyad. */
  shafaq: Shafaq;
  /**
   * Facility filters chosen on the home screen (sisters' space, wudu, ...).
   * Persisted so a choice made on first launch sticks on every later launch.
   */
  facilityFilters: FacilityKey[];
  /**
   * Hide places whose existence isn't corroborated by a second source.
   * Off by default: showing everything with an honest label beats hiding
   * places that are probably real, and most of the dataset is corroborated.
   */
  corroboratedOnly: boolean;
};

export const DEFAULT_SETTINGS: PrayerSettings = {
  method: "moonsighting",
  // Hanafi (2 mithl, later Asr) by default — the majority practice among
  // UK Muslims. Anyone following 1 mithl changes it once in Settings and
  // the choice persists.
  madhab: "hanafi",
  shafaq: "general",
  facilityFilters: [],
  corroboratedOnly: false,
};

// The defaults as they stood for the whole life of settings:v1. Because v1
// blobs hold every field, a stored value EQUAL to one of these cannot be
// told apart from "never touched" — migration drops it so the current
// default applies. A value that differs was a deliberate choice and is kept.
const V1_DEFAULTS = {
  method: "moonsighting",
  madhab: "shafi",
  shafaq: "general",
} as const;

/** Keep only well-formed fields from an untrusted stored blob. */
export function sanitizeSettings(parsed: unknown): Partial<PrayerSettings> {
  if (typeof parsed !== "object" || parsed === null) return {};
  const raw = parsed as Partial<PrayerSettings>;
  return {
    ...(raw.method === "moonsighting" || raw.method === "mwl"
      ? { method: raw.method }
      : null),
    ...(raw.madhab === "shafi" || raw.madhab === "hanafi"
      ? { madhab: raw.madhab }
      : null),
    ...(raw.shafaq === "general" ||
    raw.shafaq === "ahmer" ||
    raw.shafaq === "abyad"
      ? { shafaq: raw.shafaq }
      : null),
    ...(Array.isArray(raw.facilityFilters)
      ? {
          facilityFilters: raw.facilityFilters.filter(
            (key): key is FacilityKey =>
              (FACILITY_KEYS as string[]).includes(key as string),
          ),
        }
      : null),
    ...(typeof raw.corroboratedOnly === "boolean"
      ? { corroboratedOnly: raw.corroboratedOnly }
      : null),
  };
}

/** Convert a v1 full-object blob into a v2 explicit-choices-only blob. */
export function migrateV1Settings(parsed: unknown): Partial<PrayerSettings> {
  const clean = sanitizeSettings(parsed);
  const kept: Partial<PrayerSettings> = {};
  if (clean.method && clean.method !== V1_DEFAULTS.method) {
    kept.method = clean.method;
  }
  if (clean.madhab && clean.madhab !== V1_DEFAULTS.madhab) {
    kept.madhab = clean.madhab;
  }
  if (clean.shafaq && clean.shafaq !== V1_DEFAULTS.shafaq) {
    kept.shafaq = clean.shafaq;
  }
  if (clean.facilityFilters && clean.facilityFilters.length > 0) {
    kept.facilityFilters = clean.facilityFilters;
  }
  // corroboratedOnly postdates v1, so a v1 blob can never carry a
  // deliberate choice for it — always let the current default apply.
  return kept;
}
