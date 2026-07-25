import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";

import { PrayerScheduleEntry } from "@/lib/prayerTimes";
import { night } from "@/lib/theme";

// The day arc is drawn with plain positioned Views (no SVG/chart library):
// dozens of tiny dots along a sine curve, ring markers for each prayer, and
// a filled dot for the current position. Static Views render on the native
// side, so this costs nothing at runtime.

const HEIGHT = 176;
const HORIZON_Y = 120;
const AMPLITUDE = 80;
const ARC_DOTS = 44;

// Fixed star field -- deterministic so it never flickers between renders.
const STARS = [
  { x: 0.03, y: 0.08, s: 2.5, o: 0.8 },
  { x: 0.09, y: 0.38, s: 1.5, o: 0.4 },
  { x: 0.14, y: 0.16, s: 2, o: 0.6 },
  { x: 0.22, y: 0.05, s: 1.5, o: 0.5 },
  { x: 0.27, y: 0.3, s: 2, o: 0.35 },
  { x: 0.36, y: 0.12, s: 1.5, o: 0.6 },
  { x: 0.44, y: 0.04, s: 2, o: 0.45 },
  { x: 0.52, y: 0.22, s: 1.5, o: 0.5 },
  { x: 0.6, y: 0.09, s: 2.5, o: 0.7 },
  { x: 0.68, y: 0.28, s: 1.5, o: 0.4 },
  { x: 0.76, y: 0.06, s: 2, o: 0.55 },
  { x: 0.83, y: 0.34, s: 1.5, o: 0.45 },
  { x: 0.55, y: 0.42, s: 1.5, o: 0.3 },
  { x: 0.31, y: 0.45, s: 1.5, o: 0.3 },
];

const MARKER_KEYS: PrayerScheduleEntry["key"][] = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

const CELESTIAL = {
  moon: { body: "#E9EBF3", halo: "rgba(246,247,251,0.16)" },
  sun: { body: "#FFD983", halo: "rgba(255,217,131,0.20)" },
} as const;

type Props = {
  schedule: PrayerScheduleEntry[];
  /** Current time, or null when showing a day other than today. */
  now: Date | null;
  /** Colour for the elapsed part of the arc. */
  accent?: string;
  /** Fill behind the prayer ring markers (usually the screen background). */
  markerBg?: string;
  celestial?: "sun" | "moon";
  stars?: boolean;
};

export default function SunArc({
  schedule,
  now,
  accent = night.accent,
  markerBg = night.bg,
  celestial = "moon",
  stars = true,
}: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const arc = useMemo(() => {
    if (!width) return null;
    const at = (key: PrayerScheduleEntry["key"]) =>
      schedule.find((entry) => entry.key === key)?.time.getTime();
    const fajr = at("fajr");
    const sunrise = at("sunrise");
    const maghrib = at("maghrib"); // ~ sunset
    const isha = at("isha");
    if (fajr == null || sunrise == null || maghrib == null || isha == null) {
      return null;
    }

    const start = fajr - 45 * 60_000;
    const end = isha + 45 * 60_000;
    const xFor = (t: number) => ((t - start) / (end - start)) * width;
    // Sine day-arc: above the horizon between sunrise and sunset, dipping
    // below it before dawn and after nightfall.
    const yFor = (t: number) =>
      Math.min(
        HEIGHT - 8,
        HORIZON_Y -
          AMPLITUDE * Math.sin(Math.PI * ((t - sunrise) / (maghrib - sunrise))),
      );
    const nowMs = now ? Math.min(Math.max(now.getTime(), start), end) : null;

    const dots = [];
    for (let i = 0; i <= ARC_DOTS; i++) {
      const t = start + ((end - start) * i) / ARC_DOTS;
      dots.push({ x: xFor(t), y: yFor(t), past: nowMs != null && t <= nowMs });
    }
    const markers = MARKER_KEYS.map((key) => {
      const t = at(key) as number;
      return { key, x: xFor(t), y: yFor(t), past: nowMs != null && t <= nowMs };
    });
    const sun = nowMs != null ? { x: xFor(nowMs), y: yFor(nowMs) } : null;
    return { dots, markers, sun };
  }, [width, schedule, now]);

  const glow = CELESTIAL[celestial];

  return (
    <View style={styles.container} onLayout={onLayout}>
      {stars && width > 0
        ? STARS.map((star, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: star.x * width,
                top: star.y * HEIGHT,
                width: star.s,
                height: star.s,
                borderRadius: star.s / 2,
                backgroundColor: night.text,
                opacity: star.o,
              }}
            />
          ))
        : null}
      <View style={[styles.celestialHalo, { backgroundColor: glow.halo }]} />
      <View style={[styles.celestialBody, { backgroundColor: glow.body }]} />
      <View style={styles.horizon} />
      {arc?.dots.map((dot, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: dot.x - 1.5,
            top: dot.y - 1.5,
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: dot.past ? accent : night.arcFuture,
          }}
        />
      ))}
      {arc?.markers.map((marker) => (
        <View
          key={marker.key}
          style={{
            position: "absolute",
            left: marker.x - 6,
            top: marker.y - 6,
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2.5,
            borderColor: marker.past ? night.text : night.arcFuture,
            backgroundColor: markerBg,
          }}
        />
      ))}
      {arc?.sun ? (
        <View
          style={{
            position: "absolute",
            left: arc.sun.x - 8,
            top: arc.sun.y - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: night.text,
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEIGHT,
    marginTop: 8,
    overflow: "hidden",
  },
  horizon: {
    position: "absolute",
    top: HORIZON_Y,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(246,247,251,0.15)",
  },
  celestialHalo: {
    position: "absolute",
    top: -30,
    right: -26,
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  celestialBody: {
    position: "absolute",
    top: -8,
    right: -4,
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});
