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

/**
 * Estimated walking time in minutes based on average 4.8 km/h walking speed
 * with an urban street grid detour factor of 1.15.
 */
export function estimateWalkingMinutes(km: number): number {
  if (km <= 0) return 0;
  return Math.max(1, Math.round(km * 14.4));
}

/**
 * Estimated driving time in minutes from tiered average speeds — 25 km/h
 * under 5 km (town centre crawl), 40 km/h to 15 km, 60 km/h beyond — with a
 * 1.25x road grid detour factor.
 *
 * These are straight-line heuristics, not routed journeys: no traffic, no
 * one-way systems, no river crossings. Tapping through to Directions is what
 * gives a real ETA.
 */
export function estimateDrivingMinutes(km: number): number {
  if (km <= 0) return 0;
  const speedKmH = km < 5 ? 25 : km < 15 ? 40 : 60;
  const detourFactor = 1.25;
  const rawMinutes = ((km * detourFactor) / speedKmH) * 60;
  return Math.max(1, Math.round(rawMinutes));
}

/**
 * The one travel estimate a place card shows: walking under 2.5 km, driving
 * at or above it. One mode, not two — a card offering both makes the reader
 * choose before they have decided to go at all.
 */
export function formatTravelEstimate(km: number): {
  mode: "walk" | "drive";
  minutes: number;
  label: string;
} {
  if (km < 2.5) {
    const minutes = estimateWalkingMinutes(km);
    return { mode: "walk", minutes, label: `${minutes} min walk` };
  }
  const minutes = estimateDrivingMinutes(km);
  return { mode: "drive", minutes, label: `${minutes} min drive` };
}
