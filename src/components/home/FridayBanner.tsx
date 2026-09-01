import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "@/components/Touchable";
import { useTheme } from "@/context/ThemeContext";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

/** Explains the Friday ordering of the list, once, dismissibly. */
export default function FridayBanner({ onDismiss }: { onDismiss: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.banner}>
      <MaterialCommunityIcons name="calendar-star" size={18} color={colors.accent} />
      <Text style={styles.text}>
        It&apos;s Friday — places with a published Jumu&apos;ah time are shown
        first, and Jumu&apos;ah-only venues are included.
      </Text>
      <Touchable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss Friday notice"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
      </Touchable>
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.s,
      backgroundColor: colors.accentSoft,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.accent,
      padding: spacing.m,
      marginBottom: spacing.m,
    },
    text: {
      flex: 1,
      ...type.footnote,
      color: colors.text,
    },
  }),
);
