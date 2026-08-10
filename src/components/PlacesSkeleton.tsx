import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type ThemeColors } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Placeholder rows for the first load.
//
// The dataset is live-only by design (never bundled, never cached to disk),
// so EVERY cold launch has a window with no places in memory. Before this
// existed the list fell through to its empty state and told the user "No
// places match -- or this is a gap in the data worth fixing", offering to
// submit the entire country as a missing place. This says "loading"
// instead, which is what was actually happening.
//
// Geometry mirrors PlaceCard exactly so nothing shifts when real rows
// replace these.

const ROW_COUNT = 5;
/** Widths of the three text bars, as a fraction of the row body. */
const BARS = ["70%", "45%", "32%"] as const;

export default function PlacesSkeleton() {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  // ONE loop for every row. Opacity is native-drivable, so the pulse costs
  // nothing on the JS thread -- but five independent loops would still be
  // five nodes and five sets of callbacks for one visual effect.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.5);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: 750,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.9],
  });

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading nearby places"
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: ROW_COUNT }, (_, row) => (
        <View key={row} style={styles.card}>
          <Animated.View style={[styles.tile, { opacity }]} />
          <View style={styles.body}>
            {BARS.map((width, i) => (
              <Animated.View
                key={width}
                style={[
                  styles.bar,
                  // The last bar stands in for the facility icon strip,
                  // which PlaceCard omits when a place has no facilities.
                  i === BARS.length - 1 && styles.barShort,
                  { width, opacity },
                ]}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.m,
    },
    // Mirrors PlaceCard.styles.card so the swap to real rows is silent.
    card: {
      flexDirection: "row",
      gap: spacing.m,
      backgroundColor: colors.canvas,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.l,
    },
    tile: {
      width: 42,
      height: 42,
      borderRadius: radius.l,
      backgroundColor: colors.surfaceSecondary,
      flexShrink: 0,
    },
    body: {
      flex: 1,
      gap: spacing.s,
      justifyContent: "center",
    },
    bar: {
      height: 12,
      borderRadius: radius.m / 2,
      backgroundColor: colors.surfaceSecondary,
    },
    barShort: {
      height: 10,
    },
  }),
);
