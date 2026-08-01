import React, { useEffect, useMemo } from "react";
import {
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SuggestionForm from "@/components/SuggestionForm";
import { type SubmissionResult } from "@/lib/feedback";
import { useTheme } from "@/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/lib/theme";

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  // Android hardware/gesture back closes the sheet instead of the screen.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <View style={styles.backdrop}>
      {/* Backdrop tap only dismisses BELOW the card — a stray tap while the
          keyboard is up must not eat a half-typed suggestion, so the card
          itself and the strip above it are inert. */}
      <View style={[styles.card, { marginTop: Math.max(insets.top, spacing.l) }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
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
          </TouchableOpacity>
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
      </View>
      <TouchableOpacity
        style={styles.backdropTouch}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close suggestion form"
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
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
      // Never taller than what sits above a raised keyboard on a small
      // phone; the inner ScrollView takes over if content overflows.
      maxHeight: 420,
      width: "94%",
      maxWidth: 680,
      alignSelf: "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
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
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
    },
  });
