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

// ---------------------------------------------------------------------------
// Generic-name disambiguation
//
// The directory data contains dozens of places literally named "Prayer
// Room", "Multi-Faith Room", or "Jumu'ah Salaah" — a list showing five
// identical "Prayer Room" rows tells the user nothing. The venue is almost
// always the first useful segment of the address ("University College
// Hospital, 235 Euston Road, ..."), so generic names get it appended:
// "Prayer Room (University College Hospital)". Applied at load time for
// every data path (bundled, network, cache) and idempotent — an already
// disambiguated name no longer matches the generic pattern.
// ---------------------------------------------------------------------------

const GENERIC_NAME_RE =
  /^(muslim |all faiths? |islamic )?(jumu'?ah salaa?h|prayer|quiet|multi[- ]?faith|multifaith|contemplation|faith|chapel|chaplaincy|musall?ah?)\s*(room|rooms|space|hall|area|centre|center|facility)?$/i;

/** Address segments that are floors/cabins/directions, never the venue. */
const SEGMENT_SKIP_RE =
  /^\d|\b(floor|portakabin|c\/o)\b|^(unit|room|suite|block|level|adjacent|opposite|behind|near|off|rear|inside|within)\b/i;

/** Segments that clearly name a venue — preferred over street names. */
const VENUE_HINT_RE =
  /\b(hospital|infirmary|university|college|school|academy|campus|airport|station|museum|gallery|library|stadium|arena|shopping|services|hotel|hospice|court|market|village|trust|mosque|centre|center)\b/i;

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

/**
 * Strip internal bookkeeping from user-facing notes. Directory notes look
 * like "Capacity ~700 (MuslimsInBritain.org); Denomination: Deobandi;
 * Data: MIB+OSM (mib-2203)" — the data-source tags mean nothing to users
 * (provenance already lives in the `source` field) and capacity figures
 * are subjective. Denomination is kept (genuinely useful when choosing a
 * masjid) and "irregular venue" flags become a plain-English warning.
 */
export function cleanNotes(notes: string): string | undefined {
  const parts = notes
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^data\s*:/i.test(part)) return null;
      if (/^capacity\b/i.test(part)) return null;
      if (/irregular|part-?time/i.test(part)) {
        return "May be an irregular or part-time venue — check before travelling";
      }
      // Drop provenance parentheticals inside kept segments.
      return part.replace(/\s*\((?:MuslimsInBritain[^)]*|MIB[^)]*|OSM[^)]*)\)/gi, "").trim();
    })
    .filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Facility knowledge that follows from what a place IS: a masjid holds
 * jumu'ah and provides wudu by definition — directory rows just don't
 * record it. Nothing else is ever assumed (sisters' space, parking,
 * disabled access, janazah): a wrong "yes" there sends someone on a wasted
 * journey and erodes trust in every other tick.
 */
export function applyFacilityDefaults(
  type: PlaceType,
  facilities: Record<FacilityKey, boolean>,
): Record<FacilityKey, boolean> {
  if (type !== "masjid") return facilities;
  return { ...facilities, jumuah: true, wudu: true };
}

export function disambiguateName(name: string, address: string): string {
  const trimmed = name.trim();
  if (!GENERIC_NAME_RE.test(trimmed)) return name;
  if (!address || /not recorded/i.test(address)) return name;

  const lowerName = trimmed.toLowerCase();
  const candidates = address
    .split(",")
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 3 &&
        s.length <= 60 &&
        !SEGMENT_SKIP_RE.test(s) &&
        !POSTCODE_RE.test(s) &&
        !GENERIC_NAME_RE.test(s) &&
        !lowerName.includes(s.toLowerCase()),
    );

  const pick = candidates.find((s) => VENUE_HINT_RE.test(s)) ?? candidates[0];
  if (!pick) return name;
  return `${trimmed} (${pick.replace(/[()]/g, "").trim()})`;
}

/**
 * Bundled offline dataset (see header comment). The cast is safe because
 * places.json is only ever produced by scripts/sync-places.mjs or
 * scripts/csv-to-places.mjs, both of which enforce the full Place shape
 * before writing: ids, coordinates, place types, facility booleans, jamaat
 * structure (source/recordedOn/HH:MM times), confidence enum, and http(s)
 * URLs. Generic names are disambiguated here, at load time.
 */
export const PLACES: Place[] = (bundledPlaces as unknown as Place[]).map(
  (place) => ({
    ...place,
    name: disambiguateName(place.name, place.address),
    facilities: applyFacilityDefaults(place.type, place.facilities),
    notes: place.notes ? cleanNotes(place.notes) : undefined,
  }),
);
