import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "@/components/Touchable";
import { useTheme } from "@/context/ThemeContext";
import { CalcOptions, computePrayerSchedule } from "@/lib/prayerTimes";
import { createThemedStyles } from "@/lib/themedStyles";
import { formatCountdown } from "@/lib/time";
import { numeric, spacing, type, type ThemeColors } from "@/lib/theme";
import { useMinuteTick } from "@/lib/useMinuteTick";

/**
 * The times bar answers the question people actually have — "when is the
 * next prayer?" — with the following ones small beside it and a progress
 * line through the current window. Self-contained and memoized so its
 * minute tick re-renders THIS bar, not the map and list.
 */
const NextPrayerBar = React.memo(function NextPrayerBar({
  lat,
  lng,
  options,
  onPress,
}: {
  lat: number;
  lng: number;
  options: CalcOptions;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const now = useMinuteTick().getTime();

  const info = useMemo(() => {
    // Sunrise isn't a prayer; yesterday/tomorrow bracket the edges (before
    // Fajr the "current window" started at yesterday's Isha; after Isha
    // the next prayer is tomorrow's Fajr).
    const prayersOf = (d: Date) =>
      (computePrayerSchedule(lat, lng, options, d) ?? []).filter(
        (e) => e.key !== "sunrise",
      );
    const all = [
      ...prayersOf(new Date(now - 86_400_000)),
      ...prayersOf(new Date(now)),
      ...prayersOf(new Date(now + 86_400_000)),
    ];
    const idx = all.findIndex((e) => e.time.getTime() > now);
    if (idx < 0) return null; // polar conditions
    const next = all[idx];
    const prev = idx > 0 ? all[idx - 1] : null;
    const msUntilNext = next.time.getTime() - now;
    const progress = prev
      ? Math.min(
          1,
          Math.max(
            0,
            (now - prev.time.getTime()) /
              (next.time.getTime() - prev.time.getTime()),
          ),
        )
      : 0;
    return {
      next,
      upcoming: all.slice(idx + 1, idx + 3),
      msUntilNext,
      progress,
    };
  }, [lat, lng, options, now]);

  if (!info) return null;

  const countdown = formatCountdown(info.msUntilNext);

  return (
    <Touchable
      style={styles.timesBar}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next prayer: ${info.next.label} at ${info.next.display}, in ${countdown}. Open prayer times.`}
    >
      <View style={styles.timesTopRow}>
        <View style={styles.nextBlock}>
          {/* Two lines and a capped multiplier: this row sits inside the
              sheet's `overflow: hidden`, so anything it cannot fit is not
              scrolled — it is cut off. Wrapping here is what keeps the
              chevron and the upcoming times whole at large font scales. */}
          <Text
            style={styles.nextLabel}
            numberOfLines={2}
            maxFontSizeMultiplier={1.5}
          >
            Next {"·"} {info.next.label} in {countdown}
          </Text>
          <Text style={styles.nextTime}>{info.next.display}</Text>
        </View>
        <View style={styles.upcomingRow}>
          {info.upcoming.map((e) => (
            <View key={`${e.key}-${e.time.getTime()}`} style={styles.timeItem}>
              <Text style={styles.timeLabel}>{e.label}</Text>
              <Text style={styles.timeValue}>{e.display}</Text>
            </View>
          ))}
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.textSecondary}
          />
        </View>
      </View>
      <View style={styles.progressTrack}>
        {/* scaleX rather than a percentage width: width is a LAYOUT prop,
            so every tick re-laid-out the fill inside its clipping track.
            A transform costs nothing and is the same pixels. */}
        <View
          style={[styles.progressFill, { transform: [{ scaleX: info.progress }] }]}
        />
      </View>
    </Touchable>
  );
});

export default NextPrayerBar;

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    timesBar: {
      flexShrink: 0,
      backgroundColor: colors.canvas,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.l,
      paddingTop: spacing.m,
      paddingBottom: spacing.m,
      gap: spacing.m,
    },
    timesTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.l,
    },
    // The block that gives up width when the row runs out of it (Yoga's
    // default flexShrink is 0, so without this the row simply overflows). The
    // headline time still lays out at its full size; only the label wraps.
    nextBlock: {
      flexShrink: 1,
      gap: 2,
    },
    nextLabel: {
      ...type.caption,
      fontWeight: "600",
      color: colors.textSecondary,
      ...numeric,
    },
    // The headline of the whole sheet: the next prayer's time, in the brand
    // green at title weight. This is the number people open the app for.
    nextTime: {
      ...type.title2,
      fontWeight: "800",
      color: colors.accent,
      ...numeric,
    },
    upcomingRow: {
      flexDirection: "row",
      alignItems: "center",
      // Never squeezed: the chevron at its end is the only thing saying the
      // whole bar is tappable, and a half-cropped "21:1" is worse than no time.
      flexShrink: 0,
      gap: spacing.l,
    },
    timeItem: {
      alignItems: "center",
      gap: 2,
    },
    timeLabel: {
      ...type.caption,
      color: colors.textSecondary,
    },
    timeValue: {
      ...type.subhead,
      fontWeight: "600",
      color: colors.text,
      ...numeric,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceSecondary,
      overflow: "hidden",
    },
    progressFill: {
      height: 6,
      width: "100%",
      backgroundColor: colors.accent,
      // Grow from the left edge, not the centre. The ARRAY form with all
      // three values [x, y, z] — two crashes the renderer.
      transformOrigin: ["0%", "50%", 0],
      // No borderRadius: scaling X squashes it to a sub-pixel smear at low
      // progress. The track's own radius + overflow does the rounding.
    },
  }),
);
