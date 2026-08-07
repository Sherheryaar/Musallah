import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Accelerometer, Magnetometer } from "expo-sensors";

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
  compassPoint,
  distanceToKaabaKm,
  qiblaBearing,
  qiblaFromSun,
  qiblaGuidance,
  qiblaSunCrossings,
  smoothAngle,
} from "@/lib/qibla";
import { placeTypeColors, radius, spacing, type ThemeColors } from "@/lib/theme";

const DIAL_SIZE = 288;
const NEEDLE_COLOR = placeTypeColors.masjid; // green = "this way"

/** Minor ticks every 30°, skipping the four cardinal positions. */
const TICKS = [30, 60, 120, 150, 210, 240, 300, 330];
const CARDINALS: { angle: number; label: string }[] = [
  { angle: 0, label: "N" },
  { angle: 90, label: "E" },
  { angle: 180, label: "S" },
  { angle: 270, label: "W" },
];

type HeadingState =
  | { kind: "loading" }
  | { kind: "live"; heading: number; accuracy: number | null }
  // No compass available (web, denied permission, no magnetometer): the
  // bearing is still useful, so show it as a static number.
  | { kind: "static"; reason: string };

const PLATFORM: "ios" | "android" | "other" =
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "other";

/** "13:42" in the user's local time. */
function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

export default function QiblaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
  // Smoothed heading lives in a ref: the filter must not depend on render
  // timing, and we only re-render when the value moves visibly.
  const smoothed = useRef<number | null>(null);

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
            "Allow location access to use the live compass. The bearing below is still correct for your area.",
        });
        return;
      }
      if (Platform.OS === "web") {
        setHeading({
          kind: "static",
          reason:
            "The live compass needs a phone's magnetometer, which browsers don't reliably expose. Use the bearing below with any compass.",
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

          const next =
            smoothed.current === null ? raw : smoothAngle(smoothed.current, raw);
          smoothed.current = next;
          const accuracy =
            typeof data.accuracy === "number" ? data.accuracy : null;

          setHeading((prev) => {
            if (
              prev.kind === "live" &&
              prev.accuracy === accuracy &&
              Math.abs(prev.heading - next) < 0.5
            ) {
              return prev; // below the visible threshold — skip the render
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
            "This device didn't report a compass heading. Use the bearing below with a compass app.",
        });
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  // Sensor-quality feeds: magnetometer field strength catches magnets and
  // metal (an interfered compass reads confidently and WRONG — the single
  // biggest cause of "the qibla app is off"), the accelerometer catches a
  // tilted phone. Both are advisory sensors only; the heading itself still
  // comes from watchHeadingAsync.
  useEffect(() => {
    if (Platform.OS === "web") return;
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

  const point = coords ?? FALLBACK_LOCATION;
  const bearing = useMemo(
    () => qiblaBearing(point.lat, point.lng),
    [point.lat, point.lng],
  );
  const distanceKm = useMemo(
    () => distanceToKaabaKm(point.lat, point.lng),
    [point.lat, point.lng],
  );

  const liveHeading = heading.kind === "live" ? heading.heading : null;
  const guidance =
    liveHeading === null ? null : qiblaGuidance(liveHeading, bearing);
  // With no compass, draw the dial as if facing north: the needle then sits
  // at the true bearing, which is exactly what the static readout means.
  const rotation = liveHeading ?? 0;

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
  const accuracyLabel =
    heading.kind === "live"
      ? describeAccuracy(heading.accuracy, PLATFORM)
      : null;

  // Sun-based guidance: immune to everything that fools a magnetometer.
  // Recomputed each minute (the sun moves ~0.25°/min).
  const sunNow = useMemo(
    () => qiblaFromSun(point.lat, point.lng, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [point.lat, point.lng, minuteTick],
  );
  const crossings = useMemo(
    () => qiblaSunCrossings(point.lat, point.lng, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [point.lat, point.lng, minuteTick > 0 && new Date().getDate()],
  );

  const spin = (angle: number) => [{ rotate: `${angle - rotation}deg` }];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[styles.dial, aligned && styles.dialAligned]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          guidance
            ? `Qibla is ${Math.round(bearing)} degrees. ${guidance.instruction}`
            : `Qibla is ${Math.round(bearing)} degrees from true north`
        }
      >
        {TICKS.map((angle) => (
          <View
            key={angle}
            style={[styles.rotor, { transform: spin(angle) }]}
            pointerEvents="none"
          >
            <View style={styles.tick} />
          </View>
        ))}

        {CARDINALS.map(({ angle, label }) => (
          <View
            key={label}
            style={[styles.rotor, { transform: spin(angle) }]}
            pointerEvents="none"
          >
            {/* Counter-rotated so the letter stays upright as the dial turns */}
            <Text
              style={[
                styles.cardinal,
                label === "N" && styles.cardinalNorth,
                { transform: [{ rotate: `${rotation - angle}deg` }] },
              ]}
            >
              {label}
            </Text>
          </View>
        ))}

        {/* The sun's live position on the rim — lets anyone sanity-check
            the dial against the sky at a glance. */}
        {sunNow.sunUp ? (
          <View
            style={[styles.rotor, { transform: spin(sunNow.sun.azimuth) }]}
            pointerEvents="none"
          >
            <Text
              style={[
                styles.sunGlyph,
                { transform: [{ rotate: `${rotation - sunNow.sun.azimuth}deg` }] },
              ]}
            >
              {"☀️"}
            </Text>
          </View>
        ) : null}

        {/* The qibla needle */}
        <View
          style={[styles.rotor, { transform: spin(bearing) }]}
          pointerEvents="none"
        >
          <Text
            style={[
              styles.kaaba,
              { transform: [{ rotate: `${rotation - bearing}deg` }] },
            ]}
          >
            {"🕋"}
          </Text>
          <View style={styles.arrowHead} />
          <View style={styles.arrowStem} />
        </View>

        <View style={[styles.hub, aligned && styles.hubAligned]} />
      </View>

      {guidance ? (
        <Text
          style={[styles.instruction, aligned && styles.instructionAligned]}
        >
          {guidance.instruction}
        </Text>
      ) : (
        <Text style={styles.instruction}>
          {`${Math.round(bearing)}° from north`}
        </Text>
      )}

      <Text style={styles.readout}>
        {`Qibla ${Math.round(bearing)}° ${compassPoint(bearing)} · ${Math.round(
          distanceKm,
        ).toLocaleString()} km to Makkah${accuracyLabel ? ` · Compass ${accuracyLabel}` : ""}`}
      </Text>

      {/* Sensor verdict: say WHY the reading can't be trusted, not just
          a generic calibration nag. */}
      {heading.kind === "live" && quality.advice ? (
        <View style={[styles.note, styles.noteAttention]}>
          <Text style={styles.noteText}>{quality.advice}</Text>
        </View>
      ) : null}

      {heading.kind === "static" ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>{heading.reason}</Text>
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

      {/* The sun method: arithmetic beats magnetometers. This is how to
          check the compass — or replace it entirely. */}
      <View style={styles.sunCard}>
        <Text style={styles.sunTitle}>{"☀️  Check it against the sun"}</Text>
        <Text style={styles.sunBody}>
          The sun&apos;s position is calculated, not sensed, so magnets and
          metal can&apos;t fool it.
        </Text>
        <Text style={styles.sunInstruction}>{sunNow.instruction}</Text>
        {crossings.towards ? (
          <Text style={styles.sunBody}>
            {`At ${formatClock(crossings.towards)} today the sun sits exactly on the qibla line — face your shadow's opposite direction and that is the qibla, to a fraction of a degree.`}
          </Text>
        ) : null}
      </View>

      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>Getting an accurate reading</Text>
        <Text style={styles.tipsBody}>
          Hold the phone flat and level, screen up. Steel, speakers, laptops
          and reinforced concrete all pull a compass off course {"—"} the
          warnings above will tell you when that is happening. Everything
          here is calculated on your device; nothing about your location is
          sent anywhere.
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    dial: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      borderRadius: DIAL_SIZE / 2,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.canvas,
      marginTop: spacing.s,
      marginBottom: spacing.s,
      // Soft lift so the dial reads as a physical instrument.
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    dialAligned: {
      borderColor: NEEDLE_COLOR,
    },
    // Every dial element sits in a full-size layer rotated about the centre;
    // its child is pinned to the top, so rotating the layer sweeps the child
    // around the rim.
    rotor: {
      position: "absolute",
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      alignItems: "center",
      paddingTop: spacing.s,
    },
    tick: {
      width: 2,
      height: 10,
      borderRadius: 1,
      backgroundColor: colors.border,
    },
    cardinal: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      lineHeight: 16,
    },
    cardinalNorth: {
      color: colors.text,
    },
    kaaba: {
      fontSize: 20,
      lineHeight: 24,
      marginTop: -2,
    },
    sunGlyph: {
      fontSize: 14,
      lineHeight: 18,
      marginTop: 26,
      opacity: 0.9,
    },
    arrowHead: {
      width: 0,
      height: 0,
      marginTop: spacing.xs,
      borderLeftWidth: 12,
      borderRightWidth: 12,
      borderBottomWidth: 22,
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
      borderBottomColor: NEEDLE_COLOR,
    },
    arrowStem: {
      width: 6,
      // Reaches from the arrow head to the hub at the dial's centre.
      height: DIAL_SIZE / 2 - 62,
      backgroundColor: NEEDLE_COLOR,
      borderTopLeftRadius: 3,
      borderTopRightRadius: 3,
    },
    hub: {
      position: "absolute",
      top: DIAL_SIZE / 2 - 9,
      left: DIAL_SIZE / 2 - 9,
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 3,
      borderColor: colors.canvas,
      backgroundColor: colors.textSecondary,
    },
    hubAligned: {
      backgroundColor: NEEDLE_COLOR,
    },
    instruction: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    instructionAligned: {
      color: NEEDLE_COLOR,
    },
    readout: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
    },
    note: {
      width: "100%",
      backgroundColor: colors.canvas,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.l,
    },
    noteAttention: {
      backgroundColor: colors.attentionSoft,
      borderColor: colors.attention,
    },
    noteText: {
      fontSize: 13,
      color: colors.text,
      lineHeight: 19,
    },
    sunCard: {
      width: "100%",
      backgroundColor: colors.attentionSoft,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.attention,
      padding: spacing.l,
      gap: spacing.s,
    },
    sunTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    sunBody: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    sunInstruction: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    tips: {
      width: "100%",
      marginTop: spacing.s,
      gap: spacing.xs,
    },
    tipsTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    tipsBody: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
  });
