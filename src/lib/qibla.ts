// Qibla direction: the great-circle bearing from the user to the Kaaba.
//
// "Straight towards the Kaaba" on a sphere is the INITIAL bearing of the
// great-circle path, not the constant compass course you'd steer on a flat
// map — which is why the qibla in Britain points east-south-east (~119°)
// rather than the south-east you might expect from a Mercator projection.
// Pure functions, no dependencies: same math on every platform, testable.

/** Kaaba, Masjid al-Haram. Same reference point the adhan library uses. */
export const KAABA = { lat: 21.4225241, lng: 39.8261818 } as const;

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Fold any angle into 0–359.999…° */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Signed shortest rotation from `from` to `to`, in -180…180°.
 * Positive = clockwise (turn right). Used for both "turn left/right"
 * guidance and for smoothing headings across the 359°→0° wrap.
 */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Low-pass filter for a noisy compass, wrap-safe. `factor` is how much of
 * the new reading to take (0.2 = smooth but responsive).
 */
export function smoothAngle(prev: number, next: number, factor = 0.2): number {
  return normalizeAngle(prev + angleDelta(prev, next) * factor);
}

/**
 * Initial great-circle bearing from a point to the Kaaba, in degrees
 * clockwise from TRUE north (not magnetic north — compare against a
 * true-north heading, or correct for magnetic declination first).
 */
export function qiblaBearing(lat: number, lng: number): number {
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.lat);
  const deltaLambda = toRad(KAABA.lng - lng);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return normalizeAngle(toDeg(Math.atan2(y, x)));
}

/** Great-circle distance to the Kaaba in km (haversine). */
export function distanceToKaabaKm(lat: number, lng: number): number {
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.lat);
  const dPhi = toRad(KAABA.lat - lat);
  const dLambda = toRad(KAABA.lng - lng);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/** The 16-point compass name for a bearing, e.g. 119° -> "ESE". */
export function compassPoint(bearing: number): string {
  const points = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return points[Math.round(normalizeAngle(bearing) / 22.5) % 16];
}

/** Within this many degrees counts as facing the qibla. */
export const ALIGNED_TOLERANCE_DEG = 5;

export type QiblaGuidance = {
  /** Signed shortest turn to face the qibla (positive = clockwise). */
  turn: number;
  aligned: boolean;
  /** Human instruction, e.g. "Turn right 24°" or "Facing the qibla". */
  instruction: string;
};

/** Turn guidance from the device's current true heading. */
export function qiblaGuidance(
  heading: number,
  bearing: number,
): QiblaGuidance {
  const turn = angleDelta(heading, bearing);
  const magnitude = Math.round(Math.abs(turn));
  if (magnitude <= ALIGNED_TOLERANCE_DEG) {
    return { turn, aligned: true, instruction: "Facing the qibla" };
  }
  return {
    turn,
    aligned: false,
    instruction: `Turn ${turn > 0 ? "right" : "left"} ${magnitude}°`,
  };
}
