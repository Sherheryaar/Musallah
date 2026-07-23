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

type PlacesRow = {
  id: string;
  name: string;
  type: string;
  address: string;
  lat: number;
  lng: number;
  facilities: Record<FacilityKey, boolean>;
  jumuah_times: string[] | null;
  jamaat: JamaatTimes | null;
  notes: string | null;
  last_verified: string | null;
  source: string | null;
  phone: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  confidence: string | null;
};

function mapRowToPlace(row: PlacesRow): Place {
  const place: Place = {
    id: row.id,
    name: row.name,
    type: row.type as PlaceType,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    facilities: row.facilities,
  };

  if (row.jumuah_times) {
    place.jumuahTimes = row.jumuah_times;
  }
  if (row.jamaat) {
    place.jamaat = row.jamaat;
  }
  if (row.notes) {
    place.notes = row.notes;
  }
  if (row.last_verified) {
    place.lastVerified = row.last_verified;
  }
  if (row.source) {
    place.source = row.source;
  }
  if (row.phone) {
    place.phone = row.phone;
  }
  if (row.website) {
    place.website = row.website;
  }
  if (row.facebook) {
    place.facebook = row.facebook;
  }
  if (row.instagram) {
    place.instagram = row.instagram;
  }
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

export async function getPlaces(): Promise<Place[]> {
  if (!supabase) {
    return PLACES;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { data, error } = await supabase
      .from("places")
      .select("*")
      .abortSignal(controller.signal);

    if (error || !data || data.length === 0) {
      throw new Error("places fetch failed");
    }

    const places = (data as PlacesRow[]).map(mapRowToPlace);
    await writeCache(places);
    return places;
  } catch {
    const cached = await readCache();
    return cached ?? PLACES;
  } finally {
    clearTimeout(timeoutId);
  }
}
