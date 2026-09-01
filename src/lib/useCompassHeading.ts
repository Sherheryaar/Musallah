// The live compass heading, smoothed, plus the two native Animated values
// the qibla instrument is driven by.
//
// Pulled out of the qibla screen so the sensor plumbing — subscription
// lifecycle, wrap-safe smoothing, the shortest-arc accumulator, the
// re-render throttle — sits in one place and the screen only reads
// `heading`, `spin` and `turn`.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import * as Location from "expo-location";

import { angleDelta, smoothAngle } from "./qibla";
import type { LocationPermission } from "./useDeviceLocation";

export type HeadingState =
  | { kind: "loading" }
  | { kind: "live"; heading: number; accuracy: number | null }
  // No compass available (denied permission, no magnetometer): the bearing
  // is still useful, so it is shown as a static number. `cause` separates the
  // two, because a denied permission can be retried from a button while
  // re-requesting an already-granted one resolves instantly with no prompt —
  // so the sensor failure must not offer that button.
  | { kind: "static"; cause: "permission" | "sensor"; reason: string };

/** How far the heading moves before the dial's animation is re-targeted. */
const ANIMATE_THRESHOLD_DEG = 0.25;

export function useCompassHeading(
  permission: LocationPermission,
  bearing: number,
  reduceMotion: boolean,
): {
  heading: HeadingState;
  /**
   * The dial's rotation. Deliberately UNBOUNDED — it accumulates signed
   * deltas rather than tracking a normalised 0–359 heading, because
   * interpolating a normalised angle makes the dial whip 358° the wrong way
   * every time the user crosses north.
   */
  spin: Animated.Value;
  /** Signed turn to the qibla, ±180. Drives the turn tape. */
  turn: Animated.Value;
} {
  const [heading, setHeading] = useState<HeadingState>({ kind: "loading" });
  // Smoothed heading lives in a ref: the filter must not depend on render
  // timing, and we only re-render when the value moves visibly.
  const smoothed = useRef<number | null>(null);
  const spin = useRef(new Animated.Value(0)).current;
  const unwrapped = useRef(0);
  const lastAnimatedTo = useRef(0);
  const turn = useRef(new Animated.Value(0)).current;

  // Read inside the heading callback, which is created once per subscription
  // and would otherwise close over the first render's values forever.
  const bearingRef = useRef(bearing);
  useEffect(() => {
    bearingRef.current = bearing;
  }, [bearing]);
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  // The subscription follows the location permission: nothing to subscribe
  // to until it is granted, and a denial is a static bearing with a button.
  // Keyed on `permission`, so a retry that flips it re-runs this too, and the
  // cleanup removes the previous subscription before the next one starts.
  useEffect(() => {
    if (permission === "denied") {
      setHeading({
        kind: "static",
        cause: "permission",
        reason:
          "Allow location access to use the live compass. The bearing above is still correct for your area.",
      });
      return;
    }
    if (permission !== "granted") return;
    // On a retry the note explaining the denial is still on screen; the
    // permission is in hand now, so clear it rather than leaving it
    // contradicting the app until the first heading sample lands.
    setHeading((prev) => (prev.kind === "loading" ? prev : { kind: "loading" }));

    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    Location.watchHeadingAsync((data) => {
      if (cancelled) return;
      // trueHeading is corrected for magnetic declination by the OS and is
      // what the qibla bearing must be compared against. It reports -1 when
      // unavailable, in which case magnetic north is close enough in the UK
      // (declination is ~0–3° here).
      const raw =
        typeof data.trueHeading === "number" && data.trueHeading >= 0
          ? data.trueHeading
          : data.magHeading;
      if (typeof raw !== "number" || Number.isNaN(raw)) return;

      const prev = smoothed.current;
      const next = prev === null ? raw : smoothAngle(prev, raw);
      smoothed.current = next;
      // angleDelta is signed and shortest-path, so 359° → 1° accumulates as
      // +2 and never as −358. That is the whole shortest-arc fix.
      if (prev !== null) unwrapped.current += angleDelta(prev, next);
      else unwrapped.current = next;

      const duration = reduceMotionRef.current ? 0 : 140;
      // watchHeadingAsync fires up to 60×/second and every .start() is a
      // bridge round-trip, so accumulate on every sample but only drive the
      // animation when the value has actually moved.
      if (
        Math.abs(unwrapped.current - lastAnimatedTo.current) >
        ANIMATE_THRESHOLD_DEG
      ) {
        lastAnimatedTo.current = unwrapped.current;
        Animated.timing(spin, {
          toValue: unwrapped.current,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }

      const nextTurn = angleDelta(next, bearingRef.current);
      Animated.timing(turn, {
        toValue: nextTurn,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      const accuracy = typeof data.accuracy === "number" ? data.accuracy : null;
      setHeading((prevState) => {
        if (
          prevState.kind === "live" &&
          prevState.accuracy === accuracy &&
          // The dial is animated natively, so state only needs to change
          // when the rendered TEXT would: a whole degree of turn.
          Math.round(angleDelta(prevState.heading, bearingRef.current)) ===
            Math.round(nextTurn)
        ) {
          return prevState;
        }
        return { kind: "live", heading: next, accuracy };
      });
    })
      .then((newSub) => {
        // The effect may have been cleaned up while the subscription was
        // still being set up (cleanup ran when `sub` was null) — remove it
        // now instead of leaking a live compass listener.
        if (cancelled) newSub.remove();
        else sub = newSub;
      })
      .catch(() => {
        if (cancelled) return;
        setHeading({
          kind: "static",
          cause: "sensor",
          reason:
            "This device didn't report a compass heading. Use the bearing above with a compass app.",
        });
      });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [permission, spin, turn]);

  return { heading, spin, turn };
}
