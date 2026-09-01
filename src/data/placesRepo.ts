import {
  applyFacilityDefaults,
  cleanAddress,
  cleanNotes,
  disambiguateName,
  FACILITY_KEYS,
  FacilityKey,
  JamaatTimes,
  Place,
  PlaceType,
  PRAYER_KEYS,
} from "@/data/places";
import { supabase } from "@/lib/supabase";

const FETCH_TIMEOUT_MS = 8000;
// PostgREST caps any single response at 1000 rows (its default max), so the
// full table must be read in pages. The page count backstop only exists to
// bound the loop if the table grows wildly.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const PLACE_TYPES: readonly PlaceType[] = [
  "masjid",
  "musalla",
  "multi_faith_room",
];

/**
 * "5:15" / "05:15" with hour 0-23 and minute 0-59 becomes "05:15"; anything
 * else is null. The UI renders this text directly AND compares it to the
 * current clock as a string (the place screen's "Next" pill), so a value has
 * to come out of here both well-formed and zero-padded. A digit-count-only
 * regex would also accept "25:99"; a malformed value must be rejected, not
 * just shaped.
 */
function toHHMM(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

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
 * label instead of rendering "undefined" all over the UI. Case/whitespace
 * are normalised first so a hand-edited "Masjid" still matches "masjid" —
 * otherwise it fell to "musalla" and silently lost the masjid-only facility
 * defaults (jumu'ah, wudu) applied below.
 */
function coerceType(value: unknown): PlaceType {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : value;
  return (PLACE_TYPES as readonly string[]).includes(normalized as string)
    ? (normalized as PlaceType)
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
  for (const key of PRAYER_KEYS) {
    const t = toHHMM(raw[key]);
    if (t) {
      jamaat[key] = t;
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
  if (
    typeof raw.lat !== "number" ||
    !Number.isFinite(raw.lat) ||
    raw.lat < -90 ||
    raw.lat > 90
  ) {
    return null;
  }
  if (
    typeof raw.lng !== "number" ||
    !Number.isFinite(raw.lng) ||
    raw.lng < -180 ||
    raw.lng > 180
  ) {
    return null;
  }

  const type = coerceType(raw.type);
  const address = cleanAddress(raw.address);
  const place: Place = {
    id: raw.id,
    // "Prayer Room" x63 in the dataset — append the venue from the address
    // so identical generic names stop being indistinguishable.
    name: disambiguateName(raw.name, address),
    type,
    address,
    lat: raw.lat,
    lng: raw.lng,
    // Masjid ⇒ jumu'ah + wudu by definition; nothing else is assumed.
    facilities: applyFacilityDefaults(type, coerceFacilities(raw.facilities)),
  };

  if (raw.jumuahOnly === true) {
    place.jumuahOnly = true;
  }
  if (Array.isArray(raw.jumuahTimes) && raw.jumuahTimes.length > 0) {
    const times = raw.jumuahTimes.map(toHHMM);
    // All or nothing: one malformed entry means the row was hand-edited
    // badly, and showing the survivors as "the" Jumu'ah times would mislead.
    if (times.every((t): t is string => t !== null)) {
      place.jumuahTimes = times;
    }
  }
  const jamaat = coerceJamaat(raw.jamaat);
  if (jamaat) place.jamaat = jamaat;

  const notes = asOptionalString(raw.notes);
  if (notes) {
    const cleaned = cleanNotes(notes);
    if (cleaned) place.notes = cleaned;
  }
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

  if (typeof raw.confidence === "string" && raw.confidence.trim() !== "") {
    const normalized = raw.confidence.trim().toLowerCase();
    // isCorroborated() (places.ts) treats a MISSING confidence as
    // corroborated by design, for genuinely-untouched rows. An unrecognised
    // but PRESENT value (a typo, wrong casing) must not fall into that same
    // "missing" bucket -- that would silently show an intended-unverified
    // place as verified. Treat it as the conservative "unverified" instead.
    place.confidence =
      normalized === "verified" ||
      normalized === "community" ||
      normalized === "unverified"
        ? normalized
        : "unverified";
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

/**
 * Fetch the latest places from Supabase, or null when offline/unconfigured/
 * failed. Deliberately no on-device cache and no bundled fallback dataset:
 * this app requires a live connection so the manually-curated place list
 * is never written anywhere it could be lifted from a single device or
 * app-bundle extraction (see the header comment on src/data/places.ts).
 * Callers (PlacesContext) decide what to show while there's nothing yet.
 */
export async function fetchPlaces(): Promise<Place[] | null> {
  if (!supabase) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Page through the whole table. A bare select("*") silently stops at
    // PostgREST's 1000-row cap, which once shipped an app that lost more
    // than half the dataset whenever the network fetch succeeded.
    //
    // Paged by a KEYSET (id > lastSeenId), not offset/range: offset paging
    // re-runs "skip N rows" on each request, so a row inserted or deleted
    // ahead of the cursor between two page requests shifts every later
    // row's position and the next page silently skips or repeats one.
    // Ordering by id makes id > lastSeenId a stable cursor regardless of
    // concurrent writes elsewhere in the table.
    const rows: PlacesRow[] = [];
    let lastSeenId: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from("places")
        .select("*")
        .order("id")
        .limit(PAGE_SIZE)
        .abortSignal(controller.signal);
      if (lastSeenId !== null) {
        query = query.gt("id", lastSeenId);
      }
      const { data, error } = await query;

      if (error) return null;
      if (!data || data.length === 0) break;
      rows.push(...(data as PlacesRow[]));
      lastSeenId = (data[data.length - 1] as PlacesRow).id as string;
      if (data.length < PAGE_SIZE) break;
    }
    if (rows.length === 0) return null;

    const places = rows
      .map(mapRowToPlace)
      .filter((place): place is Place => place !== null);
    if (places.length === 0) return null;

    return places;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
