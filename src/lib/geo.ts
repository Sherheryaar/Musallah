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
