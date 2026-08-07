import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { spacing, type ThemeColors } from "@/lib/theme";

// Dependency-free bottom sheet: plain Animated + PanResponder, no gesture
// library needed. Three snap points -- peek (mostly hidden, map visible),
// half (default), and full. Drag the handle to move it; the list inside
// keeps its own scrolling because the pan responder only lives on the
// handle area, so the two gestures never fight.

// Vertical room reserved for `aboveSheet` controls (button + breathing room).
const ABOVE_SHEET_HEIGHT = 64;

type Props = {
  children: React.ReactNode;
  /**
   * Floating controls pinned just above the sheet's top-right corner (e.g.
   * the "back to my location" map button). They ride the sheet between the
   * half and peek positions; when the sheet is opened full they stay put and
   * the sheet slides over them — there is no visible map to act on then.
   */
  aboveSheet?: React.ReactNode;
};

export default function BottomSheet({ children, aboveSheet }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Positions measured as "distance from the top of the screen".
  const snaps = useMemo(
    () => ({
      full: Math.max(windowHeight * 0.08, 56),
      half: windowHeight * 0.5,
      // Keep the collapsed sheet (and its drag handle) well clear of the
      // system gesture area at the bottom of modern gesture-nav phones, so
      // grabbing the handle never triggers "swipe up to close the app".
      peek: windowHeight - (insets.bottom + 168),
    }),
    [windowHeight, insets.bottom],
  );

  const top = useRef(new Animated.Value(snaps.half)).current;
  const topValue = useRef(snaps.half);

  useEffect(() => {
    const id = top.addListener(({ value }) => {
      topValue.current = value;
    });
    return () => top.removeListener(id);
  }, [top]);

  const panResponder = useMemo(() => {
    // Only the rendered `clampedTop` is clamped -- the raw Animated value can
    // sit far outside the snap range after a hard overdrag. Starting the next
    // drag from that phantom position made the handle feel dead until the
    // finger "caught up", so clamp whenever the raw value is read back.
    const clamp = (value: number) =>
      Math.min(Math.max(value, snaps.full), snaps.peek);
    // Shared by a normal release AND a forced termination (another
    // component/system gesture claiming the touch mid-drag): either way the
    // sheet must flatten its offset and settle on a snap point, not freeze
    // wherever the finger happened to be.
    const settle = (vy: number) => {
      top.flattenOffset();
      // Project the gesture forward by its velocity, then settle on the
      // nearest snap point -- a quick flick moves a full level even if
      // the finger only travelled a short distance.
      const projected = clamp(topValue.current + vy * 160);
      const target = [snaps.full, snaps.half, snaps.peek].reduce((a, b) =>
        Math.abs(b - projected) < Math.abs(a - projected) ? b : a,
      );
      Animated.spring(top, {
        toValue: target,
        useNativeDriver: false,
        bounciness: 3,
      }).start();
    };
    return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          // Stop any in-flight snap spring so the sheet doesn't keep moving
          // underneath the user's finger.
          top.stopAnimation();
          top.setOffset(clamp(topValue.current));
          top.setValue(0);
        },
        onPanResponderMove: Animated.event([null, { dy: top }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_e, g) => settle(g.vy),
        // Once dragging has started, keep the gesture rather than letting a
        // parent/sibling claim it -- a half-finished drag with no snap is a
        // worse outcome than a sheet that "wins" the touch.
        onPanResponderTerminationRequest: () => false,
        // If the OS still forces termination anyway, settle exactly like a
        // release instead of leaving `top` stranded mid-drag until the next
        // gesture happens to fix it.
        onPanResponderTerminate: (_e, g) => settle(g.vy),
      });
  }, [snaps, top]);

  const clampedTop = top.interpolate({
    inputRange: [snaps.full, snaps.peek],
    outputRange: [snaps.full, snaps.peek],
    extrapolate: "clamp",
  });

  // Screen-reader path: the drag gesture is invisible to VoiceOver/TalkBack,
  // so the handle is an adjustable that steps through the snap points.
  const snapToNeighbour = (direction: 1 | -1) => {
    // Ordered from most open to least (top value increases downwards).
    const order = [snaps.full, snaps.half, snaps.peek];
    const current = order.reduce((a, b) =>
      Math.abs(b - topValue.current) < Math.abs(a - topValue.current) ? b : a,
    );
    const target =
      order[
        Math.min(Math.max(order.indexOf(current) - direction, 0), order.length - 1)
      ];
    Animated.spring(top, {
      toValue: target,
      useNativeDriver: false,
      bounciness: 3,
    }).start();
  };

  // Rides the sheet's top edge, but never above the half position: past
  // that the sheet (rendered later, higher elevation) covers it, which both
  // hides it and blocks its touches while the map is hidden anyway.
  const aboveSheetTop = top.interpolate({
    inputRange: [snaps.half, snaps.peek],
    outputRange: [
      snaps.half - ABOVE_SHEET_HEIGHT,
      snaps.peek - ABOVE_SHEET_HEIGHT,
    ],
    extrapolate: "clamp",
  });

  return (
    <>
      {aboveSheet ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.aboveSheet, { top: aboveSheetTop }]}
        >
          {aboveSheet}
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.sheet, { top: clampedTop }]}>
      <View
        style={styles.handleArea}
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Places list"
        accessibilityHint="Swipe up or down with one finger to resize the list"
        accessibilityActions={[
          { name: "increment", label: "Expand" },
          { name: "decrement", label: "Collapse" },
        ]}
        onAccessibilityAction={(event) => {
          snapToNeighbour(event.nativeEvent.actionName === "increment" ? 1 : -1);
        }}
      >
        <View style={styles.handle} />
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {children}
      </View>
      </Animated.View>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  aboveSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ABOVE_SHEET_HEIGHT,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingRight: spacing.l,
    paddingBottom: spacing.m,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Soft lift so the sheet reads as floating above the map.
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
    overflow: "hidden",
  },
  handleArea: {
    alignItems: "center",
    paddingVertical: spacing.m,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  body: {
    flex: 1,
  },
});
