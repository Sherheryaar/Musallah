import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import SunArc from "@/components/SunArc";
import { useSettings } from "@/context/SettingsContext";
import { formatHijri } from "@/lib/hijri";
import { computePrayerSchedule, PrayerScheduleEntry } from "@/lib/prayerTimes";
import { night, radius, spacing } from "@/lib/theme";

const FALLBACK_LOCATION = { lat: 51.5074, lng: -0.1278 };

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const suffix =
    day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatCountdown(msLeft: number): string {
  const mins = Math.max(1, Math.ceil(msLeft / 60_000));
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const h = `${hours} hr${hours === 1 ? "" : "s"}`;
  return rest === 0 ? h : `${h} ${rest} min${rest === 1 ? "" : "s"}`;
}

type Status = { currentLabel: string; nextLabel: string; msUntilNext: number };

function getStatus(
  today: PrayerScheduleEntry[],
  tomorrowFajr: Date | null,
  now: Date,
): Status | null {
  const prayers = today.filter((entry) => entry.key !== "sunrise");
  const next = prayers.find((entry) => entry.time.getTime() > now.getTime());
  if (!next) {
    // After Isha: the next prayer is tomorrow's Fajr.
    if (!tomorrowFajr) return null;
    return {
      currentLabel: "Isha",
      nextLabel: "Fajr",
      msUntilNext: tomorrowFajr.getTime() - now.getTime(),
    };
  }
  const i = prayers.indexOf(next);
  return {
    // Before Fajr the "current" prayer is still last night's Isha.
    currentLabel: i === 0 ? "Isha" : prayers[i - 1].label,
    nextLabel: next.label,
    msUntilNext: next.time.getTime() - now.getTime(),
  };
}

type SkyPhase = "dawn" | "day" | "golden" | "dusk" | "night";

// Overmorrow-style dynamic scene: the sky palette follows the actual time
// of day instead of being a fixed navy -- indigo dawn, clear blue day with
// a sun, mauve golden hour, and a starry night with a moon.
const SKY: Record<
  SkyPhase,
  { bg: string; accent: string; celestial: "sun" | "moon"; stars: boolean }
> = {
  dawn: { bg: "#2B2350", accent: "#F2A66B", celestial: "moon", stars: true },
  day: { bg: "#1C5FA8", accent: "#FFD983", celestial: "sun", stars: false },
  golden: { bg: "#4E3A63", accent: "#F2A66B", celestial: "sun", stars: false },
  dusk: { bg: "#2C2154", accent: "#F2A66B", celestial: "moon", stars: true },
  night: { bg: "#0D1F3C", accent: "#F2A66B", celestial: "moon", stars: true },
};

function getPhase(today: PrayerScheduleEntry[], now: Date): SkyPhase {
  const at = (key: PrayerScheduleEntry["key"]) =>
    today.find((e) => e.key === key)?.time.getTime() ?? 0;
  const n = now.getTime();
  if (n < at("fajr") || n >= at("isha")) return "night";
  if (n < at("sunrise")) return "dawn";
  if (n < at("asr")) return "day";
  if (n < at("maghrib")) return "golden";
  return "dusk";
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [location, setLocation] = useState(FALLBACK_LOCATION);
  const [dayOffset, setDayOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Tick every 30 s so the countdown and sun position stay honest while
  // the screen is open.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Silent location read -- the home screen owns the permission prompt, so
  // this never asks; it just uses the existing fix when there is one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos =
          (await Location.getLastKnownPositionAsync({
            maxAge: 10 * 60 * 1000,
          })) ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));
        if (!cancelled) {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        // Fallback location already set.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDate = useMemo(() => addDays(now, dayOffset), [now, dayOffset]);

  const schedule = useMemo(
    () =>
      computePrayerSchedule(location.lat, location.lng, settings, selectedDate),
    [location, settings, selectedDate],
  );

  const status = useMemo(() => {
    const today =
      dayOffset === 0
        ? schedule
        : computePrayerSchedule(location.lat, location.lng, settings, now);
    if (!today) return null;
    const tomorrow = computePrayerSchedule(
      location.lat,
      location.lng,
      settings,
      addDays(now, 1),
    );
    const tomorrowFajr = tomorrow?.find((e) => e.key === "fajr")?.time ?? null;
    return getStatus(today, tomorrowFajr, now);
  }, [schedule, dayOffset, location, settings, now]);

  const sky = useMemo(() => {
    const today =
      dayOffset === 0
        ? schedule
        : computePrayerSchedule(location.lat, location.lng, settings, now);
    return SKY[today ? getPhase(today, now) : "night"];
  }, [schedule, dayOffset, location, settings, now]);

  const highlightKey =
    dayOffset === 0 && status ? status.currentLabel.toLowerCase() : null;

  const dateTitle = `${WEEKDAYS[selectedDate.getDay()]} ${ordinal(
    selectedDate.getDate(),
  )} ${MONTHS[selectedDate.getMonth()]}`;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: sky.bg }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 52,
          paddingBottom: spacing.xxl + insets.bottom,
        },
      ]}
    >
      <Text style={styles.currentName}>{status?.currentLabel ?? "Prayer"}</Text>
      {status ? (
        <View style={styles.countdownPill}>
          <Text style={styles.countdownText}>
            {`${formatCountdown(status.msUntilNext)} left until ${status.nextLabel}`}
          </Text>
        </View>
      ) : null}

      {schedule ? (
        <SunArc
          schedule={schedule}
          now={dayOffset === 0 ? now : null}
          accent={sky.accent}
          markerBg={sky.bg}
          celestial={sky.celestial}
          stars={sky.stars}
        />
      ) : null}

      <View style={styles.dateNav}>
        <TouchableOpacity
          style={styles.chevronButton}
          onPress={() => setDayOffset((o) => o - 1)}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Text style={[styles.chevron, { color: sky.accent }]}>
            {"\u2039"}
          </Text>
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <TouchableOpacity
            onPress={() => setDayOffset(0)}
            disabled={dayOffset === 0}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
          >
            <Text
              style={[
                styles.todayChip,
                { color: sky.accent, borderColor: sky.accent },
                dayOffset !== 0 && styles.todayChipButton,
              ]}
            >
              {dayOffset === 0 ? "TODAY" : "BACK TO TODAY"}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.dateTitle, { color: sky.accent }]}>
            {dateTitle}
          </Text>
          <Text style={[styles.hijriDate, { color: sky.accent }]}>
            {formatHijri(selectedDate)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.chevronButton}
          onPress={() => setDayOffset((o) => o + 1)}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Text style={[styles.chevron, { color: sky.accent }]}>
            {"\u203A"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rows}>
        {(schedule ?? []).map((entry) => {
          const active = entry.key === highlightKey;
          return (
            <View key={entry.key} style={[styles.row, active && styles.rowActive]}>
              <Text style={[styles.rowLabel, active && styles.rowTextActive]}>
                {entry.label}
              </Text>
              <Text style={[styles.rowTime, active && styles.rowTextActive]}>
                {entry.display}
              </Text>
            </View>
          );
        })}
      </View>

      <Link href="/settings" style={styles.methodLink}>
        <Text style={styles.methodText}>
          {`${
            settings.method === "moonsighting"
              ? "Moonsighting Committee"
              : "Muslim World League"
          } \u00B7 ${
            settings.madhab === "hanafi" ? "2" : "1"
          } mithl Asr \u00B7 change in Settings`}
        </Text>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: night.bg,
  },
  content: {
    padding: spacing.l,
  },
  currentName: {
    fontSize: 40,
    fontWeight: "700",
    color: night.text,
    marginTop: spacing.s,
  },
  countdownPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(246,247,251,0.08)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: spacing.l,
    marginTop: spacing.s,
  },
  countdownText: {
    color: night.textMuted,
    fontSize: 15,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.m,
  },
  chevronButton: {
    padding: spacing.m,
  },
  chevron: {
    color: night.accent,
    fontSize: 28,
    fontWeight: "600",
  },
  dateCenter: {
    flex: 1,
    alignItems: "center",
  },
  todayChip: {
    color: night.accent,
    borderColor: night.accent,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    overflow: "hidden",
  },
  todayChipButton: {
    backgroundColor: night.accentSoft,
  },
  dateTitle: {
    color: night.accent,
    fontSize: 24,
    fontWeight: "700",
    marginTop: spacing.s,
  },
  hijriDate: {
    color: night.accent,
    opacity: 0.8,
    fontSize: 14,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  rows: {
    marginTop: spacing.l,
    gap: spacing.m,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: night.border,
    borderRadius: radius.l,
    paddingVertical: spacing.l,
    paddingHorizontal: spacing.l,
    backgroundColor: "rgba(246,247,251,0.02)",
  },
  rowActive: {
    borderColor: night.text,
    backgroundColor: "rgba(246,247,251,0.05)",
  },
  rowLabel: {
    color: night.textMuted,
    fontSize: 17,
    fontWeight: "600",
  },
  rowTime: {
    color: night.textMuted,
    fontSize: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  rowTextActive: {
    color: night.text,
    fontWeight: "700",
  },
  methodLink: {
    alignSelf: "center",
    marginTop: spacing.l,
  },
  methodText: {
    color: night.textMuted,
    fontSize: 12,
  },
});
