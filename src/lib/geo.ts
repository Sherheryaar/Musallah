// Shared geography constants. One definition so the home screen, prayer
// screen, and map can never drift apart.

/** Central London (Charing Cross) — used whenever no GPS fix is available. */
export const FALLBACK_LOCATION = { lat: 51.5074, lng: -0.1278 };

/**
 * Rough Greater London bounding box. Area search only accepts geocoder hits
 * inside it — without this, "Stratford" happily resolves to
 * Stratford-upon-Avon (or Ontario) and every distance silently re-anchors
 * to the wrong place.
 */
export const COVERAGE_BOUNDS = {
  minLat: 51.2,
  maxLat: 51.8,
  minLng: -0.6,
  maxLng: 0.4,
};

export function isInCoverage(lat: number, lng: number): boolean {
  return (
    lat >= COVERAGE_BOUNDS.minLat &&
    lat <= COVERAGE_BOUNDS.maxLat &&
    lng >= COVERAGE_BOUNDS.minLng &&
    lng <= COVERAGE_BOUNDS.maxLng
  );
}
