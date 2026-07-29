// ---------------------------------------------------------------------------
// Place schema + the bundled offline dataset.
//
// The dataset itself lives in places.json so that `npm run build:places`
// (scripts/csv-to-places.mjs) can regenerate it from a CSV export of the
// Supabase `places` table without anyone hand-editing TypeScript.
//
// The shipped places.json is SAMPLE SEED DATA -- real London places, but
// placeholder facility details. Verify everything before showing it to real
// users (see project plan, §3).
// ---------------------------------------------------------------------------

import bundledPlaces from "./places.json";

export type PlaceType = "masjid" | "musalla" | "multi_faith_room";

export type FacilityKey =
  | "sistersSpace"
  | "wudu"
  | "disabledAccess"
  | "parking"
  | "jumuah"
  | "janazah";

export const FACILITY_LABELS: Record<FacilityKey, string> = {
  sistersSpace: "Sisters' space",
  wudu: "Wudu",
  disabledAccess: "Disabled access",
  parking: "Parking",
  jumuah: "Jumu'ah",
  janazah: "Janazah",
};

/**
 * The canonical facility key list. Derived from the labels so filters,
 * validation, and settings can never drift out of sync with each other.
 */
export const FACILITY_KEYS = Object.keys(FACILITY_LABELS) as FacilityKey[];

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  masjid: "Masjid",
  musalla: "Prayer room",
  multi_faith_room: "Multi-faith room",
};

export type JamaatTimes = {
  /** Display strings "HH:MM" 24h. Only include prayers you actually know. */
  fajr?: string;
  dhuhr?: string;
  asr?: string;
  maghrib?: string;
  isha?: string;
  /** Where these times came from, e.g. "Website timetable, July 2026". */
  source: string;
  /** ISO date the times were recorded. */
  recordedOn: string;
};

export type Place = {
  id: string;
  name: string;
  type: PlaceType;
  address: string;
  lat: number;
  lng: number;
  facilities: Record<FacilityKey, boolean>;
  /** Friday-only venue (e.g. hired Jumu'ah halls). Hidden unless the Jumu'ah filter is active. */
  jumuahOnly?: boolean;
  /** Jumu'ah start time(s) as display strings, if known. */
  jumuahTimes?: string[];
  jamaat?: JamaatTimes;
  notes?: string;
  /** ISO date this record was last checked by a human. */
  lastVerified?: string;
  /** Where this record's info came from (website, phone call, visit...). */
  source?: string;
  /** Contact and source links — where this place's truth lives online. */
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  /** How trustworthy this record is. */
  confidence?: "verified" | "community" | "unverified";
};

/**
 * Bundled offline dataset (see header comment). The cast is safe because
 * places.json is only ever produced by scripts/csv-to-places.mjs, which
 * enforces the full Place shape before writing: ids, coordinates, place
 * types, facility booleans, jamaat structure (source/recordedOn/HH:MM
 * times), confidence enum, and http(s) URLs.
 */
export const PLACES: Place[] = bundledPlaces as unknown as Place[];
