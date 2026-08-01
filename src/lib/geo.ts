// Shared geography constants. One definition so the home screen, prayer
// screen, and map can never drift apart.

/** Central London (Charing Cross) — used whenever no GPS fix is available. */
export const FALLBACK_LOCATION = { lat: 51.5074, lng: -0.1278 };

/**
 * Rough UK & Ireland bounding box — matches the dataset's actual coverage
 * (MuslimsInBritain.org spans both). Area search only accepts geocoder hits
 * inside it, so "Paris" can't silently re-anchor every distance to France.
 * Ambiguity WITHIN the box ("Stratford" in London vs Stratford-upon-Avon)
 * is resolved by picking the hit nearest the user, not the first hit.
 */
export const COVERAGE_BOUNDS = {
  minLat: 49.0,
  maxLat: 61.0, // includes Shetland
  minLng: -11.0, // includes the west of Ireland
  maxLng: 2.0,
};

export function isInCoverage(lat: number, lng: number): boolean {
  return (
    lat >= COVERAGE_BOUNDS.minLat &&
    lat <= COVERAGE_BOUNDS.maxLat &&
    lng >= COVERAGE_BOUNDS.minLng &&
    lng <= COVERAGE_BOUNDS.maxLng
  );
}

// ---------------------------------------------------------------------------
// Area-search sanity check
//
// Device geocoders are extremely lenient: they'll resolve a string of random
// words to SOMEWHERE rather than admit defeat, which used to silently
// re-anchor every distance to a place the user never asked for. After
// geocoding, the hit is reverse-geocoded and its naming (city, district,
// street, postcode...) is compared against what the user typed — if nothing
// the user typed appears anywhere in what that location is actually called,
// the hit is rejected as a geocoder guess.
// ---------------------------------------------------------------------------

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * True when a and b differ by at most one typo: a substitution, an
 * insertion/deletion, or an adjacent transposition ("stratfrod" —
 * swapped letters are the most common real-world typo).
 */
function within1Edit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    // One substitution...
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    // ...or one adjacent swap.
    return (
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    );
  }
  // Lengths differ by one: a single insertion/deletion.
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

/**
 * Does the typed query plausibly name the geocoded place described by
 * `fields` (its reverse-geocoded name, street, district, city, region,
 * postcode...)? One matching token is enough: "stratford london" only needs
 * "stratford" to appear. Tokens of 5+ letters tolerate a single typo.
 */
export function queryMatchesPlaceFields(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const queryTokens = normalise(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (queryTokens.length === 0) return false;
  const fieldText = normalise(fields.filter(Boolean).join(" "));
  if (!fieldText) return false;
  const fieldTokens = fieldText.split(/[^a-z0-9]+/).filter(Boolean);
  return queryTokens.some(
    (token) =>
      fieldText.includes(token) ||
      (token.length >= 5 &&
        fieldTokens.some((field) => within1Edit(token, field))),
  );
}
