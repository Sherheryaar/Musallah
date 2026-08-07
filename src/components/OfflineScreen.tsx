import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";

import Touchable from "./Touchable";
import { useTheme } from "@/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/lib/theme";

type Props = {
  onRetry: () => Promise<void>;
};

/** The screens that are pure on-device computation and need no network. */
const OFFLINE_ROUTES = [
  { href: "/prayer", icon: "clock-outline", label: "Prayer times" },
  { href: "/qibla", icon: "compass-outline", label: "Qibla" },
] as const;

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
  const router = useRouter();

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
        Finding mosques and prayer spaces needs a connection. Prayer times
        and Qibla work offline {"—"} they're calculated on your phone.
      </Text>
      <Touchable
        style={[styles.retryButton, retrying && styles.retryButtonBusy]}
        onPress={handleRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.retryLabel}>
          {retrying ? "Checking…" : "Try again"}
        </Text>
      </Touchable>

      {/* This screen replaces the whole app when the first fetch fails, so
          without these it also blocks the two features that need no
          network at all. */}
      <View style={styles.links}>
        {OFFLINE_ROUTES.map(({ href, icon, label }) => (
          <Touchable
            key={href}
            style={styles.link}
            onPress={() => router.push(href)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <MaterialCommunityIcons
              name={icon}
              size={18}
              color={colors.accent}
            />
            <Text style={styles.linkLabel}>{label}</Text>
          </Touchable>
        ))}
      </View>
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
    links: {
      flexDirection: "row",
      gap: spacing.s,
      marginTop: spacing.l,
    },
    link: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.s,
      minHeight: 44,
      paddingHorizontal: spacing.l,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.canvas,
      overflow: "hidden",
    },
    linkLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.accent,
    },
  });
