import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Accelerometer, Magnetometer } from "expo-sensors";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Circle, Path, Polygon } from "react-native-svg";

import KaabaMark from "@/components/KaabaMark";
import Touchable from "@/components/Touchable";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import {
  assessCompass,
  describeAccuracy,
  magnitude,
  tiltFromFlat,
  type CompassQuality,
} from "@/lib/compassQuality";
import { FALLBACK_LOCATION } from "@/lib/geo";
import {
  ALIGNED_TOLERANCE_DEG,
  angleDelta,
  compassPoint,
  distanceToKaabaKm,
  instrumentSize,
  qiblaBearing,
  qiblaFromSun,
  qiblaGuidance,
  qiblaSunCrossings,
  smoothAngle,
} from "@/lib/qibla";
import { hapticSuccess, hapticTick } from "@/lib/haptics";
import { cardEdge, elevation } from "@/lib/elevation";
import { MIN_TARGET } from "@/lib/metrics";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// --- Dial geometry -------------------------------------------------------
// Every dimension derives from DIAL (measured at runtime) so the instrument
// fits a 360px phone, a foldable and the web layout without three sets of
// magic numbers.
const MAX_DIAL = 320;
/**
 * Floor for the dial, and it is load-bearing rather than defensive.
 *
 * `useWindowDimensions()` reports a width of 0 before the first layout, which
 * made `windowWidth - spacing.l * 2` evaluate to -32. Every radius on the dial
 * derives from that, so the bezel asked SVG for r=-31 and r=-34 and the
 * needle for a -32×-32 canvas — invalid on both platforms:
 *
 *   Error: <circle> attribute r: A negative value is not valid. ("-31")
 *   Error: <svg> attribute width: A negative value is not valid. ("-32")
 *
 * Clamping here fixes it once for every dimension downstream, since they all
 * come from `dial`. 200 is small enough never to bind on a real device (the
 * narrowest phones are ~320dp wide) and large enough to stay a legible
 * instrument if it ever does.
 */
const MIN_DIAL = 200;
/** Distance from the dial's edge to the outer end of the graduations. */
const RIM = 12;
const TICK_MINOR = { w: 1.5, h: 6 };
const TICK_MAJOR = { w: 2, h: 12 };

/**
 * Graduated bezel: 72 ticks every 5°, emphasised every 30°.
 *
 * Drawn as TWO stroked circles with a dash pattern rather than 72 views —
 * one node each, and the spacing is exact by construction. A circle's path
 * starts at 3 o'clock, and both 90° and 30° are whole multiples of the 5°
 * period, so a tick lands on each cardinal without any phase correction
 * beyond centring the dash on its own angle.
 */
function bezelDashes(radius: number, everyDeg: number, width: number) {
  const circumference = 2 * Math.PI * radius;
  const period = (circumference * everyDeg) / 360;
  return {
    strokeDasharray: [width, period - width] as number[],
    // Half a dash back, so each tick straddles its angle instead of
    // starting on it.
    strokeDashoffset: width / 2,
  };
}

/** SVG path for a wedge of an annulus, angles in degrees clockwise from 12. */
function annulusSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  fromDeg: number,
  toDeg: number,
): string {
  // SVG's 0° is at 3 o'clock; the dial's 0° is at 12.
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1o, y1o] = pt(rOuter, fromDeg);
  const [x2o, y2o] = pt(rOuter, toDeg);
  const [x2i, y2i] = pt(rInner, toDeg);
  const [x1i, y1i] = pt(rInner, fromDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return [
    `M ${x1o} ${y1o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i}`,
    "Z",
  ].join(" ");
}

const CARDINALS: { angle: number; label: string }[] = [
  { angle: 0, label: "N" },
  { angle: 90, label: "E" },
  { angle: 180, label: "S" },
  { angle: 270, label: "W" },
];

// --- Turn tape -----------------------------------------------------------
// The rim of a 320px dial travels ~2.8px per degree, so the final few
// degrees — exactly where alignment is decided — are invisible on it. The
// tape shows a ±TAPE_RANGE window at roughly double that resolution, which
// is what makes the last 3° readable.
const TAPE_RANGE = 30;
const TAPE_HEIGHT = 46;
const MAX_TAPE = 360;

/** Below this the needle is drawn as authoritative; above it, as a hint. */
const HYSTERESIS_EXIT_DEG = 8;

/** The Kaaba mark's box at the needle's tip. */
const KAABA_SIZE = 26;

type HeadingState =
  | { kind: "loading" }
  | { kind: "live"; heading: number; accuracy: number | null }
  // No compass available (denied permission, no magnetometer): the
  // bearing is still useful, so show it as a static number.
  | { kind: "static"; reason: string };

const PLATFORM: "ios" | "android" | "other" =
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "other";

/**
 * Hoisted, not `Number.prototype.toLocaleString()` at the call site: the
 * metrics strip re-renders on roughly every whole degree of turn, and each
 * bare toLocaleString() call builds a fresh formatter (locale data parse plus
 * lookup tables) to print a number that only changes when the user's
 * coordinates do.
 */
const KM_FORMAT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** "13:42" in the user's local time. */
function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function QiblaScreen() {
  const { colors, scheme } = useTheme();
  const { settings } = useSettings();
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // Edge-to-edge on Android: without this the privacy line at the foot of the
  // scroll sits under the gesture/navigation bar.
  const insets = useSafeAreaInsets();

  // Clamped below as well as above — see instrumentSize, which is unit-tested
  // because the missing lower bound put negative radii into the SVG. Without
  // it a pre-layout width of 0 also made the tape's px-per-degree negative,
  // which positioned its graduations backwards off the left edge.
  const available = windowWidth - spacing.l * 2;
  const dial = instrumentSize(available, MAX_DIAL, MIN_DIAL);
  const tapeWidth = instrumentSize(available, MAX_TAPE, MIN_DIAL);
  const pxPerDeg = tapeWidth / 2 / TAPE_RANGE;
  const styles = useMemo(
    () => createStyles(colors, scheme, dial),
    [colors, scheme, dial],
  );

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [usingFallback, setUsingFallback] = useState(false);
  const [heading, setHeading] = useState<HeadingState>({ kind: "loading" });
  // Sensor-quality inputs, sampled continuously while the screen is open.
  const [fieldStrength, setFieldStrength] = useState<number | null>(null);
  const [tiltDeg, setTiltDeg] = useState<number | null>(null);
  // Ticks once a minute so the sun guidance stays current.
  const [minuteTick, setMinuteTick] = useState(0);
  const [sunOpen, setSunOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  // Smoothed heading lives in a ref: the filter must not depend on render
  // timing, and we only re-render when the value moves visibly.
  const smoothed = useRef<number | null>(null);

  // --- Animation state ---------------------------------------------------
  // ONE native-driven value carries the dial. `spin` is deliberately
  // UNBOUNDED — it accumulates signed deltas rather than tracking a
  // normalised 0–359 heading, because interpolating a normalised angle makes
  // the dial whip 358° the wrong way every time the user crosses north.
  const spin = useRef(new Animated.Value(0)).current;
  const unwrapped = useRef(0);
  const lastAnimatedTo = useRef(0);
  /** Signed turn to the qibla, ±180. Drives the tape. */
  const turn = useRef(new Animated.Value(0)).current;
  /**
   * 0 → 1 as alignment is acquired. NATIVE driver: it only ever feeds
   * transform and opacity on plain views.
   */
  const lock = useRef(new Animated.Value(0)).current;
  /**
   * The same 0 → 1, but on the JS driver, because it feeds an SVG
   * strokeDashoffset — which the native driver cannot animate. Sharing one
   * value between the two would make React Native throw "Attempting to run
   * JS driven animation on an animated node that has been moved to native",
   * so this deliberate duplicate is the fix, not an oversight.
   */
  const ring = useRef(new Animated.Value(0)).current;

  // Read inside the heading callback, which is created once on mount and
  // would otherwise close over the first render's values forever.
  const bearingRef = useRef(0);
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const hapticsRef = useRef(settings.hapticFeedback);
  hapticsRef.current = settings.hapticFeedback;

  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      let position = FALLBACK_LOCATION;
      let fellBack = true;
      let granted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === "granted";
        if (granted) {
          const pos =
            (await Location.getLastKnownPositionAsync({
              maxAge: 5 * 60 * 1000,
            })) ??
            (await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }));
          position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          fellBack = false;
        }
      } catch {
        // Keep the fallback: a bearing for central London is still far more
        // useful than an error screen.
      }
      if (cancelled) return;
      setCoords(position);
      setUsingFallback(fellBack);

      if (!granted) {
        setHeading({
          kind: "static",
          reason:
            "Allow location access to use the live compass. The bearing above is still correct for your area.",
        });
        return;
      }
      try {
        const newSub = await Location.watchHeadingAsync((data) => {
          if (cancelled) return;
          // trueHeading is corrected for magnetic declination by the OS and
          // is what the qibla bearing must be compared against. It reports
          // -1 when unavailable, in which case magnetic north is close
          // enough in the UK (declination is ~0–3° here).
          const raw =
            typeof data.trueHeading === "number" && data.trueHeading >= 0
              ? data.trueHeading
              : data.magHeading;
          if (typeof raw !== "number" || Number.isNaN(raw)) return;

          const prev = smoothed.current;
          const next = prev === null ? raw : smoothAngle(prev, raw);
          smoothed.current = next;
          // angleDelta is signed and shortest-path, so 359° → 1° accumulates
          // as +2 and never as −358. That is the whole shortest-arc fix.
          if (prev !== null) unwrapped.current += angleDelta(prev, next);
          else unwrapped.current = next;

          const duration = reduceMotionRef.current ? 0 : 140;
          // watchHeadingAsync fires up to 60×/second and every .start() is a
          // bridge round-trip, so accumulate on every sample but only drive
          // the animation when the value has actually moved.
          if (Math.abs(unwrapped.current - lastAnimatedTo.current) > 0.25) {
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

          const accuracy =
            typeof data.accuracy === "number" ? data.accuracy : null;
          setHeading((prevState) => {
            if (
              prevState.kind === "live" &&
              prevState.accuracy === accuracy &&
              // The dial is animated natively now, so state only needs to
              // change when the rendered TEXT would: a whole degree of turn.
              Math.round(angleDelta(prevState.heading, bearingRef.current)) ===
                Math.round(nextTurn)
            ) {
              return prevState;
            }
            return { kind: "live", heading: next, accuracy };
          });
        });
        // The effect may have been cleaned up while this await was in
        // flight (cleanup ran when `sub` was still null, so its
        // `sub?.remove()` was a no-op) -- remove it now instead of leaking
        // a live compass listener for the rest of the session.
        if (cancelled) {
          newSub.remove();
        } else {
          sub = newSub;
        }
      } catch {
        setHeading({
          kind: "static",
          reason:
            "This device didn't report a compass heading. Use the bearing above with a compass app.",
        });
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [spin, turn]);

  // Sensor-quality feeds: magnetometer field strength catches magnets and
  // metal (an interfered compass reads confidently and WRONG — the single
  // biggest cause of "the qibla app is off"), the accelerometer catches a
  // tilted phone. Both are advisory sensors only; the heading itself still
  // comes from watchHeadingAsync.
  useEffect(() => {
    let mag: { remove: () => void } | null = null;
    let acc: { remove: () => void } | null = null;
    try {
      Magnetometer.setUpdateInterval(500);
      Accelerometer.setUpdateInterval(500);
      mag = Magnetometer.addListener((v) => {
        // Expo reports microtesla on both platforms.
        setFieldStrength(Math.round(magnitude(v)));
      });
      acc = Accelerometer.addListener((v) => {
        setTiltDeg(Math.round(tiltFromFlat(v)));
      });
    } catch {
      // No sensors — quality checks simply stay unavailable.
    }
    return () => {
      mag?.remove();
      acc?.remove();
    };
  }, []);

  // Minute tick keeps the sun guidance current while the screen is open.
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Which calendar day the sun crossings below are for. A separate value from
  // minuteTick because the crossings only change at MIDNIGHT, while the live
  // sun position changes every minute — and the dependency that encoded that
  // used to be the expression `minuteTick > 0 && new Date().getDate()`, which
  // evaluates to `false` on the first render and to a number on the second.
  // So the day-long scan ran twice on every visit to this screen, and would
  // silently stop tracking the date if the tick were ever reset to 0.
  const dayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    // minuteTick is the clock this is sampled against, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteTick]);

  const point = coords ?? FALLBACK_LOCATION;
  const bearing = useMemo(
    () => qiblaBearing(point.lat, point.lng),
    [point.lat, point.lng],
  );
  bearingRef.current = bearing;
  const distanceKm = useMemo(
    () => distanceToKaabaKm(point.lat, point.lng),
    [point.lat, point.lng],
  );

  const live = heading.kind === "live";
  const guidance = live ? qiblaGuidance(heading.heading, bearing) : null;

  // One verdict from all the quality signals. "Facing the qibla" is only
  // claimed when the sensors say the claim is justifiable.
  const quality: CompassQuality = useMemo(
    () =>
      assessCompass({
        fieldMicroTesla: fieldStrength,
        tiltDeg,
        accuracy: heading.kind === "live" ? heading.accuracy : null,
        platform: PLATFORM,
      }),
    [fieldStrength, tiltDeg, heading],
  );
  const aligned = (guidance?.aligned ?? false) && quality.trustworthy;
  const accuracyLabel = live ? describeAccuracy(heading.accuracy, PLATFORM) : null;
  // An untrustworthy compass must not render an authoritative needle: the
  // app has already decided it doesn't believe the reading.
  const authoritative = live && quality.trustworthy;

  // Sun-based guidance: immune to everything that fools a magnetometer.
  // Recomputed each minute (the sun moves ~0.25°/min).
  const sunNow = useMemo(
    () => qiblaFromSun(point.lat, point.lng, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [point.lat, point.lng, minuteTick],
  );
  // The day's shadow-method crossings. The heaviest computation on this
  // screen (a minute-by-minute scan of the whole day), and it only needs
  // redoing when the date or the location changes — never on the minute tick.
  const crossings = useMemo(
    () => qiblaSunCrossings(point.lat, point.lng, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [point.lat, point.lng, dayKey],
  );

  // The sun method stops being a footnote the moment the compass can't be
  // trusted — that is precisely when it becomes the answer.
  const sunIsPrimary = !live || !quality.trustworthy;
  const sunExpanded = sunOpen || sunIsPrimary;

  // --- Lock-on -----------------------------------------------------------
  // Hysteresis: enter at the 5° tolerance, leave only at 8°, so hovering on
  // the boundary doesn't strobe the whole instrument.
  const wasAligned = useRef(false);
  const turnMagnitude = guidance ? Math.abs(guidance.turn) : 180;
  if (wasAligned.current) {
    if (turnMagnitude > HYSTERESIS_EXIT_DEG || !quality.trustworthy) {
      wasAligned.current = false;
    }
  } else if (aligned) {
    wasAligned.current = true;
  }
  const locked = wasAligned.current;

  useEffect(() => {
    const duration = reduceMotion ? 0 : 260;
    Animated.timing(lock, {
      toValue: locked ? 1 : 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(ring, {
      toValue: locked ? 1 : 0,
      // Slightly longer than the needle's settle, so the ring reads as the
      // confirmation that FOLLOWS arriving rather than part of arriving.
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // strokeDashoffset — JS driver only.
    }).start();
  }, [locked, reduceMotion, lock, ring]);

  // The confirmation buzz. `locked` already carries the 5°-in / 8°-out
  // hysteresis and is gated on quality.trustworthy, so this fires once on
  // a genuine acquisition — never while hovering on the boundary, and
  // never for a reading the app itself doesn't believe.
  //
  // Deps are `locked` ALONE: reading the preference through a ref keeps
  // toggling haptics off in Settings from itself triggering a buzz.
  useEffect(() => {
    if (locked) hapticSuccess(hapticsRef.current);
  }, [locked]);

  // A light tick every 15° of turn, so the compass can be followed without
  // watching it. Skipped on the first render (there is no "turn" yet) and
  // whenever the heading isn't trustworthy enough to act on.
  const turnBucket =
    authoritative && guidance && !locked
      ? Math.round(guidance.turn / 15)
      : null;
  const lastBucket = useRef<number | null>(null);
  useEffect(() => {
    if (turnBucket === null) {
      lastBucket.current = null;
      return;
    }
    if (lastBucket.current !== null && lastBucket.current !== turnBucket) {
      hapticTick(hapticsRef.current);
    }
    lastBucket.current = turnBucket;
  }, [turnBucket]);

  // --- Screen reader -----------------------------------------------------
  // A label is only announced when focus LANDS on an element; neither
  // VoiceOver nor TalkBack re-reads a focused element because a prop
  // changed. Someone turning on the spot would hear the instruction once
  // and then silence, so announce on a coarse bucket instead — roughly
  // every 15°, not 20× a second.
  const announceBucket = guidance
    ? `${Math.round(guidance.turn / 15)}:${locked}`
    : null;
  useEffect(() => {
    if (!announceBucket || !guidance) return;
    let cancelled = false;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (!on || cancelled) return;
      AccessibilityInfo.announceForAccessibility(
        locked
          ? "Facing the qibla"
          : `${guidance.instruction}${quality.advice ? `. ${quality.advice}` : ""}`,
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announceBucket]);

  const requestLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      // Once the OS stops prompting, the only route left is Settings.
      Linking.openSettings().catch(() => {});
    }
  }, []);

  // --- Dial geometry, in SVG user units ----------------------------------
  const c = dial / 2;
  const rOuter = c - RIM;
  const rMinor = rOuter - TICK_MINOR.h / 2;
  const rMajor = rOuter - TICK_MAJOR.h / 2;
  const minorDash = useMemo(() => bezelDashes(rMinor, 5, TICK_MINOR.w), [rMinor]);
  const majorDash = useMemo(
    () => bezelDashes(rMajor, 30, TICK_MAJOR.w),
    [rMajor],
  );
  // The needle, pointing at 12 o'clock, already offset to the dial centre.
  // A short tail crosses the hub so it reads as a balanced instrument
  // needle rather than an arrow sticker pasted on.
  const needlePoints = useMemo(() => {
    const k = dial / 320;
    // Y coordinates, not radii: the tip sits 30px inside the rim to leave
    // the Kaaba mark its own space on the graduations.
    const tipY = c - (rOuter - 30 * k);
    const shoulderY = tipY + 28 * k;
    const tailY = c + 50 * k;
    const w = 7 * k;
    return [
      `${c},${tipY}`,
      `${c + w},${shoulderY}`,
      `${c + w * 0.42},${tailY}`,
      `${c - w * 0.42},${tailY}`,
      `${c - w},${shoulderY}`,
    ].join(" ");
  }, [dial, c, rOuter]);
  // Confirmation ring: the circumference IS the dash length, so animating
  // the offset from C to 0 makes a ring visibly close rather than fade in.
  const ringRadius = c - 3;
  const ringLength = 2 * Math.PI * ringRadius;
  const captureWedge = useMemo(
    () =>
      annulusSector(
        c,
        c,
        rOuter - 22,
        rOuter,
        -ALIGNED_TOLERANCE_DEG,
        ALIGNED_TOLERANCE_DEG,
      ),
    [c, rOuter],
  );

  // `border` is a 1.4:1 whisper on the dark well, so the minor graduations
  // simply vanish there. Dark mode draws them from textSecondary held back
  // by opacity instead: subordinate to the majors without disappearing.
  const minorTickColor =
    scheme === "dark" ? colors.textSecondary : colors.border;
  const minorTickOpacity = scheme === "dark" ? 0.45 : 1;

  // --- Interpolations ----------------------------------------------------
  // The face turns anticlockwise as the user turns clockwise; every child
  // is a STATIC transform inside it, so the whole rose is one native node.
  const faceSpin = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 360],
        outputRange: ["0deg", "-360deg"],
      }),
    [spin],
  );
  // Glyphs that must stay upright cancel the face's rotation.
  const uprightSpin = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 360],
        outputRange: ["0deg", "360deg"],
      }),
    [spin],
  );
  const tapeShift = useMemo(
    () =>
      turn.interpolate({
        inputRange: [-TAPE_RANGE, TAPE_RANGE],
        outputRange: [-TAPE_RANGE * pxPerDeg, TAPE_RANGE * pxPerDeg],
        extrapolate: "clamp",
      }),
    [turn, pxPerDeg],
  );
  const needleScale = useMemo(
    () => lock.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
    [lock],
  );
  const gateOpacity = useMemo(
    () => lock.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
    [lock],
  );
  // Full circumference (open) → 0 (closed).
  const ringDashOffset = useMemo(
    () =>
      ring.interpolate({
        inputRange: [0, 1],
        outputRange: [ringLength, 0],
      }),
    [ring, ringLength],
  );

  const needleColor = authoritative ? colors.accent : colors.textSecondary;

  // A dial that can't track is not an instrument — it's a diagram, and it
  // must not be dressed as one. Without a live heading the rose is frozen
  // north-up, so the gate, the tape and every alignment claim come off.
  const instrument = live;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------------------------------------------------------------
          HERO. What the user needs is a verb and a number, in that order.
          --------------------------------------------------------------- */}
      <View
        style={styles.hero}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          guidance
            ? `${guidance.instruction}. Qibla ${Math.round(bearing)} degrees, ${compassPoint(bearing)}.${quality.advice ? ` ${quality.advice}` : ""}`
            : `Qibla ${Math.round(bearing)} degrees from true north, ${compassPoint(bearing)}. No live compass.`
        }
      >
        <Text style={styles.kicker}>
          {instrument
            ? locked
              ? "FACING THE QIBLA"
              : guidance && guidance.turn > 0
                ? "TURN RIGHT"
                : "TURN LEFT"
            : compassPoint(bearing) === "N"
              ? "FROM TRUE NORTH"
              : "BEARING FROM TRUE NORTH"}
        </Text>
        {instrument && locked ? (
          <View style={styles.heroLockRow}>
            <MaterialCommunityIcons
              name="check-circle"
              size={30}
              color={colors.accent}
            />
            <Text style={[styles.heroWord, { color: colors.accent }]}>
              Aligned
            </Text>
          </View>
        ) : (
          <Text style={styles.heroNumber} allowFontScaling>
            {instrument && guidance
              ? `${Math.abs(Math.round(guidance.turn))}°`
              : `${Math.round(bearing)}°`}
          </Text>
        )}
      </View>

      {/* ---------------------------------------------------------------
          THE DIAL
          --------------------------------------------------------------- */}
      <View style={styles.dialWrap}>
        {/* Fixed index gate at 12 o'clock. This is what turns a floating
            arrow into a task: bring the Kaaba mark into the gate. It does
            NOT rotate — it is the target, not part of the rose. */}
        {instrument ? (
          <Animated.View
            style={[styles.gate, { opacity: gateOpacity }]}
          >
            <MaterialCommunityIcons
              name="menu-down"
              size={26}
              color={locked ? colors.accent : colors.text}
            />
          </Animated.View>
        ) : null}

        <View style={styles.dial}>
          {/* Screen-fixed overlay: the capture window and the confirmation
              ring belong to the GATE, not to the rose, so they must not
              rotate with the heading. This layer's parent is the dial
              itself, which is NOT inert, so unlike the two Svgs below it
              needs its own pointerEvents. */}
          {instrument ? (
            <Svg
              width={dial}
              height={dial}
              style={[StyleSheet.absoluteFill, styles.inert]}
            >
              {/* The ±5° window, visible BEFORE you reach it. */}
              <Path d={captureWedge} fill={colors.accent} opacity={0.14} />
              {/* Closes clockwise from 12 as alignment is acquired.
                  strokeDashoffset is not native-drivable, which is exactly
                  why `ring` is a separate Animated.Value from `lock`. */}
              <AnimatedCircle
                cx={c}
                cy={c}
                r={ringRadius}
                fill="none"
                stroke={colors.accent}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={[ringLength, ringLength]}
                strokeDashoffset={ringDashOffset}
                // Start the ring at 12 o'clock rather than 3.
                originX={c}
                originY={c}
                rotation={-90}
              />
            </Svg>
          ) : null}

          {/* ONE animated node carries the entire rose. Every child below
              is a static transform, so the compass costs a single native
              rotation per frame instead of fourteen JS-computed ones. */}
          <Animated.View
            style={[
              styles.face,
              instrument ? { transform: [{ rotate: faceSpin }] } : null,
            ]}
          >
            {/* The graduated bezel: 72 ticks in two nodes. No pointerEvents of
                its own — `styles.face` above is already inert. */}
            <Svg
              width={dial}
              height={dial}
              style={StyleSheet.absoluteFill}
            >
              <Circle
                cx={c}
                cy={c}
                r={rMinor}
                fill="none"
                stroke={minorTickColor}
                strokeOpacity={minorTickOpacity}
                strokeWidth={TICK_MINOR.h}
                {...minorDash}
              />
              <Circle
                cx={c}
                cy={c}
                r={rMajor}
                fill="none"
                stroke={colors.textSecondary}
                strokeOpacity={0.9}
                strokeWidth={TICK_MAJOR.h}
                {...majorDash}
              />
            </Svg>

            {CARDINALS.map(({ angle, label }) => (
              <View
                key={label}
                style={[styles.rotor, { transform: [{ rotate: `${angle}deg` }] }]}
              >
                {/* Counter-rotated so the letter stays upright as the dial
                    turns. Rotation is about the glyph's own centre, which
                    is why this cancels rather than compounds. */}
                <Animated.Text
                  allowFontScaling={false}
                  style={[
                    styles.cardinal,
                    label === "N" && styles.cardinalNorth,
                    {
                      transform: [
                        { rotate: `${-angle}deg` },
                        ...(instrument ? [{ rotate: uprightSpin }] : []),
                      ],
                    },
                  ]}
                >
                  {label}
                </Animated.Text>
              </View>
            ))}

            {/* The sun's live position on the rim — lets anyone sanity-check
                the dial against the sky at a glance. A vector icon, not the
                ☀️ emoji: emoji ignore `color`, and at 14px on a rotating
                element Android renders it as a smear. */}
            {sunNow.sunUp ? (
              <View
                style={[
                  styles.rotor,
                  { transform: [{ rotate: `${sunNow.sun.azimuth}deg` }] },
                ]}
              >
                <Animated.View
                  style={{
                    marginTop: RIM + TICK_MAJOR.h + 16,
                    transform: [
                      { rotate: `${-sunNow.sun.azimuth}deg` },
                      ...(instrument ? [{ rotate: uprightSpin }] : []),
                    ],
                  }}
                >
                  <MaterialCommunityIcons
                    name="white-balance-sunny"
                    size={17}
                    color={colors.attention}
                  />
                </Animated.View>
              </View>
            ) : null}

            {/* The qibla needle. */}
            <Animated.View
              style={[
                styles.rotor,
                {
                  transform: [
                    { rotate: `${bearing}deg` },
                    { scale: needleScale },
                  ],
                },
              ]}
            >
              {/* Authored SVG, not the 🕋 emoji this used to be — see
                  KaabaMark. It follows `needleColor`, so when the compass is
                  not trustworthy the mark dims with the needle instead of
                  contradicting it. */}
              <Animated.View
                style={{
                  width: KAABA_SIZE,
                  height: KAABA_SIZE,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [
                    { rotate: `${-bearing}deg` },
                    ...(instrument ? [{ rotate: uprightSpin }] : []),
                  ],
                }}
              >
                <KaabaMark
                  size={KAABA_SIZE}
                  color={needleColor}
                  bandColor={colors.canvas}
                />
              </Animated.View>
              {/* One polygon: tip, shoulders, and a counterweight tail
                  crossing the hub. The old head-plus-stem pair met at a
                  visible seam and could not taper. */}
              {/* `styles.rotor` on the parent is already inert. */}
              <Svg
                width={dial}
                height={dial}
                style={StyleSheet.absoluteFill}
              >
                <Polygon points={needlePoints} fill={needleColor} />
              </Svg>
            </Animated.View>
          </Animated.View>

          <View
            style={[
              styles.hub,
              { backgroundColor: locked ? colors.accent : colors.textSecondary },
            ]}
          />
        </View>
      </View>

      {/* ---------------------------------------------------------------
          TURN TAPE — the precision instrument. ~2× the rim's resolution,
          which is what makes the last 3° actually readable.
          --------------------------------------------------------------- */}
      {instrument ? (
        <View
          style={[styles.tape, { width: tapeWidth }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[
              styles.tapeCapture,
              {
                width: ALIGNED_TOLERANCE_DEG * 2 * pxPerDeg,
                left: tapeWidth / 2 - ALIGNED_TOLERANCE_DEG * pxPerDeg,
              },
            ]}
          />
          {/* Static heading scale: a graduation every 5°. */}
          {Array.from({ length: TAPE_RANGE * 2 / 5 + 1 }, (_, i) => {
            const deg = -TAPE_RANGE + i * 5;
            const major = deg % 15 === 0;
            return (
              <View
                key={deg}
                style={{
                  position: "absolute",
                  top: major ? 8 : 12,
                  left: tapeWidth / 2 + deg * pxPerDeg - 0.75,
                  width: 1.5,
                  height: major ? 12 : 7,
                  borderRadius: 1,
                  // controlBorder: this tape exists precisely BECAUSE the last
                  // few degrees are unreadable on the rim, so its scale is the
                  // thing being read. In `border` the graduations measured
                  // 1.26:1 — the tape had no legible scale at all, defeating
                  // the reason it was added.
                  backgroundColor: colors.controlBorder,
                }}
              />
            );
          })}
          {/* The qibla marker rides the tape and lands on the fixed index. */}
          <Animated.View
            style={[
              styles.tapeMarker,
              {
                left: tapeWidth / 2 - 8,
                transform: [{ translateX: tapeShift }],
              },
            ]}
          >
            <MaterialCommunityIcons
              name="menu-down"
              size={22}
              color={needleColor}
            />
          </Animated.View>
          <View style={[styles.tapeIndex, { left: tapeWidth / 2 - 1 }]} />
        </View>
      ) : null}

      {/* ---------------------------------------------------------------
          METRICS. Three fixed columns — never dropped, or the strip
          reflows every time the compass accuracy changes.
          --------------------------------------------------------------- */}
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>QIBLA</Text>
          <Text style={styles.metricValue}>
            {`${Math.round(bearing)}° ${compassPoint(bearing)}`}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>TO MAKKAH</Text>
          <Text style={styles.metricValue}>
            {`${KM_FORMAT.format(distanceKm)} km`}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>COMPASS</Text>
          <Text style={styles.metricValue}>
            {live ? (accuracyLabel ?? "—") : "None"}
          </Text>
        </View>
      </View>

      {/* Sensor verdict: say WHY the reading can't be trusted, not just
          a generic calibration nag. Orange is reserved for this alone. */}
      {live && quality.advice ? (
        <View style={[styles.note, styles.noteAttention]}>
          <MaterialCommunityIcons
            name="alert-outline"
            size={18}
            color={colors.attention}
          />
          <Text style={styles.noteText}>{quality.advice}</Text>
        </View>
      ) : null}

      {heading.kind === "static" ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>{heading.reason}</Text>
          <Touchable
            onPress={requestLocation}
            accessibilityRole="button"
            accessibilityLabel="Allow location access"
            style={styles.noteButton}
          >
            <Text style={styles.noteButtonLabel}>Allow location</Text>
          </Touchable>
        </View>
      ) : null}

      {usingFallback ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Using central London {"—"} enable location for a bearing exact
            to where you are. Across the UK the qibla varies by about 6°.
          </Text>
        </View>
      ) : null}

      {/* ---------------------------------------------------------------
          THE SUN METHOD. Arithmetic beats magnetometers. Collapsed by
          default, but promoted automatically the moment the compass can't
          be trusted — that is when it stops being trivia and becomes the
          only working technique.
          --------------------------------------------------------------- */}
      <View style={styles.sunCard}>
        {/* Touchable, not Pressable: this screen was the only one still using
            bare Pressables, so its three controls were the only taps in the
            app with no Android ripple and no press scale. */}
        <Touchable
          onPress={() => setSunOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: sunExpanded }}
          accessibilityLabel="Check the qibla against the sun"
          style={styles.sunHeader}
        >
          <MaterialCommunityIcons
            name="weather-sunny"
            size={20}
            color={colors.attention}
          />
          <View style={styles.sunHeaderText}>
            <Text style={styles.sunTitle}>Check it against the sun</Text>
            {/* Collapsed, this line IS the method — the whole instruction
                has to fit here. Expanded, the body repeats it at full
                weight, so showing it twice is just noise. */}
            {sunExpanded ? null : (
              <Text style={styles.sunSummary} numberOfLines={2}>
                {sunNow.sunUp
                  ? sunNow.instruction
                  : crossings.towards
                    ? `Sun sits on the qibla line at ${formatClock(crossings.towards)}`
                    : "Available in daylight"}
              </Text>
            )}
          </View>
          <MaterialCommunityIcons
            name={sunExpanded ? "chevron-up" : "chevron-down"}
            size={22}
            color={colors.textSecondary}
          />
        </Touchable>

        {sunExpanded ? (
          <View style={styles.sunBodyWrap}>
            <Text style={styles.sunBody}>
              The sun&apos;s position is calculated, not sensed, so magnets and
              metal can&apos;t fool it.
            </Text>
            {sunNow.sunUp ? (
              <Text style={styles.sunInstruction}>{sunNow.instruction}</Text>
            ) : null}
            {crossings.towards ? (
              <Text style={styles.sunBody}>
                {`At ${formatClock(crossings.towards)} today the sun sits exactly on the qibla line — face your shadow's opposite direction and that is the qibla, to a fraction of a degree.`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Reference, not instruction: assessCompass already tells the user to
          hold the phone flat AT THE MOMENT it is tilted, which is worth far
          more than a permanent paragraph saying so. */}
      <View style={styles.tips}>
        <Touchable
          onPress={() => setTipsOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: tipsOpen }}
          style={styles.tipsHeader}
        >
          <Text style={styles.tipsTitle}>Getting an accurate reading</Text>
          <MaterialCommunityIcons
            name={tipsOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textSecondary}
          />
        </Touchable>
        {tipsOpen ? (
          <Text style={styles.tipsBody}>
            Hold the phone flat and level, screen up. Steel, speakers, laptops
            and reinforced concrete all pull a compass off course {"—"} the
            warnings above will tell you when that is happening.
          </Text>
        ) : null}
      </View>

      <Text style={styles.privacy}>
        Everything here is calculated on your device. Nothing about your
        location is sent anywhere.
      </Text>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors, scheme: "light" | "dark", dial: number) => {
  // Depth reads differently per theme: a black shadow on a near-black
  // screen is mathematically invisible, so dark mode expresses lift by
  // luminance (a lighter well, a lit top edge) instead.
  //
  // The shadow half comes from elevation(scheme, "ambient") rather than
  // being written out here. Hand-rolled, this declared iOS 0.06/18/8 while the
  // recenter button declared 0.15/6/2 and both landed on Android elevation 3–4
  // — the two surfaces matched on one platform and not the other, which is the
  // precise drift elevation.ts's own docstring describes.
  const lift =
    scheme === "dark"
      ? { borderColor: colors.surfaceSecondary }
      : { borderColor: colors.border, ...elevation(scheme, "ambient") };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: spacing.l,
      paddingBottom: spacing.xxl,
      alignItems: "center",
      gap: spacing.m,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },

    hero: {
      alignItems: "center",
      gap: 2,
      marginTop: spacing.s,
    },
    kicker: {
      ...type.footnote,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },
    heroNumber: {
      ...type.display,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    heroLockRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.s,
      // minHeight, not height: 60 matches heroNumber's lineHeight so the hero
      // doesn't jump as it swaps between the two, but a hard height clipped
      // the 34px "Aligned" — the screen's whole success state — for anyone
      // running large text. minHeight keeps the alignment and lets it grow.
      minHeight: 60,
    },
    heroWord: {
      ...type.hero,
      fontWeight: "700",
    },

    dialWrap: {
      width: dial,
      alignItems: "center",
    },
    // The dial's layers all need the same treatment — they are a rendered
    // instrument, not controls, and must never intercept a touch meant for
    // the scroll view.
    /** Any decorative layer that must never intercept a touch. */
    inert: {
      pointerEvents: "none",
    },
    gate: {
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: -4,
      pointerEvents: "none",
    },
    dial: {
      width: dial,
      height: dial,
      borderRadius: dial / 2,
      borderWidth: 1,
      backgroundColor: colors.canvas,
      ...lift,
    },
    face: {
      position: "absolute",
      width: dial,
      height: dial,
      pointerEvents: "none",
    },
    // Each glyph sits in a full-size layer rotated about the dial's centre;
    // its child is pinned to the top, so rotating the layer sweeps the child
    // around the rim.
    rotor: {
      position: "absolute",
      width: dial,
      height: dial,
      alignItems: "center",
      paddingTop: RIM,
      pointerEvents: "none",
    },
    cardinal: {
      marginTop: TICK_MAJOR.h + 6,
      ...type.caption,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },
    cardinalNorth: {
      color: colors.text,
    },
    hub: {
      position: "absolute",
      top: dial / 2 - 9,
      left: dial / 2 - 9,
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 3,
      borderColor: colors.canvas,
    },

    tape: {
      height: TAPE_HEIGHT,
      overflow: "hidden",
      justifyContent: "center",
      marginTop: spacing.xs,
    },
    tapeCapture: {
      position: "absolute",
      top: 4,
      bottom: 4,
      borderRadius: radius.m,
      backgroundColor: colors.accentSoft,
    },
    tapeIndex: {
      position: "absolute",
      top: 2,
      width: 2,
      height: TAPE_HEIGHT - 4,
      borderRadius: 1,
      backgroundColor: colors.text,
    },
    tapeMarker: {
      position: "absolute",
      bottom: 2,
      width: 16,
      alignItems: "center",
    },

    metrics: {
      flexDirection: "row",
      alignItems: "stretch",
      width: "100%",
      marginTop: spacing.xs,
    },
    metric: {
      flex: 1,
      alignItems: "center",
      gap: 3,
    },
    metricDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    metricLabel: {
      ...type.micro,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.textSecondary,
    },
    metricValue: {
      ...type.callout,
      fontWeight: "600",
      color: colors.text,
      fontVariant: ["tabular-nums"],
      textAlign: "center",
    },

    note: {
      width: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.s,
      backgroundColor: colors.canvas,
      borderRadius: radius.xl,
      ...cardEdge(scheme, colors),
      padding: spacing.l,
    },
    // The tinted fill carries the warning on its own now — the redesign
    // dropped card outlines in light mode, and amber-on-amber-soft already
    // clears AA for the icon and text inside.
    noteAttention: {
      backgroundColor: colors.attentionSoft,
      borderColor: colors.attention,
    },
    noteText: {
      flex: 1,
      ...type.footnote,
      color: colors.text,
    },
    noteButton: {
      minHeight: MIN_TARGET,
      justifyContent: "center",
      paddingHorizontal: spacing.m,
      marginVertical: -spacing.m,
      borderRadius: radius.m,
    },
    noteButtonLabel: {
      ...type.subhead,
      fontWeight: "700",
      color: colors.accent,
    },

    sunCard: {
      width: "100%",
      backgroundColor: colors.canvas,
      borderRadius: radius.xl,
      ...cardEdge(scheme, colors),
      // Android only: clips the header ripple. iOS must not clip, or
      // masksToBounds erases the shadow.
      ...Platform.select({ android: { overflow: "hidden" as const } }),
    },
    sunHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.m,
      padding: spacing.l,
      minHeight: MIN_TARGET,
    },
    sunHeaderText: {
      flex: 1,
      gap: 2,
    },
    sunTitle: {
      ...type.callout,
      fontWeight: "700",
      color: colors.text,
    },
    sunSummary: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    sunBodyWrap: {
      paddingHorizontal: spacing.l,
      paddingBottom: spacing.l,
      gap: spacing.s,
    },
    sunBody: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    sunInstruction: {
      ...type.body,
      fontWeight: "700",
      color: colors.text,
    },

    tips: {
      width: "100%",
    },
    tipsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: MIN_TARGET,
    },
    tipsTitle: {
      ...type.eyebrow,
      color: colors.textSecondary,
    },
    tipsBody: {
      ...type.footnote,
      color: colors.textSecondary,
      paddingBottom: spacing.s,
    },
    privacy: {
      ...type.caption,
      color: colors.textSecondary,
      textAlign: "center",
      // No `opacity`. textSecondary is already the palette's quiet ink and is
      // tuned to sit exactly at AA on `surface` (4.92:1 light); dimming it to
      // 0.9 composited to 4.03:1 and pushed it under. The palette tests never
      // caught it because the alpha lived here, not in the palette.
    },
  });
};
