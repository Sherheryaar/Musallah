// Qibla direction: the great-circle bearing from the user to the Kaaba.
//
// "Straight towards the Kaaba" on a sphere is the INITIAL bearing of the
// great-circle path, not the constant compass course you'd steer on a flat
// map — which is why the qibla in Britain points east-south-east (~119°)
// rather than the south-east you might expect from a Mercator projection.
// Pure functions, no dependencies: same math on every platform, testable.
//
// A phone compass is the convenient way to find the qibla but not the
// accurate one: magnetometers drift, phone cases and car mounts contain
// magnets, and a tilted phone reads a skewed heading. The sun, by contrast,
// can be located to a fraction of a degree from arithmetic alone. So this
// module also computes solar azimuth (reusing the verified prayer-time
// solar model) and the moment each day when the sun sits along the qibla
// line — a compass-free cross-check anyone can perform with a shadow.

import { julianDate, sunPosition } from "./prayerCalc";

/** Kaaba, Masjid al-Haram. Same reference point the adhan library uses. */
export const KAABA = { lat: 21.4225241, lng: 39.8261818 } as const;

/**
 * Size for the dial and the turn tape, clamped at BOTH ends.
 *
 * Lives here, tested, because the missing lower bound was a real rendering
 * bug rather than a hypothetical one. `useWindowDimensions()` reports a width
 * of 0 before the first layout, so `windowWidth - padding` went NEGATIVE, and
 * because every radius on the dial derives from it the bezel asked SVG for
 * r=-31 and r=-34 while the needle asked for a -32×-32 canvas:
 *
 *   Error: <circle> attribute r: A negative value is not valid. ("-31")
 *   Error: <svg> attribute width: A negative value is not valid. ("-32")
 *
 * Clamping the one input fixes every dimension downstream of it.
 */
export function instrumentSize(
  available: number,
  max: number,
  min: number,
): number {
  // Guard the input too: NaN propagates through Math.min/max unchanged, and a
  // NaN width would put NaN into every SVG attribute just as happily as a
  // negative one did.
  if (!Number.isFinite(available)) return min;
  return Math.max(min, Math.min(max, available));
}

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

// ---------------------------------------------------------------------------
// Sun-based alignment (no compass involved)
// ---------------------------------------------------------------------------

export type SunPosition = {
  /** Degrees clockwise from true north. */
  azimuth: number;
  /** Degrees above the horizon; negative means the sun is down. */
  altitude: number;
};

/**
 * Where the sun is, for a location and instant. Uses the same solar model
 * as the prayer times (praytimes.org / Meeus simplified), which is accurate
 * to well under a degree — far better than any phone magnetometer.
 */
export function sunAzimuth(
  lat: number,
  lng: number,
  when: Date,
): SunPosition {
  // Julian date of the instant, in UT.
  const jd =
    julianDate(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate()) +
    (when.getUTCHours() +
      when.getUTCMinutes() / 60 +
      when.getUTCSeconds() / 3600) /
      24;
  const { declination, equationOfTime } = sunPosition(jd);

  // Hour angle: how far the sun is past the local meridian, in degrees,
  // positive in the afternoon. Solar time = UT + EqT + longitude/15.
  const utHours =
    when.getUTCHours() +
    when.getUTCMinutes() / 60 +
    when.getUTCSeconds() / 3600;
  const solarHours = utHours + equationOfTime + lng / 15;
  const hourAngle = (solarHours - 12) * 15;

  const phi = toRad(lat);
  const delta = toRad(declination);
  const h = toRad(hourAngle);

  const sinAlt =
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(h);
  const altitude = toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));

  // Azimuth clockwise from north. atan2 form avoids the quadrant
  // ambiguity a plain arccos would introduce near due south.
  const y = Math.sin(h);
  const x = Math.cos(h) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi);
  const azimuth = normalizeAngle(toDeg(Math.atan2(y, x)) + 180);

  return { azimuth, altitude };
}

export type SunAlignment = {
  /** The sun's current position. */
  sun: SunPosition;
  /**
   * Where the qibla is relative to the sun, as a signed turn: stand facing
   * the sun, then turn this many degrees to face the qibla. Positive =
   * clockwise (to your right).
   */
  turnFromSun: number;
  /** Plain instruction, e.g. "Face the sun, then turn 91° right". */
  instruction: string;
  /** False when the sun is below the horizon, so this method can't be used. */
  sunUp: boolean;
};

/**
 * Qibla direction expressed relative to the sun — usable with no compass at
 * all, and immune to magnetic interference.
 */
export function qiblaFromSun(
  lat: number,
  lng: number,
  when: Date,
): SunAlignment {
  const sun = sunAzimuth(lat, lng, when);
  const bearing = qiblaBearing(lat, lng);
  const turnFromSun = angleDelta(sun.azimuth, bearing);
  const magnitude = Math.round(Math.abs(turnFromSun));
  // Below about 5° the sun is too low and too refracted to sight reliably.
  const sunUp = sun.altitude > 5;
  let instruction: string;
  if (!sunUp) {
    instruction = "The sun is too low to use right now";
  } else if (magnitude <= 2) {
    instruction = "The qibla is straight towards the sun";
  } else if (magnitude >= 178) {
    instruction = "The qibla is directly away from the sun";
  } else {
    instruction = `Face the sun, then turn ${magnitude}° ${
      turnFromSun > 0 ? "right" : "left"
    }`;
  }
  return { sun, turnFromSun, instruction, sunUp };
}

/**
 * The instants today when the sun crosses the qibla line, i.e. when a
 * shadow points exactly along it. `towards` is when the sun sits in the
 * qibla direction (so shadows point directly AWAY from the qibla), and
 * `away` is the reverse (shadows point along it).
 *
 * This is the classic shadow method, and it is the most accurate qibla
 * anyone can obtain without instruments. Either can be null: at UK
 * latitudes the sun never reaches some azimuths, and one of the two
 * crossings is usually at night.
 *
 * Solved by scanning the day in one-minute steps for a sign change in the
 * sun-to-qibla offset, then bisecting — robust, and immune to the
 * discontinuities that catch out closed-form attempts.
 */
export function qiblaSunCrossings(
  lat: number,
  lng: number,
  day: Date,
): { towards: Date | null; away: Date | null } {
  const bearing = qiblaBearing(lat, lng);
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);

  const offsetAt = (t: Date) => {
    const { azimuth, altitude } = sunAzimuth(lat, lng, t);
    return { delta: angleDelta(azimuth, bearing), altitude };
  };

  const refine = (lo: Date, hi: Date): Date => {
    let a = lo.getTime();
    let b = hi.getTime();
    for (let i = 0; i < 30; i++) {
      const mid = (a + b) / 2;
      const da = offsetAt(new Date(a)).delta;
      const dm = offsetAt(new Date(mid)).delta;
      if (Math.sign(da) === Math.sign(dm)) a = mid;
      else b = mid;
    }
    return new Date(Math.round((a + b) / 2));
  };

  let towards: Date | null = null;
  let away: Date | null = null;
  let prev = offsetAt(start);
  let prevTime = start;

  for (let minute = 1; minute <= 24 * 60; minute++) {
    const t = new Date(start.getTime() + minute * 60_000);
    const curr = offsetAt(t);
    // Sign change in the offset = the sun crossed the qibla azimuth.
    // Skip jumps across the ±180° wrap, which are not crossings.
    const crossed =
      Math.sign(curr.delta) !== Math.sign(prev.delta) &&
      Math.abs(curr.delta - prev.delta) < 180;
    if (crossed && curr.altitude > 0 && prev.altitude > 0) {
      towards ??= refine(prevTime, t);
    }
    // The opposite crossing: offset passes through ±180°.
    const oppositeCrossed =
      Math.sign(curr.delta) !== Math.sign(prev.delta) &&
      Math.abs(curr.delta - prev.delta) >= 180;
    if (oppositeCrossed && curr.altitude > 0 && prev.altitude > 0) {
      away ??= new Date(prevTime.getTime() + 30_000);
    }
    prev = curr;
    prevTime = t;
  }
  return { towards, away };
}
