import React, { useEffect, useMemo, useState } from "react";
import {
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Touchable from "@/components/Touchable";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { cardEdge } from "@/lib/elevation";
import { FALLBACK_LOCATION } from "@/lib/geo";
import { formatHijri } from "@/lib/hijri";
import { computePrayerSchedule, PrayerScheduleEntry } from "@/lib/prayerTimes";
import { createThemedStyles } from "@/lib/themedStyles";
import { numeric, radius, spacing, type, type ThemeColors } from "@/lib/theme";

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

export default function PrayerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  // The app draws edge-to-edge on Android, so the last thing on this screen —
  // the "Change in Settings" link — sat under the gesture/navigation bar.
  // index, settings and place/[id] all pad by this; these two screens were
  // simply missed.
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [location, setLocation] = useState(FALLBACK_LOCATION);
  const [usingFallback, setUsingFallback] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Tick on each minute BOUNDARY so the countdown stays honest, and
  // resync on foreground: a fixed interval is frozen while the app is
  // backgrounded, so this screen's countdown was silently stale — often by
  // hours — for anyone returning to an already-open prayer screen.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const schedule = () =>
      setTimeout(() => {
        setNow(new Date());
        id = schedule();
      }, 60_000 - (Date.now() % 60_000));
    id = schedule();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
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

  /** Today is the earliest day this screen shows — see the date nav below. */
  const atToday = dayOffset === 0;

  const dateTitle = `${WEEKDAYS[selectedDate.getDay()]} ${ordinal(
    selectedDate.getDate(),
  )} ${MONTHS[selectedDate.getMonth()]}`;

  const methodLabel =
    settings.method === "mwl" ? "Muslim World League" : "Moonsighting Committee";
  const mithlLabel = settings.madhab === "hanafi" ? "2 mithl" : "1 mithl";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
    >
      {status ? (
        <LinearGradient
          colors={[colors.heroGradientStart, colors.heroGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroKicker}>
            {`Now \u00B7 ${status.currentLabel}`}
          </Text>
          <Text style={styles.heroTitle}>
            {`${status.nextLabel} in ${formatCountdown(status.msUntilNext)}`}
          </Text>
        </LinearGradient>
      ) : null}

      <View style={styles.dateNav}>
        {/* Today is the floor. A prayer time that has already passed is not
            information anyone needs — the screen is for "when do I pray next",
            and the only useful direction from today is forwards. Disabled
            rather than hidden: the control keeps its place in the row, so the
            date stays centred and nothing shifts when you step forward and the
            button becomes live. */}
        <Touchable
          style={styles.chevronButton}
          onPress={() => setDayOffset((o) => Math.max(0, o - 1))}
          disabled={atToday}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          accessibilityState={{ disabled: atToday }}
        >
          {/* MaterialCommunityIcons, not the \u2039 and \u203a text glyphs these were:
              every other piece of chrome in the app is from this one icon set,
              and a font glyph renders at a different weight and baseline on
              each platform \u2014 exactly the drift _layout.tsx already removed
              when it dropped \ud83e\udded and \u2699\ufe0f for vector icons. */}
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color={colors.accent}
          />
        </Touchable>
        <View style={styles.dateCenter}>
          <Text style={styles.dateTitle}>{dateTitle}</Text>
          <Text style={styles.hijriDate}>{formatHijri(selectedDate)}</Text>
          {dayOffset !== 0 ? (
            <Touchable
              onPress={() => setDayOffset(0)}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
              // A 12pt label is a ~15pt target. hitSlop rather than
              // minHeight: the height belongs to the row it sits in.
              hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
            >
              <Text style={styles.todayChip}>Back to today</Text>
            </Touchable>
          ) : null}
        </View>
        <Touchable
          style={styles.chevronButton}
          onPress={() => setDayOffset((o) => o + 1)}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={26}
            color={colors.accent}
          />
        </Touchable>
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

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
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
  // The brand-gradient hero: the countdown is the screen's focal point and
  // now looks like it. White clears AA on both stops (theme.test.ts).
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.s - 2,
    // Clips the gradient to the rounded corners on Android.
    overflow: "hidden",
  },
  heroKicker: {
    ...type.eyebrow,
    color: "#FFFFFF",
  },
  heroTitle: {
    ...type.title1,
    fontWeight: "800",
    color: "#FFFFFF",
    ...numeric,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevronButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.canvas,
    ...cardEdge(scheme, colors),
    alignItems: "center",
    justifyContent: "center",
    // Android only: clips the ripple to the circle. iOS must not clip, or
    // masksToBounds erases the shadow.
    ...Platform.select({ android: { overflow: "hidden" as const } }),
  },
  dateCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.s,
  },
  dateTitle: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  hijriDate: {
    ...type.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  todayChip: {
    marginTop: 2,
    ...type.caption,
    fontWeight: "700",
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    ...cardEdge(scheme, colors),
    padding: spacing.s,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: spacing.m,
    borderRadius: radius.l,
  },
  rowCurrent: {
    backgroundColor: colors.accentSoft,
  },
  rowLabel: {
    ...type.body,
    fontWeight: "600",
    color: colors.text,
  },
  rowTime: {
    ...type.body,
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
    ...type.subhead,
    color: colors.textSecondary,
    textAlign: "center",
  },
  footnote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  footnoteLink: {
    color: colors.accent,
    fontWeight: "600",
  },
}),
);
