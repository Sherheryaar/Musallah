import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import OverlaySheet from "@/components/OverlaySheet";
import Touchable from "@/components/Touchable";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { formatCountdown, isoDate } from "@/lib/time";
import { getPrayerStatus } from "@/lib/prayerStatus";
import { cardEdge, clipRipple } from "@/lib/elevation";
import { FALLBACK_LOCATION } from "@/lib/geo";
import { formatHijri } from "@/lib/hijri";
import { MIN_TARGET } from "@/lib/metrics";
import { computePrayerSchedule, PrayerScheduleEntry } from "@/lib/prayerTimes";
import { createThemedStyles } from "@/lib/themedStyles";
import { numeric, radius, spacing, type, type ThemeColors } from "@/lib/theme";
import { hapticSelection } from "@/lib/haptics";
import { useDeviceLocation } from "@/lib/useDeviceLocation";
import { useMinuteTick } from "@/lib/useMinuteTick";

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days from `now`'s date to `target`'s date, ignoring time of day. */
function offsetFromToday(target: Date, now: Date): number {
  return Math.round(
    (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
}

function SunTrajectoryArc({
  schedule,
  now,
  colors,
  styles,
}: {
  schedule: PrayerScheduleEntry[];
  now: Date;
  colors: ThemeColors;
  styles: ReturnType<typeof useStyles>;
}) {
  const byKey = new Map(schedule.map((s) => [s.key, s]));
  const sunrise = byKey.get("sunrise")?.time;
  const dhuhr = byKey.get("dhuhr")?.time;
  const maghrib = byKey.get("maghrib")?.time;

  if (!sunrise || !dhuhr || !maghrib) return null;

  const nowMs = now.getTime();
  const srMs = sunrise.getTime();
  const mgMs = maghrib.getTime();
  const isDaylight = nowMs >= srMs && nowMs <= mgMs;
  const progress = Math.min(Math.max((nowMs - srMs) / (mgMs - srMs), 0), 1);

  const t = isDaylight ? progress : 0;
  const p0x = 28, p0y = 58;
  const p1x = 150, p1y = 8;
  const p2x = 272, p2y = 58;

  const sunX = (1 - t) * (1 - t) * p0x + 2 * (1 - t) * t * p1x + t * t * p2x;
  const sunY = (1 - t) * (1 - t) * p0y + 2 * (1 - t) * t * p1y + t * t * p2y;

  return (
    <View style={styles.arcContainer}>
      <Svg width="100%" height={74} viewBox="0 0 300 74">
        <Path
          d="M 16 58 L 284 58"
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        <Path
          d={`M ${p0x} ${p0y} Q ${p1x} ${p1y} ${p2x} ${p2y}`}
          fill="none"
          stroke={isDaylight ? colors.attention : colors.controlBorder}
          strokeWidth={2}
          strokeDasharray={isDaylight ? undefined : "4,4"}
        />
        {/* Sunrise, Dhuhr solar noon apex at (150, 33), Sunset */}
        <Circle cx={p0x} cy={p0y} r={3} fill={colors.controlBorder} />
        <Circle cx={150} cy={33} r={3} fill={colors.controlBorder} />
        <Circle cx={p2x} cy={p2y} r={3} fill={colors.controlBorder} />

        {isDaylight ? (
          <>
            <Circle
              cx={sunX}
              cy={sunY}
              r={10}
              fill={colors.attention}
              opacity={0.22}
            />
            <Circle cx={sunX} cy={sunY} r={5} fill={colors.attention} />
          </>
        ) : null}
      </Svg>

      <View style={styles.arcLabels}>
        <View style={styles.arcLabelItem}>
          <MaterialCommunityIcons
            name="weather-sunset-up"
            size={13}
            color={colors.textSecondary}
          />
          <Text style={[styles.arcLabelText, { color: colors.textSecondary }]}>
            {byKey.get("sunrise")?.display}
          </Text>
        </View>
        <View style={styles.arcLabelItem}>
          <MaterialCommunityIcons
            name="weather-sunny"
            size={13}
            color={isDaylight ? colors.attention : colors.textSecondary}
          />
          <Text
            style={[
              styles.arcLabelText,
              { color: isDaylight ? colors.attention : colors.textSecondary },
            ]}
          >
            {byKey.get("dhuhr")?.display}
          </Text>
        </View>
        <View style={styles.arcLabelItem}>
          <MaterialCommunityIcons
            name="weather-sunset-down"
            size={13}
            color={colors.textSecondary}
          />
          <Text style={[styles.arcLabelText, { color: colors.textSecondary }]}>
            {byKey.get("maghrib")?.display}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Monday-start weekday header, UK convention. */
const CAL_WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * A themed month-grid date picker. Deliberately NOT the platform picker:
 * @react-native-community/datetimepicker is a native module, so adding it
 * means a new dev build on both platforms, and it renders a spinner on iOS
 * and a Material dialog on Android — two different surfaces for the same
 * task. This is ~100 lines of plain views, looks like the rest of the app
 * on both platforms, and today-as-the-floor is enforced in one place.
 */
function CalendarSheet({
  visible,
  now,
  selectedDate,
  onSelect,
  onClose,
  colors,
  styles,
}: {
  visible: boolean;
  now: Date;
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof useStyles>;
}) {
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  // Re-open on the month of whatever is currently selected, not wherever
  // the user last browsed to.
  useEffect(() => {
    if (visible) {
      setViewMonth(
        new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
      );
    }
    // selectedDate is deliberately not a dep: it changes on selection, and
    // the sheet has already closed by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const today = startOfDay(now);
  const atCurrentMonth =
    viewMonth.getFullYear() === today.getFullYear() &&
    viewMonth.getMonth() === today.getMonth();

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-start: JS getDay() is Sunday-0.
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

  const cells: Array<Date | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(year, month, i + 1),
    ),
  ];

  const selectedDayMs = startOfDay(selectedDate).getTime();

  return (
    <OverlaySheet
      visible={visible}
      onClose={onClose}
      anchor="center"
      zIndex={30}
      closeLabel="Close calendar"
      cardStyle={styles.calCard}
    >
      <View style={styles.calHeader}>
        <Touchable
          style={styles.chevronButton}
          onPress={() => setViewMonth(new Date(year, month - 1, 1))}
          disabled={atCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: atCurrentMonth }}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={atCurrentMonth ? colors.controlBorder : colors.accent}
          />
        </Touchable>
        <Text style={styles.calMonthTitle}>
          {MONTHS[month]} {year}
        </Text>
        <Touchable
          style={styles.chevronButton}
          onPress={() => setViewMonth(new Date(year, month + 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={colors.accent}
          />
        </Touchable>
      </View>

      <View style={styles.calGrid}>
        {CAL_WEEKDAYS.map((d, i) => (
          <View key={`h${i}`} style={styles.calCell}>
            <Text style={styles.calWeekday}>{d}</Text>
          </View>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={`b${i}`} style={styles.calCell} />;
          const ms = date.getTime();
          const isPast = ms < today.getTime();
          const isToday = ms === today.getTime();
          const isSelected = ms === selectedDayMs;
          return (
            <View key={ms} style={styles.calCell}>
              <Touchable
                style={[
                  styles.calDay,
                  isToday && !isSelected && styles.calDayToday,
                  isSelected && styles.calDaySelected,
                ]}
                disabled={isPast}
                onPress={() => onSelect(date)}
                accessibilityRole="button"
                accessibilityLabel={`${WEEKDAYS[date.getDay()]} ${ordinal(
                  date.getDate(),
                )} ${MONTHS[date.getMonth()]}`}
                accessibilityState={{
                  disabled: isPast,
                  selected: isSelected,
                }}
              >
                <Text
                  style={[
                    styles.calDayText,
                    isPast && styles.calDayTextPast,
                    isSelected && styles.calDayTextSelected,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </Touchable>
            </View>
          );
        })}
      </View>
    </OverlaySheet>
  );
}

export default function PrayerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  // The app draws edge-to-edge on Android, so the last thing on this screen
  // would otherwise sit under the gesture/navigation bar.
  const insets = useSafeAreaInsets();
  const { settings, calcOptions } = useSettings();
  const [dayOffset, setDayOffset] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const now = useMinuteTick();

  // Silent: the home screen owns the permission prompt, so this never asks.
  // It uses the existing fix when there is one and, when there isn't, says
  // so rather than showing central-London times as if they were the user's.
  const { coords, usingFallback } = useDeviceLocation({ prompt: false });
  const location = coords ?? FALLBACK_LOCATION;

  // Midnight today, keyed on the calendar DATE: the selected day and the pill
  // strip change at midnight, not every minute.
  const dayKey = isoDate(now);
  const today = useMemo(
    () => startOfDay(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey],
  );
  const selectedDate = useMemo(
    () => addDays(today, dayOffset),
    [today, dayOffset],
  );

  const dayPills = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i);
        return {
          offset: i,
          label:
            i === 0 ? "Today" : `${SHORT_WEEKDAYS[d.getDay()]} ${d.getDate()}`,
        };
      }),
    [today],
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
    return getPrayerStatus(today, tomorrowFajr, now);
  }, [schedule, dayOffset, location, calcOptions, now]);

  // Only highlight a row when we are actually looking at today — and only
  // when a prayer is genuinely in progress. Between sunrise and Dhuhr
  // currentKey is null, so nothing lights up.
  const highlightKey = dayOffset === 0 && status ? status.currentKey : null;

  /** Today is the floor. A prayer time that has already passed is not
      information anyone needs — the screen is for "when do I pray next",
      and the only useful direction from today is forwards. Forwards is
      UNBOUNDED: the pills are a shortcut for the common next-few-days case,
      not a limit — the chevrons and the calendar reach any future date. */
  const atToday = dayOffset === 0;
  /** The selected date sits beyond the pill strip's 7-day window. */
  const beyondPills = dayOffset > 6;

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
            {status.nowLabel}
          </Text>
          <Text style={styles.heroTitle}>
            {`${status.nextLabel} in ${formatCountdown(status.msUntilNext)}`}
          </Text>
        </LinearGradient>
      ) : null}

      {/* Quick day selector: a calendar chip for ANY future date, then
          pills for the next 7 days — the common case, one tap away. When a
          calendar-picked date is beyond the pills, the chip itself becomes
          the active pill and names the date, so the selection is never
          invisible. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayPillStrip}
        style={styles.dayPillScroll}
      >
        <Touchable
          style={[
            styles.dayPill,
            styles.calendarChip,
            beyondPills && styles.dayPillActive,
          ]}
          onPress={() => {
            hapticSelection(settings.hapticFeedback);
            setShowCalendar(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Choose a date from the calendar"
        >
          <MaterialCommunityIcons
            name="calendar-month-outline"
            size={16}
            color={beyondPills ? colors.accent : colors.textSecondary}
          />
          {beyondPills ? (
            <Text style={[styles.dayPillLabel, styles.dayPillLabelActive]}>
              {`${SHORT_WEEKDAYS[selectedDate.getDay()]} ${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()].slice(0, 3)}`}
            </Text>
          ) : null}
        </Touchable>
        {dayPills.map(({ offset, label }) => {
          const active = dayOffset === offset;
          return (
            <Touchable
              key={offset}
              style={[styles.dayPill, active && styles.dayPillActive]}
              onPress={() => {
                hapticSelection(settings.hapticFeedback);
                setDayOffset(offset);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text
                style={[
                  styles.dayPillLabel,
                  active && styles.dayPillLabelActive,
                ]}
              >
                {label}
              </Text>
            </Touchable>
          );
        })}
      </ScrollView>

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
          {/* Vector icons, not text glyphs: every other piece of chrome in the
              app is from this one icon set, and a font glyph renders at a
              different weight and baseline on each platform. */}
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

      <CalendarSheet
        visible={showCalendar}
        now={now}
        selectedDate={selectedDate}
        onSelect={(date) => {
          hapticSelection(settings.hapticFeedback);
          setDayOffset(offsetFromToday(date, now));
          setShowCalendar(false);
        }}
        onClose={() => setShowCalendar(false)}
        colors={colors}
        styles={styles}
      />

      {schedule ? (
        <View style={styles.card}>
          {dayOffset === 0 ? (
            <SunTrajectoryArc
              schedule={schedule}
              now={now}
              colors={colors}
              styles={styles}
            />
          ) : null}
          {schedule.map((entry) => {
            const isCurrent = entry.key === highlightKey;
            const isUpcoming = dayOffset === 0 && entry.key === status?.nextKey;
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
                <View style={styles.rowRight}>
                  {isUpcoming && status ? (
                    <Text style={styles.rowCountdown}>
                      in {formatCountdown(status.msUntilNext)}
                    </Text>
                  ) : null}
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
        {`Calculated on this device \u00B7 ${methodLabel} \u00B7 Asr at ${mithlLabel}.`}
      </Text>
      {/* Its own row, not a Link inside the footnote: an inline text link is
          a ~12pt target and cannot be hit-slopped. */}
      <Touchable
        style={styles.footnoteLink}
        onPress={() => router.push("/settings")}
        accessibilityRole="link"
        accessibilityLabel="Change calculation settings"
      >
        <Text style={styles.footnoteLinkText}>Change in Settings</Text>
      </Touchable>
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
  dayPillScroll: {
    marginHorizontal: -spacing.l,
    flexGrow: 0,
  },
  dayPillStrip: {
    // The negative margin on dayPillScroll IS right here: this screen's
    // `content` really does pad by spacing.l, so the strip bleeds to the
    // edges and this brings the first pill back into line.
    paddingHorizontal: spacing.l,
    // But the pills carry cardEdge's Android elevation, whose shadow draws
    // outside the view box, and a ScrollView clips its children — so the
    // date bubbles were being cut off flat top and bottom. This is the room
    // that shadow needs.
    paddingVertical: spacing.s,
    gap: spacing.s,
    flexDirection: "row",
    alignItems: "center",
  },
  dayPill: {
    paddingHorizontal: spacing.m,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    ...cardEdge(scheme, colors),
  },
  dayPillActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  dayPillLabel: {
    ...type.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    ...numeric,
  },
  dayPillLabelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  calendarChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    // The icon-only resting state is narrower than a text pill; keep the
    // tap target honest.
    minWidth: 44,
    justifyContent: "center",
  },
  calCard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    ...cardEdge(scheme, colors),
    padding: spacing.l,
    gap: spacing.s,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calMonthTitle: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  // 7 columns; the cell is the layout slot, the day inside it the target.
  calCell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  calWeekday: {
    ...type.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  calDay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    ...clipRipple,
  },
  calDayToday: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  calDaySelected: {
    backgroundColor: colors.accent,
  },
  calDayText: {
    ...type.subhead,
    fontWeight: "600",
    color: colors.text,
    ...numeric,
  },
  calDayTextPast: {
    color: colors.controlBorder,
    fontWeight: "400",
  },
  calDayTextSelected: {
    // On the solid accent circle: canvas is near-black in dark mode and
    // white in light, which is the contrast pairing the theme already uses
    // for accent-filled controls.
    color: colors.canvas,
    fontWeight: "700",
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
    ...clipRipple,
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
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
  },
  rowCountdown: {
    ...type.caption,
    fontWeight: "700",
    color: colors.accent,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
    ...numeric,
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
      alignSelf: "center",
      minHeight: MIN_TARGET,
      justifyContent: "center",
      paddingHorizontal: spacing.m,
      // Pulls the row back up under the footnote so the two still read as
      // one group despite the content gap.
      marginTop: -spacing.m,
    },
    footnoteLinkText: {
      ...type.caption,
      fontWeight: "600",
      color: colors.accent,
    },
    arcContainer: {
      alignItems: "center",
      paddingTop: spacing.xs,
      paddingBottom: spacing.s,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: spacing.xs,
    },
    arcLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
      paddingHorizontal: spacing.l,
      marginTop: -spacing.xs,
    },
    arcLabelItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    arcLabelText: {
      ...type.caption,
      fontWeight: "600",
      ...numeric,
    },
  }),
);
