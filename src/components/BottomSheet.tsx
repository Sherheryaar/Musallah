import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { elevation } from "@/lib/elevation";
import { spacing, type ThemeColors } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Dependency-free bottom sheet: plain Animated + PanResponder, no gesture
// library needed. Three snap points -- peek (mostly hidden, map visible),
// half (default), and full. Drag the handle to move it; the list inside
// keeps its own scrolling because the pan responder only lives on the
// handle area, so the two gestures never fight.

// Vertical room reserved for `aboveSheet` controls (button + breathing room).
const ABOVE_SHEET_HEIGHT = 64;

/**
 * What must stay on screen at the `peek` snap: the drag handle (16pt
 * padding either side of a 5pt bar = 37) plus the times bar (12 + 42 + 12
 * gap + 4 progress track + 1 border ~= 83), plus a little breathing room.
 *
 * This is measured against the sheet's OWN container, not the window --
 * see the onLayout below for why that distinction is the whole bug.
 */
const PEEK_CONTENT_HEIGHT = 128;

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
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, scheme), [colors, scheme]);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // The sheet is absolutely positioned inside the screen's content view,
  // which the native stack lays out BELOW the status bar and header -- so
  // its coordinate space is shorter than the window by
  // `insets.top + headerHeight`, and by a different amount on each
  // platform. Deriving the snaps from useWindowDimensions() therefore put
  // every one of them too low and clipped the times bar at `peek`: ~36pt of
  // usable content on a notched iPhone against ~59dp on a typical Android.
  //
  // Measuring the container is the only reliable fix. (useHeaderHeight()
  // is NOT the answer -- it already includes the status bar, so subtracting
  // both double-counts it and makes things worse.)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const height = measuredHeight ?? windowHeight;

  // Positions measured as "distance from the top of the container".
  const snaps = useMemo(
    () => ({
      full: Math.max(height * 0.08, 56),
      half: height * 0.5,
      // `insets.bottom` is added back because styles.body already pads by
      // it, so without this the peek content loses the home-indicator strip
      // twice. This also keeps the drag handle clear of the system gesture
      // area, so grabbing it never triggers "swipe up to close the app".
      peek: height - (PEEK_CONTENT_HEIGHT + insets.bottom),
    }),
    [height, insets.bottom],
  );
  // Read by the back handler, which must not re-subscribe on every frame.
  const snapsRef = useRef(snaps);
  snapsRef.current = snaps;

  const top = useRef(new Animated.Value(snaps.half)).current;
  const topValue = useRef(snaps.half);

  useEffect(() => {
    const id = top.addListener(({ value }) => {
      topValue.current = value;
    });
    return () => top.removeListener(id);
  }, [top]);

  const springTo = useCallback(
    (target: number, velocity?: number) => {
      if (reduceMotion) {
        // The sheet must still MOVE -- it just stops sweeping there.
        Animated.timing(top, {
          toValue: target,
          duration: 0,
          useNativeDriver: false,
        }).start();
        return;
      }
      Animated.spring(top, {
        toValue: target,
        useNativeDriver: false,
        bounciness: 3,
        // PanResponder reports px/ms and spring configs want units/sec.
        // Without the handoff a fast flick decelerates to a dead stop under
        // the fingertip and then re-accelerates, which reads as a stutter.
        ...(velocity === undefined ? null : { velocity: velocity * 1000 }),
      }).start();
    },
    [top, reduceMotion],
  );

  // Android: collapse before the OS pops the screen. Dragged to `full` the
  // sheet covers the whole map, and home is the root route -- so back there
  // exited the app outright. No Platform guard: BackHandler is a documented
  // no-op on iOS and web, and the app's other two sheets register it
  // unguarded, so branching here would just make the three inconsistent.
  useEffect(() => {
    const onBack = () => {
      const { full, half } = snapsRef.current;
      if (
        Math.abs(topValue.current - full) < Math.abs(topValue.current - half)
      ) {
        springTo(half);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [springTo]);

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
      springTo(target, vy);
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
  }, [snaps, top, springTo]);

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
    // No velocity handoff: this is the accessibility action, with no
    // gesture behind it to inherit momentum from.
    springTo(target);
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
      {/* Measures the sheet's actual coordinate space. Non-interactive and
          invisible; it exists purely so the snap points are computed
          against the container the sheet lives in rather than the window. */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          if (next > 0) setMeasuredHeight(next);
        }}
      />
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
        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
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

const createStyles = (colors: ThemeColors, scheme: "light" | "dark") =>
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
    // canvas, not surface: in dark mode `surface` is DARKER than the map
    // tiles behind it, so the sheet read as a hole rather than a panel.
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // A black shadow is invisible on a dark backdrop, so dark mode gets a
    // hairline instead — that edge is what separates sheet from map there.
    borderTopWidth: 1,
    borderColor: colors.border,
    ...elevation(scheme, "sheet"),
    overflow: "hidden",
  },
  handleArea: {
    alignItems: "center",
    // 16 + 5 + 16 = 37pt, up from 29. Both platforms' guidelines want
    // 44/48 for a drag target; the hitSlop on the view below makes up the
    // rest without spending more of the peek budget.
    paddingVertical: spacing.l,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
  },
  body: {
    flex: 1,
  },
});
