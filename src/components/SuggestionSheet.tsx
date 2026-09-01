import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import OverlaySheet from "./OverlaySheet";
import Touchable from "./Touchable";
import SuggestionForm from "@/components/SuggestionForm";
import { type SubmissionResult } from "@/lib/feedback";
import { useKeyboardHeight } from "@/lib/useKeyboardHeight";
import { useTheme } from "@/context/ThemeContext";
import { floatingEdge } from "@/lib/elevation";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

// Long enough to read the confirmation, short enough that the sheet doesn't
// feel stuck waiting for a second dismissal.
const CLOSE_AFTER_SENT_MS = 1600;

type Props = {
  visible: boolean;
  title: string;
  placeholder: string;
  topics?: string[];
  onSend: (message: string) => Promise<SubmissionResult>;
  onClose: () => void;
};

/**
 * Hosts SuggestionForm in a TOP-ANCHORED overlay (see OverlaySheet). The
 * forms used to sit inline mid-scroll, where the keyboard covered the input
 * on both platforms; pinning the card to the top of the screen means the
 * keyboard (which owns the bottom half) physically cannot overlap what
 * you're typing.
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
  const styles = useStyles();
  const keyboardHeight = useKeyboardHeight();
  // Measured rather than derived: the card must fit the space between the
  // top of this overlay and the top of the keyboard, and the overlay's own
  // height is the only honest source for that. (Not insets.top: the overlay
  // is an absolute fill INSIDE a view the native stack has already laid out
  // below the header, so the status bar has been counted once already.)
  const [containerHeight, setContainerHeight] = useState(0);
  const cardMaxHeight =
    containerHeight > 0
      ? Math.max(220, containerHeight - keyboardHeight - spacing.l * 2)
      : 420;

  // A sent suggestion used to leave the sheet sitting on its confirmation
  // until the user hunted for the ✕.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const close = useCallback(() => {
    // Only this component's SUBTREE unmounts between opens, so an auto-close
    // still pending from an earlier send would outlive a manual dismissal and
    // shut the NEXT sheet while the user was typing in it.
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleSent = useCallback(() => {
    Keyboard.dismiss();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      onClose();
    }, CLOSE_AFTER_SENT_MS);
  }, [onClose]);

  return (
    <OverlaySheet
      visible={visible}
      onClose={close}
      anchor="top"
      zIndex={20}
      closeLabel="Close suggestion form"
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
      cardStyle={[styles.card, { maxHeight: cardMaxHeight }]}
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
          onSent={handleSent}
        />
      </ScrollView>
    </OverlaySheet>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme: "light" | "dark") =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.l,
      gap: spacing.m,
      marginTop: spacing.l,
      // maxHeight is supplied at runtime from the measured overlay minus the
      // keyboard; the inner ScrollView takes over if content overflows.
      width: "94%",
      maxWidth: 680,
      alignSelf: "center",
      ...floatingEdge(scheme, colors),
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
  }),
);
