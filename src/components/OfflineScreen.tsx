import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useTheme } from "@/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/lib/theme";

type Props = {
  onRetry: () => Promise<void>;
};

/**
 * Shown instead of the map/list/place page when there is no live connection
 * AND nothing has loaded yet this session. There is no bundled or cached
 * dataset to fall back to by design (see src/data/places.ts) — the place
 * list is only ever shown fetched live, never shipped inside the app.
 */
export default function OfflineScreen({ onRetry }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    if (retrying) return;
    setRetrying(true);
    onRetry().finally(() => setRetrying(false));
  };

  return (
    <View style={styles.screen}>
      <MaterialCommunityIcons
        name="wifi-off"
        size={56}
        color={colors.textSecondary}
      />
      <Text style={styles.title}>You're offline</Text>
      <Text style={styles.body}>
        Musallah needs an internet connection to find mosques and prayer
        spaces near you — the list isn't stored on your phone. Prayer times
        and the Qibla direction don't need one and still work.
      </Text>
      <TouchableOpacity
        style={[styles.retryButton, retrying && styles.retryButtonBusy]}
        onPress={handleRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.retryLabel}>
          {retrying ? "Checking…" : "Try again"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.xl,
      gap: spacing.m,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginTop: spacing.s,
    },
    body: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 21,
      maxWidth: 340,
    },
    retryButton: {
      marginTop: spacing.m,
      backgroundColor: colors.accent,
      borderRadius: radius.m,
      paddingVertical: spacing.m,
      paddingHorizontal: spacing.xl,
      minWidth: 140,
      alignItems: "center",
    },
    retryButtonBusy: {
      opacity: 0.6,
    },
    // canvas, not white: the dark theme's accent is light — white would fail.
    retryLabel: {
      color: colors.canvas,
      fontSize: 16,
      fontWeight: "600",
    },
  });
