const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/** Straight-line (haversine) distance between two coordinates, in km. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      (sinLng * sinLng);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * A measuring function anchored at one origin, with that origin's trig
 * computed once.
 *
 * Sorting the whole dataset by distance is the app's most repeated
 * calculation — it re-runs on every GPS fix (~every 250 m of travel) and
 * every area search, across a few thousand places, and does it twice when a
 * search anchor differs from the user's own position. Half of `distanceKm`'s
 * trigonometry only depends on the origin, so hoisting it out of the loop
 * removes one cosine and two multiplications per place per pass.
 *
 * Results are bit-identical to `distanceKm(originLat, originLng, …)`: the same
 * operations in the same order, with the origin's terms simply evaluated
 * earlier.
 */
export function distanceFrom(
  originLat: number,
  originLng: number,
): (lat: number, lng: number) => number {
  const originLatRad = originLat * DEG_TO_RAD;
  const cosOriginLat = Math.cos(originLatRad);
  return (lat: number, lng: number): number => {
    const dLat = (lat - originLat) * DEG_TO_RAD;
    const dLng = (lng - originLng) * DEG_TO_RAD;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const a =
      sinLat * sinLat +
      cosOriginLat * Math.cos(lat * DEG_TO_RAD) * (sinLng * sinLng);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  };
}

/** "350 m" under 1 km, otherwise "2.4 km". */
export function formatDistance(km: number): string {
  const metres = Math.round(km * 1000);
  // Round before comparing: 0.9996 km used to render as the nonsense "1000 m".
  if (metres < 1000) return `${metres} m`;
  return `${km.toFixed(1)} km`;
}
