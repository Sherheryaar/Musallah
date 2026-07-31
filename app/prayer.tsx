import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import * as Location from "expo-location";

import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { FALLBACK_LOCATION } from "@/lib/geo";
import { formatHijri } from "@/lib/hijri";
import { computePrayerSchedule, PrayerScheduleEntry } from "@/lib/prayerTimes";
import { radius, spacing, type ThemeColors } from "@/lib/theme";

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

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

export default function PrayerScreen() {
  const styles = useStyles();
  const { settings } = useSettings();
  const [location, setLocation] = useState(FALLBACK_LOCATION);
  const [usingFallback, setUsingFallback] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Tick every 30 s so the countdown stays honest while the screen is open.
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
        if (status !== "granted") {
          // Permission was never granted (or this screen was deep-linked to
          // before the home screen could ask). Say so instead of silently
          // showing central-London times as if they were the user's.
          if (!cancelled) setUsingFallback(true);
          return;
        }
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
        if (!cancelled) setUsingFallback(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDate = useMemo(() => addDays(now, dayOffset), [now, dayOffset]);

  // Only the calculation-relevant settings, so unrelated settings changes
  // (facility filters) don't recompute the schedule.
  const calcOptions = useMemo(
    () => ({
      method: settings.method,
      madhab: settings.madhab,
      shafaq: settings.shafaq,
    }),
    [settings.method, settings.madhab, settings.shafaq],
  );

  const schedule = useMemo(
    () =>
      computePrayerSchedule(
        location.lat,
        location.lng,
        calcOptions,
        selectedDate,
      ),
    [location, calcOptions, selectedDate],
  );

  const status = useMemo(() => {
    const today =
      dayOffset === 0
        ? schedule
        : computePrayerSchedule(location.lat, location.lng, calcOptions, now);
    if (!today) return null;
    const tomorrow = computePrayerSchedule(
      location.lat,
      location.lng,
      calcOptions,
      addDays(now, 1),
    );
    const tomorrowFajr = tomorrow?.find((e) => e.key === "fajr")?.time ?? null;
    return getStatus(today, tomorrowFajr, now);
  }, [schedule, dayOffset, location, calcOptions, now]);

  // Only highlight a row when we are actually looking at today.
  const highlightKey =
    dayOffset === 0 && status ? status.currentLabel.toLowerCase() : null;

  const dateTitle = `${WEEKDAYS[selectedDate.getDay()]} ${ordinal(
    selectedDate.getDate(),
  )} ${MONTHS[selectedDate.getMonth()]}`;

  const methodLabel =
    settings.method === "mwl" ? "Muslim World League" : "Moonsighting Committee";
  const mithlLabel = settings.madhab === "hanafi" ? "2 mithl" : "1 mithl";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {status ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>
            {`Now \u00B7 ${status.currentLabel}`}
          </Text>
          <Text style={styles.heroTitle}>
            {`${status.nextLabel} in ${formatCountdown(status.msUntilNext)}`}
          </Text>
        </View>
      ) : null}

      <View style={styles.dateNav}>
        <TouchableOpacity
          style={styles.chevronButton}
          onPress={() => setDayOffset((o) => o - 1)}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Text style={styles.chevron}>{"\u2039"}</Text>
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateTitle}>{dateTitle}</Text>
          <Text style={styles.hijriDate}>{formatHijri(selectedDate)}</Text>
          {dayOffset !== 0 ? (
            <TouchableOpacity
              onPress={() => setDayOffset(0)}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
            >
              <Text style={styles.todayChip}>Back to today</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.chevronButton}
          onPress={() => setDayOffset((o) => o + 1)}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Text style={styles.chevron}>{"\u203A"}</Text>
        </TouchableOpacity>
      </View>

      {schedule ? (
        <View style={styles.card}>
          {schedule.map((entry) => {
            const isCurrent = entry.key === highlightKey;
            const isSunrise = entry.key === "sunrise";
            return (
              <View
                key={entry.key}
                style={[styles.row, isCurrent && styles.rowCurrent]}
              >
                <Text
                  style={[
                    styles.rowLabel,
                    isSunrise && styles.rowMuted,
                    isCurrent && styles.rowCurrentText,
                  ]}
                >
                  {entry.key === "asr"
                    ? `${entry.label} (${mithlLabel})`
                    : entry.label}
                </Text>
                <Text
                  style={[
                    styles.rowTime,
                    isSunrise && styles.rowMuted,
                    isCurrent && styles.rowCurrentText,
                  ]}
                >
                  {entry.display}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.note}>
          Prayer times are unavailable for this location.
        </Text>
      )}

      {usingFallback ? (
        <Text style={styles.note}>
          Times shown for central London {"\u2014"} enable location access for
          your exact times.
        </Text>
      ) : null}

      <Text style={styles.footnote}>
        {`Calculated on this device \u00B7 ${methodLabel} \u00B7 Asr at ${mithlLabel}. `}
        <Link href="/settings" style={styles.footnoteLink}>
          Change in Settings
        </Link>
      </Text>
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
    gap: spacing.l,
  },
  // Accent-tinted hero so the countdown reads as the screen's focal point.
  heroCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroKicker: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevronButton: {
    width: 44,
    height: 44,
    borderRadius: radius.l,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    fontSize: 24,
    lineHeight: 28,
    color: colors.accent,
    fontWeight: "600",
  },
  dateCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.s,
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  hijriDate: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  todayChip: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: spacing.m,
    borderRadius: radius.m,
  },
  rowCurrent: {
    backgroundColor: colors.accentSoft,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  rowTime: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  rowMuted: {
    color: colors.textSecondary,
    fontWeight: "400",
  },
  rowCurrentText: {
    color: colors.accent,
    fontWeight: "700",
  },
  note: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  footnote: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },
  footnoteLink: {
    color: colors.accent,
    fontWeight: "600",
  },
});
