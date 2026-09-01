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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Dial from "@/components/qibla/Dial";
import SunCard from "@/components/qibla/SunCard";
import TurnTape from "@/components/qibla/TurnTape";
import Touchable from "@/components/Touchable";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import {
  assessCompass,
  describeAccuracy,
  type CompassQuality,
} from "@/lib/compassQuality";
import { cardEdge } from "@/lib/elevation";
import { FALLBACK_LOCATION } from "@/lib/geo";
import { hapticHeavy, hapticTick } from "@/lib/haptics";
import { MIN_TARGET } from "@/lib/metrics";
import {
  compassPoint,
  distanceToKaabaKm,
  instrumentSize,
  qiblaBearing,
  qiblaFromSun,
  qiblaGuidance,
  qiblaSunCrossings,
} from "@/lib/qibla";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";
import { isoDate } from "@/lib/time";
import { useCompassHeading } from "@/lib/useCompassHeading";
import { useDeviceLocation } from "@/lib/useDeviceLocation";
import { useMinuteTick } from "@/lib/useMinuteTick";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useSensorQuality } from "@/lib/useSensorQuality";

const MAX_DIAL = 320;
// A floor as well as a cap: useWindowDimensions() reports 0 before the first
// layout, and a negative dial size put negative radii into the SVG. See
// instrumentSize, which is tested for exactly this.
const MIN_DIAL = 200;

/** Below this the needle is drawn as authoritative; above it, as a hint. */
const HYSTERESIS_EXIT_DEG = 8;

const PLATFORM: "ios" | "android" | "other" =
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "other";

// Hoisted: the metrics strip re-renders on roughly every whole degree of
// turn, and a bare toLocaleString() builds a fresh formatter each call.
const KM_FORMAT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export default function QiblaScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { settings } = useSettings();
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // Edge-to-edge on Android: without this the privacy line at the foot of the
  // scroll sits under the gesture/navigation bar.
  const insets = useSafeAreaInsets();

  const available = windowWidth - spacing.l * 2;
  const dial = instrumentSize(available, MAX_DIAL, MIN_DIAL);

  // Prompts (this screen cannot work without it), and on foreground re-checks
  // a denied permission so granting it in system Settings brings the compass
  // up without leaving the screen.
  const { coords, usingFallback, permission, retry } = useDeviceLocation({
    prompt: true,
  });
  const point = coords ?? FALLBACK_LOCATION;
  const bearing = useMemo(
    () => qiblaBearing(point.lat, point.lng),
    [point.lat, point.lng],
  );
  const distanceKm = useMemo(
    () => distanceToKaabaKm(point.lat, point.lng),
    [point.lat, point.lng],
  );

  const { heading, spin, turn } = useCompassHeading(permission, bearing, reduceMotion);
  const { fieldStrength, tiltDeg, bubbleX, bubbleY } = useSensorQuality();
  // Once a minute, so the sun guidance stays current.
  const now = useMinuteTick();
  const [sunOpen, setSunOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  // --- Lock-on animation state -------------------------------------------
  /** 0 → 1 as alignment is acquired. NATIVE driver: transform and opacity. */
  const lock = useRef(new Animated.Value(0)).current;
  /**
   * The same 0 → 1, but on the JS driver, because it feeds an SVG
   * strokeDashoffset — which the native driver cannot animate. Sharing one
   * value between the two would make React Native throw "Attempting to run
   * JS driven animation on an animated node that has been moved to native",
   * so this deliberate duplicate is the fix, not an oversight.
   */
  const ring = useRef(new Animated.Value(0)).current;
  /** Radial ripple wave triggered on lock. */
  const pulseWave = useRef(new Animated.Value(0)).current;
  // Read inside effects keyed on `locked` alone, so toggling the preference
  // in Settings cannot itself trigger a buzz.
  const hapticsRef = useRef(settings.hapticFeedback);
  hapticsRef.current = settings.hapticFeedback;
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

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
  const needleColor = authoritative ? colors.accent : colors.textSecondary;
  // A dial that can't track is a diagram, not an instrument, and must not be
  // dressed as one: without a live heading the gate, the tape and every
  // alignment claim come off.
  const instrument = live;

  // --- Sun method --------------------------------------------------------
  // Midnight today, keyed on the calendar DATE rather than the minute, so the
  // day-long sun scans rerun once a day, not once a minute.
  const dayKey = isoDate(now);
  const today = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey],
  );
  // Recomputed each minute (the sun moves ~0.25°/min).
  const sunNow = useMemo(
    () => qiblaFromSun(point.lat, point.lng, now),
    [point.lat, point.lng, now],
  );
  // The day's shadow-method crossings: the heaviest computation on this
  // screen (a minute-by-minute scan of the whole day).
  const crossings = useMemo(
    () => qiblaSunCrossings(point.lat, point.lng, today),
    [point.lat, point.lng, today],
  );
  // A crossing that has already happened is not advice, so it is dropped;
  // once today's is behind us the next usable one is tomorrow's. Still null
  // at latitudes where the sun never reaches the qibla azimuth.
  const stillToCome =
    crossings.towards !== null && crossings.towards.getTime() > now.getTime();
  const tomorrowCrossing = useMemo(() => {
    if (stillToCome) return null;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return qiblaSunCrossings(point.lat, point.lng, tomorrow).towards;
  }, [stillToCome, point.lat, point.lng, today]);
  const nextCrossing =
    crossings.towards && stillToCome
      ? { at: crossings.towards, tomorrow: false }
      : tomorrowCrossing
        ? { at: tomorrowCrossing, tomorrow: true }
        : null;
  // The sun method stops being a footnote the moment the compass can't be
  // trusted — that is precisely when it becomes the answer.
  const sunExpanded = sunOpen || !live || !quality.trustworthy;

  // --- Lock-on -----------------------------------------------------------
  // Hysteresis: enter at the 5° tolerance, leave only at 8° (or when the
  // reading stops being trustworthy), so hovering on the boundary doesn't
  // strobe the whole instrument.
  const turnMagnitude = guidance ? Math.abs(guidance.turn) : 180;
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    setLocked((was) =>
      was ? turnMagnitude <= HYSTERESIS_EXIT_DEG && quality.trustworthy : aligned,
    );
  }, [turnMagnitude, quality.trustworthy, aligned]);

  useEffect(() => {
    Animated.timing(lock, {
      toValue: locked ? 1 : 0,
      duration: reduceMotion ? 0 : 260,
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

  // The confirmation buzz and ripple, once per genuine acquisition: `locked`
  // already carries the hysteresis and the trustworthiness gate.
  useEffect(() => {
    if (!locked) return;
    hapticHeavy(hapticsRef.current);
    if (reduceMotionRef.current) return;
    pulseWave.setValue(0);
    Animated.timing(pulseWave, {
      toValue: 1,
      duration: 850,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [locked, pulseWave]);

  // A light tick every 15° of turn, so the compass can be followed without
  // watching it. Skipped on the first render (there is no "turn" yet) and
  // whenever the heading isn't trustworthy enough to act on.
  const turnBucket =
    authoritative && guidance && !locked ? Math.round(guidance.turn / 15) : null;
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
  // VoiceOver nor TalkBack re-reads a focused element because a prop changed.
  // Someone turning on the spot would hear the instruction once and then
  // silence, so announce on a coarse bucket instead — roughly every 15°.
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
    // Granted from the in-app prompt: re-run the location read straight away
    // (the app never left the foreground, so no AppState transition arrives
    // to do it). Once the OS stops prompting, the only route left is Settings
    // — and useDeviceLocation re-checks on the way back from there.
    if (status === "granted") retry();
    else Linking.openSettings().catch(() => {});
  }, [retry]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* HERO. What the user needs is a verb and a number, in that order. */}
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

      <Dial
        size={dial}
        spin={spin}
        lock={lock}
        ring={ring}
        pulseWave={pulseWave}
        bubbleX={bubbleX}
        bubbleY={bubbleY}
        bearing={bearing}
        sunAzimuth={sunNow.sunUp ? sunNow.sun.azimuth : null}
        locked={locked}
        instrument={instrument}
        needleColor={needleColor}
      />

      {instrument ? (
        <TurnTape available={available} turn={turn} needleColor={needleColor} />
      ) : null}

      {/* METRICS. Three fixed columns — never dropped, or the strip reflows
          every time the compass accuracy changes. */}
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

      {/* Sensor verdict: say WHY the reading can't be trusted, not just a
          generic calibration nag. Orange is reserved for this alone. */}
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
          {/* Only the permission case has anything to act on. A device that
              reported no compass has already granted location, so this button
              would re-request a granted permission and visibly do nothing —
              the bearing above is the answer there. */}
          {heading.cause === "permission" ? (
            <Touchable
              onPress={requestLocation}
              accessibilityRole="button"
              accessibilityLabel="Allow location access"
              style={styles.noteButton}
            >
              <Text style={styles.noteButtonLabel}>Allow location</Text>
            </Touchable>
          ) : null}
        </View>
      ) : null}

      {usingFallback ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Using central London — enable location for a bearing exact to
            where you are. Across the UK the qibla varies by about 6°.
          </Text>
        </View>
      ) : null}

      <SunCard
        sun={sunNow}
        nextCrossing={nextCrossing}
        expanded={sunExpanded}
        onToggle={() => setSunOpen((v) => !v)}
      />

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
            and reinforced concrete all pull a compass off course — the
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

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: spacing.l,
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
      // the 34px "Aligned" for anyone running large text.
      minHeight: 60,
    },
    heroWord: {
      ...type.hero,
      fontWeight: "700",
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
    // The tinted fill carries the warning on its own: amber-on-amber-soft
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
    // No `opacity` on this: textSecondary is tuned to sit exactly at AA on
    // `surface`, and dimming it further pushed it under.
    privacy: {
      ...type.caption,
      color: colors.textSecondary,
      textAlign: "center",
    },
  }),
);
