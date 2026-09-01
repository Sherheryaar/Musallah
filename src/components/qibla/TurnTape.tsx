import React, { useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useTheme } from "@/context/ThemeContext";
import { ALIGNED_TOLERANCE_DEG, instrumentSize } from "@/lib/qibla";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type ThemeColors } from "@/lib/theme";

// The rim of a 320px dial travels ~2.8px per degree, so the final few
// degrees — exactly where alignment is decided — are invisible on it. The
// tape shows a ±TAPE_RANGE window at roughly double that resolution, which
// is what makes the last 3° readable.
const TAPE_RANGE = 30;
const TAPE_HEIGHT = 46;
const MAX_TAPE = 360;
const MIN_TAPE = 200;

type Props = {
  /** Width the screen has to offer; clamped like the dial (see instrumentSize). */
  available: number;
  /** Signed turn to the qibla from useCompassHeading. */
  turn: Animated.Value;
  needleColor: string;
};

/** The precision readout under the dial: a linear scale the qibla marker rides. */
export default function TurnTape({ available, turn, needleColor }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const width = instrumentSize(available, MAX_TAPE, MIN_TAPE);
  const pxPerDeg = width / 2 / TAPE_RANGE;
  const shift = useMemo(
    () =>
      turn.interpolate({
        inputRange: [-TAPE_RANGE, TAPE_RANGE],
        outputRange: [-TAPE_RANGE * pxPerDeg, TAPE_RANGE * pxPerDeg],
        extrapolate: "clamp",
      }),
    [turn, pxPerDeg],
  );

  return (
    <View
      style={[styles.tape, { width }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.capture,
          {
            width: ALIGNED_TOLERANCE_DEG * 2 * pxPerDeg,
            left: width / 2 - ALIGNED_TOLERANCE_DEG * pxPerDeg,
          },
        ]}
      />
      {/* Static heading scale: a graduation every 5°. */}
      {Array.from({ length: (TAPE_RANGE * 2) / 5 + 1 }, (_, i) => {
        const deg = -TAPE_RANGE + i * 5;
        const major = deg % 15 === 0;
        return (
          <View
            key={deg}
            style={{
              position: "absolute",
              top: major ? 8 : 12,
              left: width / 2 + deg * pxPerDeg - 0.75,
              width: 1.5,
              height: major ? 12 : 7,
              borderRadius: 1,
              // controlBorder: this tape exists BECAUSE the last few degrees
              // are unreadable on the rim, so its scale is the thing being
              // read; `border` measured 1.26:1 here.
              backgroundColor: colors.controlBorder,
            }}
          />
        );
      })}
      {/* The qibla marker rides the tape and lands on the fixed index. */}
      <Animated.View
        style={[
          styles.marker,
          { left: width / 2 - 8, transform: [{ translateX: shift }] },
        ]}
      >
        <MaterialCommunityIcons name="menu-down" size={22} color={needleColor} />
      </Animated.View>
      <View style={[styles.index, { left: width / 2 - 1 }]} />
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    tape: {
      height: TAPE_HEIGHT,
      overflow: "hidden",
      justifyContent: "center",
      marginTop: spacing.xs,
    },
    capture: {
      position: "absolute",
      top: 4,
      bottom: 4,
      borderRadius: radius.m,
      backgroundColor: colors.accentSoft,
    },
    index: {
      position: "absolute",
      top: 2,
      width: 2,
      height: TAPE_HEIGHT - 4,
      borderRadius: 1,
      backgroundColor: colors.text,
    },
    marker: {
      position: "absolute",
      bottom: 2,
      width: 16,
      alignItems: "center",
    },
  }),
);
