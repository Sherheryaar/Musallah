import React, { useEffect, useRef } from "react";
import {
  Animated,
  BackHandler,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { usePreventRemove } from "@react-navigation/native";

import Touchable from "./Touchable";
import { useOverlayLock } from "@/context/OverlayContext";
import { useTheme } from "@/context/ThemeContext";
import { scrimColor, spacing } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useSheetAnimation } from "@/lib/useSheetAnimation";

// The one overlay every sheet and dialog in the app is built on.
//
// Deliberately NOT a native <Modal>: React Native's modal host view crashed
// on iOS alongside react-native-screens while the map's bottom sheet was
// being dragged. A plain absolutely-positioned layer renders the same UI
// with no native modal involved — at the cost of having to do by hand what
// Modal gave for free, which is what this component does, once:
//
//   - stays mounted while it animates OUT (useSheetAnimation);
//   - Android back and the iOS two-finger-Z escape close it, not the screen;
//   - the header's back arrow closes it too (usePreventRemove), instead of
//     popping the screen out from under a half-typed suggestion;
//   - the native header, which this layer cannot reach, is dimmed and
//     disarmed by the root layout for as long as it is on screen
//     (useOverlayLock);
//   - VoiceOver/TalkBack are trapped inside it (accessibilityViewIsModal on
//     the BACKDROP, whose siblings are the map, search box and list).

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * Where the card sits, which also decides its entrance: a bottom sheet
   * slides up from its own height; a top card drops 24pt (it autofocuses an
   * input, and a long slide would fight the rising keyboard); a centred
   * dialog rises 12pt.
   */
  anchor: "top" | "bottom" | "center";
  cardStyle: StyleProp<ViewStyle>;
  /** What the scrim announces to a screen reader ("Close filters"). */
  closeLabel: string;
  /** Layer order among overlays — onboarding sits above everything at 80. */
  zIndex: number;
  /** The backdrop's own layout, for callers measuring the space they have. */
  onLayout?: (event: LayoutChangeEvent) => void;
  children: React.ReactNode;
};

export default function OverlaySheet({
  visible,
  onClose,
  anchor,
  cardStyle,
  closeLabel,
  zIndex,
  onLayout,
  children,
}: Props) {
  const { scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const { mounted, progress } = useSheetAnimation(visible, reduceMotion);
  const headerHeight = useHeaderHeight();
  const scrim = scrimColor(scheme);
  // Measured on layout; the fallback is what makes the very FIRST open slide
  // visibly rather than from 0.
  const cardHeight = useRef(420);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  usePreventRemove(visible, onClose);
  // `mounted`, not `visible`: the header strip fades out with the sheet.
  useOverlayLock(mounted, { headerHeight, color: scrim, progress });

  if (!mounted) return null;

  const travel =
    anchor === "bottom" ? cardHeight.current : anchor === "top" ? -24 : 12;

  // Hidden from assistive tech: a big empty target reads as noise in the
  // rotor, and the escape gesture plus the card's own controls cover it.
  const scrimTouch = (
    <Touchable
      style={anchor === "center" ? StyleSheet.absoluteFill : styles.fill}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel={closeLabel}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );

  return (
    <Animated.View
      style={[
        styles.backdrop,
        styles[anchor],
        {
          backgroundColor: scrim,
          opacity: progress,
          zIndex,
          elevation: zIndex,
          // Without this the fading-out scrim keeps eating taps for the
          // whole exit.
          pointerEvents: visible ? "auto" : "none",
        },
      ]}
      onLayout={onLayout}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
    >
      {/* Tree order is layout: below a bottom sheet the scrim is the flexible
          space that pushes the card down; above a top card it fills what is
          left; behind a centred card it is the whole backdrop. */}
      {anchor !== "top" ? scrimTouch : null}
      <Animated.View
        onLayout={(e) => {
          cardHeight.current = e.nativeEvent.layout.height;
        }}
        style={[
          cardStyle,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [travel, 0],
                }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
      {anchor === "top" ? scrimTouch : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  bottom: {
    justifyContent: "flex-end",
  },
  top: {},
  center: {
    justifyContent: "center",
    padding: spacing.l,
  },
  fill: {
    flex: 1,
  },
});
