import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";

import Touchable from "./Touchable";
import { useTheme } from "@/context/ThemeContext";
import { MIN_TARGET } from "@/lib/metrics";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

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
  const styles = useStyles();
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();

  const handleRetry = () => {
    if (retrying) return;
    setRetrying(true);
    onRetry().finally(() => setRetrying(false));
  };

  return (
    // Scrollable, and centred by the content container rather than by a fixed
    // flex box: this screen REPLACES the whole app when the first fetch fails,
    // so if its content outgrew the viewport at a large system font size the
    // "Try again" button became unreachable with nothing to scroll — leaving
    // no way back into the app at all.
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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
    </ScrollView>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      // flexGrow + justifyContent centres the content while it fits, then lets
      // it scroll once it doesn't. `flex: 1` here would cap it at the viewport
      // and clip instead.
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xl,
      gap: spacing.m,
    },
    title: {
      ...type.title3,
      fontWeight: "700",
      color: colors.text,
      marginTop: spacing.s,
    },
    body: {
      ...type.callout,
      color: colors.textSecondary,
      textAlign: "center",
      maxWidth: 340,
    },
    retryButton: {
      marginTop: spacing.m,
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingVertical: spacing.m,
      paddingHorizontal: spacing.xl,
      minWidth: 140,
      // Padding alone left this at ~43pt — under the minimum on both
      // platforms, on the one button that gets the user back into the app.
      minHeight: MIN_TARGET,
      alignItems: "center",
      justifyContent: "center",
      // Clips the Android ripple to the pill; without it the press flashes as
      // a full rectangle over the rounded corners.
      overflow: "hidden",
    },
    retryButtonBusy: {
      opacity: 0.6,
    },
    // canvas, not white: the dark theme's accent is light — white would fail.
    retryLabel: {
      color: colors.canvas,
      ...type.body,
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
      minHeight: MIN_TARGET,
      paddingHorizontal: spacing.l,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.canvas,
      overflow: "hidden",
    },
    linkLabel: {
      ...type.callout,
      fontWeight: "600",
      color: colors.accent,
    },
  }),
);
