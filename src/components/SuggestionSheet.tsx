import React, { useEffect, useMemo, useState } from "react";
import {
  Animated,
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "./Touchable";
import SuggestionForm from "@/components/SuggestionForm";
import { type SubmissionResult } from "@/lib/feedback";
import { useKeyboardHeight } from "@/lib/useKeyboardHeight";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useSheetAnimation } from "@/lib/useSheetAnimation";
import { useTheme } from "@/context/ThemeContext";
import { elevation } from "@/lib/elevation";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

type Props = {
  visible: boolean;
  title: string;
  placeholder: string;
  topics?: string[];
  onSend: (message: string) => Promise<SubmissionResult>;
  onClose: () => void;
};

/**
 * Hosts SuggestionForm in a TOP-ANCHORED overlay. The forms used to sit
 * inline mid-scroll, where the keyboard covered the input on both platforms;
 * pinning the card to the top of the screen means the keyboard (which owns
 * the bottom half) physically cannot overlap what you're typing.
 *
 * Like FilterSheet, this is deliberately NOT a native <Modal>: RN's modal
 * host view crashed on iOS combined with react-native-screens while the map
 * bottom sheet was being dragged. A plain absolutely-positioned overlay
 * renders the same UI with no native modal involved.
 */
export default function SuggestionSheet({
  visible,
  title,
  placeholder,
  topics,
  onSend,
  onClose,
}: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, scheme), [colors, scheme]);
  const keyboardHeight = useKeyboardHeight();
  const reduceMotion = useReducedMotion();
  const { mounted, progress } = useSheetAnimation(visible, reduceMotion);
  // Measured rather than derived: the card must fit the space between the
  // top of this overlay and the top of the keyboard, and the overlay's own
  // height is the only honest source for that.
  const [containerHeight, setContainerHeight] = useState(0);

  // Was `Math.max(insets.top, spacing.l)`, which double-counted the status
  // bar: this overlay is an absolute fill INSIDE a view the native stack has
  // already laid out below the header, so insets.top had been applied once
  // already and the card sat a status bar's height too low.
  const cardMaxHeight =
    containerHeight > 0
      ? Math.max(220, containerHeight - keyboardHeight - spacing.l * 2)
      : 420;

  // Android hardware/gesture back closes the sheet instead of the screen.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!mounted) return null;

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Animated.View
      style={[
        styles.backdrop,
        { opacity: progress },
        // In `style`, not as a prop: the prop form is deprecated on
        // react-native-web. Stops the fading-out scrim eating taps.
        { pointerEvents: visible ? "auto" : "none" },
      ]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
      // See FilterSheet: this traps VoiceOver inside the overlay, and
      // onAccessibilityEscape is the iOS twin of the BackHandler above.
      accessibilityViewIsModal
      onAccessibilityEscape={close}
    >
      {/* Backdrop tap only dismisses BELOW the card — a stray tap while the
          keyboard is up must not eat a half-typed suggestion, so the card
          itself and the strip above it are inert. */}
      {/* A short drop, not a full card-height slide: this sheet is
          top-anchored and autofocuses its input, so the keyboard rises at
          the same moment and a long slide fights it. */}
      <Animated.View
        style={[
          styles.card,
          { maxHeight: cardMaxHeight },
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-24, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Touchable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons
              name="close"
              size={20}
              color={colors.textSecondary}
            />
          </Touchable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <SuggestionForm
            placeholder={placeholder}
            topics={topics}
            autoFocus
            onSend={onSend}
          />
        </ScrollView>
      </Animated.View>
      <Touchable
        style={styles.backdropTouch}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close suggestion form"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors, scheme: "light" | "dark") =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
      zIndex: 20,
      elevation: 20,
    },
    backdropTouch: {
      flex: 1,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.l,
      gap: spacing.m,
      marginTop: spacing.l,
      // maxHeight is supplied at runtime from the measured overlay minus the
      // keyboard; the inner ScrollView takes over if content overflows.
      width: "94%",
      maxWidth: 680,
      alignSelf: "center",
      // Android draws NO shadow from the shadow* props — without the
      // elevation half of this token the card was the one perfectly flat
      // surface in the app.
      ...elevation(scheme, "floating"),
    },
    scrollContent: {
      paddingBottom: spacing.xs,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.m,
    },
    title: {
      ...type.title5,
      fontWeight: "700",
      color: colors.text,
    },
  });
