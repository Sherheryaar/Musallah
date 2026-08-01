import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";

import { useTheme } from "@/context/ThemeContext";
import { FALLBACK_LOCATION } from "@/lib/geo";
import {
  compassPoint,
  distanceToKaabaKm,
  qiblaBearing,
  qiblaGuidance,
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
  | { kind: "live"; heading: number; needsCalibration: boolean }
  // No compass available (web, denied permission, no magnetometer): the
  // bearing is still useful, so show it as a static number.
  | { kind: "static"; reason: string };

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
        sub = await Location.watchHeadingAsync((data) => {
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

          // iOS reports accuracy as degrees of error; Android as a 0–3
          // quality enum. Both mean "wave the phone in a figure of eight".
          const needsCalibration =
            typeof data.accuracy === "number" &&
            (Platform.OS === "android"
              ? data.accuracy < 2
              : data.accuracy < 0 || data.accuracy > 20);

          setHeading((prev) => {
            if (
              prev.kind === "live" &&
              prev.needsCalibration === needsCalibration &&
              Math.abs(prev.heading - next) < 0.5
            ) {
              return prev; // below the visible threshold — skip the render
            }
            return { kind: "live", heading: next, needsCalibration };
          });
        });
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
  const aligned = guidance?.aligned ?? false;

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
        ).toLocaleString()} km to Makkah`}
      </Text>

      {heading.kind === "live" && heading.needsCalibration ? (
        <View style={[styles.note, styles.noteAttention]}>
          <Text style={styles.noteText}>
            Compass needs calibrating {"—"} wave your phone in a figure of
            eight, and keep it away from metal, magnets and car dashboards.
          </Text>
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

      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>Getting an accurate reading</Text>
        <Text style={styles.tipsBody}>
          Hold the phone flat and level, screen up. Steel, speakers, laptops
          and reinforced concrete all pull a compass off course {"—"} step
          away from them if the needle wanders. Everything here is calculated
          on your device; nothing about your location is sent anywhere.
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
