import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "@/components/Touchable";
import { useTheme } from "@/context/ThemeContext";
import { cardEdge, clipRipple } from "@/lib/elevation";
import { MIN_TARGET } from "@/lib/metrics";
import type { SunAlignment } from "@/lib/qibla";
import { createThemedStyles } from "@/lib/themedStyles";
import { hhmm } from "@/lib/time";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

type Props = {
  sun: SunAlignment;
  /** The next instant the sun sits on the qibla line, if there is one. */
  nextCrossing: { at: Date; tomorrow: boolean } | null;
  expanded: boolean;
  onToggle: () => void;
};

/**
 * The sun method: arithmetic beats magnetometers. Collapsed by default, but
 * the screen expands it the moment the compass can't be trusted — that is
 * when it stops being trivia and becomes the only working technique.
 */
export default function SunCard({ sun, nextCrossing, expanded, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Touchable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Check the qibla against the sun"
        style={styles.header}
      >
        <MaterialCommunityIcons name="weather-sunny" size={20} color={colors.attention} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Check it against the sun</Text>
          {/* Collapsed, this line IS the method — the whole instruction has to
              fit here. Expanded, the body repeats it at full weight, so
              showing it twice is just noise. */}
          {expanded ? null : (
            <Text style={styles.summary} numberOfLines={2}>
              {sun.sunUp
                ? sun.instruction
                : nextCrossing
                  ? `Sun sits on the qibla line ${nextCrossing.tomorrow ? "tomorrow " : ""}at ${hhmm(nextCrossing.at)}`
                  : "Available in daylight"}
            </Text>
          )}
        </View>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={colors.textSecondary}
        />
      </Touchable>

      {expanded ? (
        <View style={styles.body}>
          <Text style={styles.bodyText}>
            The sun&apos;s position is calculated, not sensed, so magnets and
            metal can&apos;t fool it.
          </Text>
          {sun.sunUp ? <Text style={styles.instruction}>{sun.instruction}</Text> : null}
          {nextCrossing ? (
            <Text style={styles.bodyText}>
              {`At ${hhmm(nextCrossing.at)} ${nextCrossing.tomorrow ? "tomorrow" : "today"} the sun sits exactly on the qibla line — face your shadow's opposite direction and that is the qibla, to a fraction of a degree.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
    card: {
      width: "100%",
      backgroundColor: colors.canvas,
      borderRadius: radius.xl,
      ...cardEdge(scheme, colors),
      ...clipRipple,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.m,
      padding: spacing.l,
      minHeight: MIN_TARGET,
    },
    headerText: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...type.callout,
      fontWeight: "700",
      color: colors.text,
    },
    summary: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    body: {
      paddingHorizontal: spacing.l,
      paddingBottom: spacing.l,
      gap: spacing.s,
    },
    bodyText: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    instruction: {
      ...type.body,
      fontWeight: "700",
      color: colors.text,
    },
  }),
);
