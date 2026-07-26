import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  FacilityKey,
  JamaatTimes,
  Place,
  PlaceType,
  PLACES,
} from "@/data/places";
import { supabase } from "@/lib/supabase";

const CACHE_KEY = "places:v1";
const FETCH_TIMEOUT_MS = 8000;

const PLACE_TYPES: readonly PlaceType[] = [
  "masjid",
  "musalla",
  "multi_faith_room",
];

const FACILITY_KEYS: readonly FacilityKey[] = [
  "sistersSpace",
  "wudu",
  "disabledAccess",
  "parking",
  "jumuah",
  "janazah",
];

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

/**
 * Validate + map one row. Returns null for malformed rows: one bad row (a
 * half-finished dashboard edit, a broken import) must be skipped quietly,
 * not crash the list, map, and detail screens for every user.
 */
function mapRowToPlace(row: PlacesRow): Place | null {
  if (typeof row.id !== "string" || row.id === "") return null;
  if (typeof row.name !== "string" || row.name === "") return null;
  if (typeof row.address !== "string") return null;
  if (typeof row.lat !== "number" || !Number.isFinite(row.lat)) return null;
  if (typeof row.lng !== "number" || !Number.isFinite(row.lng)) return null;

  // An unknown type (e.g. a typo'd enum value) falls back to the most
  // generic label instead of rendering "undefined" all over the UI.
  const type: PlaceType = (PLACE_TYPES as readonly string[]).includes(
    row.type as string,
  )
    ? (row.type as PlaceType)
    : "musalla";

  // Facilities are coerced key-by-key so a missing/malformed JSON column
  // yields "all false" rather than an undefined-property crash.
  const rawFacilities =
    row.facilities && typeof row.facilities === "object"
      ? (row.facilities as Record<string, unknown>)
      : {};
  const facilities = {} as Record<FacilityKey, boolean>;
  for (const key of FACILITY_KEYS) {
    facilities[key] = rawFacilities[key] === true;
  }

  const place: Place = {
    id: row.id,
    name: row.name,
    type,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    facilities,
  };

  if (row.jumuah_only === true) {
    place.jumuahOnly = true;
  }
  if (
    Array.isArray(row.jumuah_times) &&
    row.jumuah_times.length > 0 &&
    row.jumuah_times.every((t): t is string => typeof t === "string")
  ) {
    place.jumuahTimes = row.jumuah_times;
  }
  if (row.jamaat && typeof row.jamaat === "object") {
    place.jamaat = row.jamaat as JamaatTimes;
  }

  const notes = asOptionalString(row.notes);
  if (notes) place.notes = notes;
  const lastVerified = asOptionalString(row.last_verified);
  if (lastVerified) place.lastVerified = lastVerified;
  const source = asOptionalString(row.source);
  if (source) place.source = source;
  const phone = asOptionalString(row.phone);
  if (phone) place.phone = phone;
  const website = asOptionalString(row.website);
  if (website) place.website = website;
  const facebook = asOptionalString(row.facebook);
  if (facebook) place.facebook = facebook;
  const instagram = asOptionalString(row.instagram);
  if (instagram) place.instagram = instagram;

  if (
    row.confidence === "verified" ||
    row.confidence === "community" ||
    row.confidence === "unverified"
  ) {
    place.confidence = row.confidence;
  }

  return place;
}

async function readCache(): Promise<Place[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Place[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
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

/**
 * One-shot answer: network first, then cache, then bundled data.
 * Prefer getCachedPlaces + fetchPlaces for UI code (no network wait).
 */
export async function getPlaces(): Promise<Place[]> {
  const fetched = await fetchPlaces();
  if (fetched) return fetched;
  const cached = await readCache();
  return cached ?? PLACES;
}
