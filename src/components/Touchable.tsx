import React, { useCallback, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { rippleColor } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

// The app's tappable surface.
//
// Replaces TouchableOpacity, which gives every platform the same washed-out
// iOS fade at activeOpacity 0.2 and gives Android no ripple at all — the
// single most "this is an iOS app running on my phone" tell there is.
//
// Structure matters here and is not arbitrary:
//   - the SCALE lives on an outer Animated.View, because an Animated.Value
//     cannot be returned from Pressable's ({pressed}) style callback, and
//     createAnimatedComponent(Pressable) does not accept the callback form;
//   - the caller's `style` lives on the INNER Pressable, so the Android
//     ripple is clipped by the same border radius the caller drew, rather
//     than spilling outside it.

type Props = Omit<PressableProps, "style" | "android_ripple"> & {
  style?: StyleProp<ViewStyle>;
  /**
   * Press scale. The default is right for cards and wide buttons; small
   * icon targets need to go further, since a fixed ratio of a 44pt box is
   * a couple of pixels and reads as nothing.
   */
  scaleTo?: number;
  /** Unbounded ripple, for circular icon buttons. */
  borderless?: boolean;
  /** Ripple radius when `borderless`. Defaults to half a 44pt target. */
  rippleRadius?: number;
  children?: React.ReactNode;
};

export default function Touchable({
  style,
  scaleTo = 0.97,
  borderless = false,
  rippleRadius,
  children,
  disabled,
  ...rest
}: Props) {
  const { scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (toValue: number, pressing: boolean) => {
      if (reduceMotion || disabled) return;
      if (pressing) {
        Animated.timing(scale, {
          toValue,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }).start();
      } else {
        Animated.spring(scale, {
          toValue,
          speed: 20,
          bounciness: 6,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      }
    },
    [scale, reduceMotion, disabled],
  );

  const ripple = useMemo(
    () => ({
      color: rippleColor(scheme),
      borderless,
      ...(borderless ? { radius: rippleRadius ?? 22 } : null),
    }),
    [scheme, borderless, rippleRadius],
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        {...rest}
        disabled={disabled}
        android_ripple={ripple}
        onPressIn={(e) => {
          animate(scaleTo, true);
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          animate(1, false);
          rest.onPressOut?.(e);
        }}
        style={({ pressed }) => [
          style,
          // 0.85, not TouchableOpacity's 0.2 — a press should acknowledge
          // the touch, not blank the control out. Android gets the ripple
          // instead and needs no opacity change.
          pressed && Platform.OS === "ios" ? { opacity: 0.85 } : null,
          disabled ? { opacity: 0.4 } : null,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
