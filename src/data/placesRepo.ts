import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  FACILITY_KEYS,
  FacilityKey,
  JamaatTimes,
  Place,
  PlaceType,
} from "@/data/places";
import { supabase } from "@/lib/supabase";

const CACHE_KEY = "places:v1";
const FETCH_TIMEOUT_MS = 8000;

const PLACE_TYPES: readonly PlaceType[] = [
  "masjid",
  "musalla",
  "multi_faith_room",
];

const JAMAAT_PRAYER_KEYS = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
] as const;

/** "5:15" / "05:15" — the only shape the UI renders as a jamaat time. */
const TIME_RE = /^\d{1,2}:\d{2}$/;

/**
 * Raw Supabase row. Every field is `unknown` on purpose: the table can be
 * edited by hand in the dashboard, so nothing is trusted until validated.
 */
type PlacesRow = {
  id: unknown;
  name: unknown;
  type: unknown;
  address: unknown;
  lat: unknown;
  lng: unknown;
  facilities: unknown;
  jumuah_only: unknown;
  jumuah_times: unknown;
  jamaat: unknown;
  notes: unknown;
  last_verified: unknown;
  source: unknown;
  phone: unknown;
  website: unknown;
  facebook: unknown;
  instagram: unknown;
  confidence: unknown;
};

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Links are only kept when they are real web URLs Linking can open safely. */
function asOptionalUrl(value: unknown): string | undefined {
  const s = asOptionalString(value);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
}

/**
 * An unknown type (e.g. a typo'd enum value) falls back to the most generic
 * label instead of rendering "undefined" all over the UI.
 */
function coerceType(value: unknown): PlaceType {
  return (PLACE_TYPES as readonly string[]).includes(value as string)
    ? (value as PlaceType)
    : "musalla";
}

/**
 * Facilities are coerced key-by-key so a missing/malformed JSON column
 * yields "all false" rather than an undefined-property crash.
 */
function coerceFacilities(value: unknown): Record<FacilityKey, boolean> {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const facilities = {} as Record<FacilityKey, boolean>;
  for (const key of FACILITY_KEYS) {
    facilities[key] = raw[key] === true;
  }
  return facilities;
}

/**
 * Jamaat is validated field-by-field, not cast: its values are rendered
 * directly as Text children, so a stray number/object in the jsonb column
 * would otherwise crash the detail screen for every user. Kept only when
 * source and recordedOn exist and at least one prayer time parses.
 */
function coerceJamaat(value: unknown): JamaatTimes | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const source = asOptionalString(raw.source);
  const recordedOn = asOptionalString(raw.recordedOn);
  if (!source || !recordedOn) return undefined;
  const jamaat: JamaatTimes = { source, recordedOn };
  let hasTime = false;
  for (const key of JAMAAT_PRAYER_KEYS) {
    const t = raw[key];
    if (typeof t === "string" && TIME_RE.test(t.trim())) {
      jamaat[key] = t.trim();
      hasTime = true;
    }
  }
  return hasTime ? jamaat : undefined;
}

/**
 * Validate + assemble one place from an untrusted record with camelCase
 * keys. Returns null for malformed records: one bad row (a half-finished
 * dashboard edit, a stale cache entry from an old app version) must be
 * skipped quietly, not crash the list, map, and detail screens.
 */
function buildPlace(raw: Record<string, unknown>): Place | null {
  if (typeof raw.id !== "string" || raw.id === "") return null;
  if (typeof raw.name !== "string" || raw.name === "") return null;
  if (typeof raw.address !== "string") return null;
  if (typeof raw.lat !== "number" || !Number.isFinite(raw.lat)) return null;
  if (typeof raw.lng !== "number" || !Number.isFinite(raw.lng)) return null;

  const place: Place = {
    id: raw.id,
    name: raw.name,
    type: coerceType(raw.type),
    address: raw.address,
    lat: raw.lat,
    lng: raw.lng,
    facilities: coerceFacilities(raw.facilities),
  };

  if (raw.jumuahOnly === true) {
    place.jumuahOnly = true;
  }
  if (
    Array.isArray(raw.jumuahTimes) &&
    raw.jumuahTimes.length > 0 &&
    raw.jumuahTimes.every((t): t is string => typeof t === "string")
  ) {
    place.jumuahTimes = raw.jumuahTimes;
  }
  const jamaat = coerceJamaat(raw.jamaat);
  if (jamaat) place.jamaat = jamaat;

  const notes = asOptionalString(raw.notes);
  if (notes) place.notes = notes;
  const lastVerified = asOptionalString(raw.lastVerified);
  if (lastVerified) place.lastVerified = lastVerified;
  const source = asOptionalString(raw.source);
  if (source) place.source = source;
  const phone = asOptionalString(raw.phone);
  if (phone) place.phone = phone;
  const website = asOptionalUrl(raw.website);
  if (website) place.website = website;
  const facebook = asOptionalUrl(raw.facebook);
  if (facebook) place.facebook = facebook;
  const instagram = asOptionalUrl(raw.instagram);
  if (instagram) place.instagram = instagram;

  if (
    raw.confidence === "verified" ||
    raw.confidence === "community" ||
    raw.confidence === "unverified"
  ) {
    place.confidence = raw.confidence;
  }

  return place;
}

/** Map one Supabase row (snake_case) onto the shared validator. */
function mapRowToPlace(row: PlacesRow): Place | null {
  return buildPlace({
    id: row.id,
    name: row.name,
    type: row.type,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    facilities: row.facilities,
    jumuahOnly: row.jumuah_only,
    jumuahTimes: row.jumuah_times,
    jamaat: row.jamaat,
    notes: row.notes,
    lastVerified: row.last_verified,
    source: row.source,
    phone: row.phone,
    website: row.website,
    facebook: row.facebook,
    instagram: row.instagram,
    confidence: row.confidence,
  });
}

async function readCache(): Promise<Place[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Cached entries get the same validation as network rows: a cache
    // written by an older app version (or corrupted on disk) must degrade
    // to the bundled data, not flow unchecked into the UI.
    const places = parsed
      .map((entry) =>
        entry && typeof entry === "object"
          ? buildPlace(entry as Record<string, unknown>)
          : null,
      )
      .filter((place): place is Place => place !== null);
    return places.length > 0 ? places : null;
  } catch {
    return null;
  }
}

async function writeCache(places: Place[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(places));
  } catch {
    // Cache write failure must not break the app.
  }
}

/**
 * Last successfully fetched places from the on-device cache, or null.
 * Read this first on launch (stale-while-revalidate): it renders instantly
 * with no network wait, then `fetchPlaces` refreshes in the background.
 */
export async function getCachedPlaces(): Promise<Place[] | null> {
  return readCache();
}

/**
 * Fetch the latest places from Supabase, or null when offline/unconfigured/
 * failed. Callers decide the fallback (cache, bundled data, keep current).
 */
export async function fetchPlaces(): Promise<Place[] | null> {
  if (!supabase) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { data, error } = await supabase
      .from("places")
      .select("*")
      .abortSignal(controller.signal);

    if (error || !data || data.length === 0) {
      return null;
    }

    const places = (data as PlacesRow[])
      .map(mapRowToPlace)
      .filter((place): place is Place => place !== null);
    if (places.length === 0) return null;

    // Fire-and-forget: don't make the UI wait on a disk write.
    void writeCache(places);
    return places;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
