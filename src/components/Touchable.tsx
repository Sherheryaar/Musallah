import React, { useCallback, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
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
//   - the caller's VISUAL styles live on the INNER Pressable, so the
//     Android ripple is clipped by the same border radius the caller drew,
//     rather than spilling outside it;
//   - the caller's LAYOUT styles are hoisted onto the outer wrapper. The
//     parent lays out the wrapper, not the Pressable, so flex, alignSelf
//     and friends are inert on the inner element — `flex: 1` buttons
//     collapse to their label and `flex: 1` scrims collapse to nothing.

/**
 * Style properties that position/size this component WITHIN ITS PARENT.
 * These must live on the wrapper the parent actually lays out. Everything
 * else (colour, padding, border, overflow) stays on the Pressable.
 */
const LAYOUT_KEYS = new Set([
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "display",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginHorizontal",
  "marginVertical",
  "marginStart",
  "marginEnd",
  "position",
  "top",
  "bottom",
  "left",
  "right",
  "start",
  "end",
  "zIndex",
]);

function splitStyle(style: StyleProp<ViewStyle>): {
  layout: ViewStyle | null;
  visual: ViewStyle | null;
} {
  const flat = StyleSheet.flatten(style);
  if (!flat) return { layout: null, visual: null };
  let layout: ViewStyle | null = null;
  let visual: ViewStyle | null = null;
  for (const key of Object.keys(flat) as (keyof ViewStyle)[]) {
    if (LAYOUT_KEYS.has(key)) {
      (layout ??= {})[key] = flat[key] as never;
    } else {
      (visual ??= {})[key] = flat[key] as never;
    }
  }
  return { layout, visual };
}

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

  const { layout, visual } = useMemo(() => splitStyle(style), [style]);

  return (
    <Animated.View style={[layout, { transform: [{ scale }] }]}>
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
          // flexGrow with its default auto basis: in a content-sized wrapper
          // the Pressable keeps its content height, but when the hoisted
          // layout gives the wrapper its size from OUTSIDE (a stretched
          // button, a flex: 1 scrim) the Pressable grows to cover it — a
          // scrim whose tappable area didn't fill the wrapper would be the
          // old bug back under a new name. flex: 1 would be wrong here: its
          // basis of 0 collapses content-sized buttons instead.
          styles.fill,
          visual,
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

const styles = StyleSheet.create({
  fill: {
    flexGrow: 1,
  },
});
