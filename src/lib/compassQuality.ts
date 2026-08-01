// Judging whether a phone compass reading can be trusted.
//
// A magnetometer measures the total local magnetic field, which is the
// Earth's field PLUS whatever ferrous metal and magnets are nearby. The
// phone cannot tell those apart, so it will happily report a confident
// heading that is 30° wrong next to a laptop, a radiator, a car dashboard,
// or a magnetic phone case. Two checks catch most of it:
//
//   1. Field strength. Earth's field is 25–65 µT worldwide (~48–50 µT in
//      the UK). A reading far outside that means something local is
//      dominating, and the heading is not to be trusted.
//   2. Tilt. A heading is only meaningful once projected onto the
//      horizontal plane; holding the phone steeply tilted degrades it.
//
// Pure functions so both are testable without a device.

/** Earth's field strength never leaves this range at the surface. */
const EARTH_FIELD_MIN_UT = 25;
const EARTH_FIELD_MAX_UT = 65;
/** Beyond this the field is clearly not just the Earth's. */
const INTERFERENCE_MARGIN_UT = 15;

/** Above this tilt from flat, a compass heading degrades noticeably. */
const TILT_WARN_DEG = 25;

export type Vector3 = { x: number; y: number; z: number };

export const magnitude = (v: Vector3): number =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

/**
 * Tilt of the device from flat (screen up), in degrees, from the
 * accelerometer's gravity vector. 0° = lying flat, 90° = held upright.
 *
 * Expo reports acceleration in g, with z ≈ -1 or +1 when flat depending on
 * platform sign convention, so the magnitude of z relative to the whole
 * vector is what matters — not its sign.
 */
export function tiltFromFlat(gravity: Vector3): number {
  const total = magnitude(gravity);
  if (total < 0.1) return 0; // free fall or no data — don't cry wolf
  const ratio = Math.min(1, Math.abs(gravity.z) / total);
  return Math.acos(ratio) * (180 / Math.PI);
}

export type CompassIssue =
  | "interference"
  | "tilted"
  | "uncalibrated"
  | "none";

export type CompassQuality = {
  issue: CompassIssue;
  /** Whether an alignment claim ("Facing the qibla") is justifiable. */
  trustworthy: boolean;
  /** What to tell the user, or null when the reading is fine. */
  advice: string | null;
};

/**
 * Combine the available signals into one verdict. Any input may be null
 * when the platform doesn't provide it; the verdict degrades gracefully
 * rather than assuming the best.
 *
 * `accuracy` follows expo-location's convention: on Android a 0–3 quality
 * enum (3 = high), on iOS the estimated error in degrees.
 */
export function assessCompass(input: {
  fieldMicroTesla: number | null;
  tiltDeg: number | null;
  accuracy: number | null;
  platform: "ios" | "android" | "other";
}): CompassQuality {
  const { fieldMicroTesla, tiltDeg, accuracy, platform } = input;

  if (
    fieldMicroTesla !== null &&
    (fieldMicroTesla < EARTH_FIELD_MIN_UT - INTERFERENCE_MARGIN_UT ||
      fieldMicroTesla > EARTH_FIELD_MAX_UT + INTERFERENCE_MARGIN_UT)
  ) {
    return {
      issue: "interference",
      trustworthy: false,
      advice:
        "Something magnetic is nearby — a case with magnets, a car mount, a laptop or a radiator. Move away from it, or use the sun method below.",
    };
  }

  const uncalibrated =
    accuracy !== null &&
    (platform === "android" ? accuracy < 2 : accuracy < 0 || accuracy > 20);
  if (uncalibrated) {
    return {
      issue: "uncalibrated",
      trustworthy: false,
      advice:
        "Compass not calibrated — wave the phone in a figure of eight a few times.",
    };
  }

  if (tiltDeg !== null && tiltDeg > TILT_WARN_DEG) {
    return {
      issue: "tilted",
      trustworthy: false,
      advice: "Hold the phone flat and level, screen facing up.",
    };
  }

  return { issue: "none", trustworthy: true, advice: null };
}

/**
 * Human-readable error estimate, e.g. "±5°". Android's enum has no degree
 * meaning, so it is described in words instead of inventing a number.
 */
export function describeAccuracy(
  accuracy: number | null,
  platform: "ios" | "android" | "other",
): string | null {
  if (accuracy === null) return null;
  if (platform === "android") {
    return ["Unreliable", "Low accuracy", "Medium accuracy", "High accuracy"][
      Math.max(0, Math.min(3, Math.round(accuracy)))
    ];
  }
  if (accuracy < 0) return "Unreliable";
  return `±${Math.round(accuracy)}°`;
}
