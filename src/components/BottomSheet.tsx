import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { colors, spacing } from "@/lib/theme";

// Dependency-free bottom sheet: plain Animated + PanResponder, no gesture
// library needed. Three snap points -- peek (mostly hidden, map visible),
// half (default), and full. Drag the handle to move it; the list inside
// keeps its own scrolling because the pan responder only lives on the
// handle area, so the two gestures never fight.

type Props = {
  children: React.ReactNode;
};

export default function BottomSheet({ children }: Props) {
  const { height: windowHeight } = useWindowDimensions();

  // Positions measured as "distance from the top of the screen".
  const snaps = useMemo(
    () => ({
      full: Math.max(windowHeight * 0.08, 56),
      half: windowHeight * 0.5,
      peek: windowHeight - 132,
    }),
    [windowHeight],
  );

  const top = useRef(new Animated.Value(snaps.half)).current;
  const topValue = useRef(snaps.half);

  useEffect(() => {
    const id = top.addListener(({ value }) => {
      topValue.current = value;
    });
    return () => top.removeListener(id);
  }, [top]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          top.setOffset(topValue.current);
          top.setValue(0);
        },
        onPanResponderMove: Animated.event([null, { dy: top }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_e, g) => {
          top.flattenOffset();
          // Project the gesture forward by its velocity, then settle on the
          // nearest snap point -- a quick flick moves a full level even if
          // the finger only travelled a short distance.
          const projected = topValue.current + g.vy * 160;
          const target = [snaps.full, snaps.half, snaps.peek].reduce((a, b) =>
            Math.abs(b - projected) < Math.abs(a - projected) ? b : a,
          );
          Animated.spring(top, {
            toValue: target,
            useNativeDriver: false,
            bounciness: 3,
          }).start();
        },
      }),
    [snaps, top],
  );

  const clampedTop = top.interpolate({
    inputRange: [snaps.full, snaps.peek],
    outputRange: [snaps.full, snaps.peek],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.sheet, { top: clampedTop }]}>
      <View style={styles.handleArea} {...panResponder.panHandlers}>
        <View style={styles.handle} />
      </View>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
