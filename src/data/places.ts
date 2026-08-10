// ---------------------------------------------------------------------------
// Place schema + shared helpers over it.
//
// Deliberately NOT bundled with data: this app requires a live connection
// (see PlacesContext) precisely so the manually-curated place list is never
// shipped as a static asset inside the app binary, where anyone could
// extract it by unzipping the install. src/data/places.json still exists as
// the data PIPELINE's artifact (what scripts/sync-places.mjs writes and
// scripts/csv-to-places.mjs / scripts/verify-places.mjs read) -- it is just
// never imported from here, so Metro never bundles it into the app.
// ---------------------------------------------------------------------------

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

export type Confidence = "verified" | "community" | "unverified";

/**
 * A record counts as corroborated unless it is explicitly "unverified".
 * Used by the "hide unconfirmed places" filter: some entries in the source
 * directory are years old and can't be found on the ground, so users who
 * are travelling need a way to see only places backed by more than one
 * source. Records with no confidence set are treated as corroborated —
 * absence of a value is not evidence of doubt.
 */
export function isCorroborated(place: Place): boolean {
  return place.confidence !== "unverified";
}

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
 * Deep equality for two loaded datasets, used to decide whether a refresh
 * actually changed anything (see PlacesContext).
 *
 * This replaces a `JSON.stringify(places)` fingerprint. That built a ~1.5 MB
 * string out of a few thousand rows on EVERY successful fetch — launch, every
 * foreground after a minute, and every realtime notification — and then held
 * onto it for the rest of the session so the next fetch had something to
 * compare against. This allocates nothing, stops at the first difference
 * (which is the common case when something really did change), and compares
 * against the array already in state.
 *
 * Every field is compared, and placesEqual is unit-tested by mutating each
 * key of a fully-populated place in turn — so a field added to `Place` and
 * forgotten here fails the test rather than silently freezing that field's
 * updates on screen.
 */
export function placesEqual(a: readonly Place[], b: readonly Place[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!placeEqual(a[i], b[i])) return false;
  }
  return true;
}

function placeEqual(a: Place, b: Place): boolean {
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.type !== b.type ||
    a.address !== b.address ||
    a.lat !== b.lat ||
    a.lng !== b.lng ||
    a.jumuahOnly !== b.jumuahOnly ||
    a.notes !== b.notes ||
    a.lastVerified !== b.lastVerified ||
    a.source !== b.source ||
    a.phone !== b.phone ||
    a.website !== b.website ||
    a.facebook !== b.facebook ||
    a.instagram !== b.instagram ||
    a.confidence !== b.confidence
  ) {
    return false;
  }
  for (const key of FACILITY_KEYS) {
    if (a.facilities[key] !== b.facilities[key]) return false;
  }
  if (!stringsEqual(a.jumuahTimes, b.jumuahTimes)) return false;
  return jamaatEqual(a.jamaat, b.jamaat);
}

function stringsEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function jamaatEqual(a?: JamaatTimes, b?: JamaatTimes): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.source === b.source &&
    a.recordedOn === b.recordedOn &&
    a.fajr === b.fajr &&
    a.dhuhr === b.dhuhr &&
    a.asr === b.asr &&
    a.maghrib === b.maghrib &&
    a.isha === b.isha
  );
}

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
 * are subjective. Denomination stays in the DATA (it's real information)
 * but is not displayed: sectarian labels on a place people pray at are
 * divisive in a way a locator app has no business amplifying. "Irregular
 * venue" flags become a plain-English warning.
 */
export function cleanNotes(notes: string): string | undefined {
  const parts = notes
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^data\s*:/i.test(part)) return null;
      if (/^capacity\b/i.test(part)) return null;
      if (/^denominations?\s*:/i.test(part)) return null;
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
 * Some directory rows carry a blank "additional directions" CSV column
 * concatenated straight into the address, so it shows up as a literal
 * segment like "17 Wellington Road, n/a, Tipton,Sandwell, DY4 8RS" or
 * "...Cavan,None until 2015" — junk that reads as part of the street
 * address unless it's stripped. Only the offending segment (and, for a
 * leading international dialling code like "+353", its own segment) is
 * removed; every other segment's existing comma/spacing style is left
 * untouched, since that is this dataset's normal (if inconsistent) format,
 * not a defect.
 */
const ADDRESS_JUNK_SEGMENT_RE =
  /(?:n\/a|none|not\s+known|unknown|tbc|tbd|tba|none\s+(?:until|in|till)\s*\d{4}|not\s+until\s*\d{4}|none\s+working)/i;

// Derived from the pattern above, and compiled ONCE. These two were built with
// `new RegExp(...)` inside cleanAddress, so loading the dataset compiled two
// fresh regexes per row — a few thousand compilations on every launch and
// every foreground refresh, which made this function cost several times what
// the rest of the row validation put together does.
const ADDRESS_JUNK_MID_RE = new RegExp(
  `,\\s*${ADDRESS_JUNK_SEGMENT_RE.source}\\s*(?=,|$)`,
  "gi",
);
const ADDRESS_JUNK_LEADING_RE = new RegExp(
  `^\\s*${ADDRESS_JUNK_SEGMENT_RE.source}\\s*,\\s*`,
  "i",
);

export function cleanAddress(address: string): string {
  let out = address;
  // ADDRESS_JUNK_MID_RE carries the `g` flag, which means it also carries a
  // mutable lastIndex — safe here because String.replace with a global regex
  // resets it, but the reason this must stay `replace` and never `test`/`exec`.
  out = out.replace(ADDRESS_JUNK_MID_RE, "");
  out = out.replace(ADDRESS_JUNK_LEADING_RE, "");
  out = out.replace(/,\s*(\+\d{1,4})\s*(?=,|$)/g, "");
  out = out.replace(/^\s*(\+\d{1,4})\s*,\s*/, "");
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/,\s*$/, "");
  return out.trim();
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

