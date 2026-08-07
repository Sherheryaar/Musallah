import { Link, Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useMemo } from "react";
import {
  I18nManager,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Touchable from "../src/components/Touchable";
import { useReducedMotion } from "../src/lib/useReducedMotion";
import { FavouritesProvider } from "../src/context/FavouritesContext";
import { NotificationsProvider } from "../src/context/NotificationsContext";
import { PlacesProvider } from "../src/context/PlacesContext";
import { SettingsProvider } from "../src/context/SettingsContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import {
  darkColors,
  lightColors,
  radius,
  spacing,
  type,
  type ThemeColors,
} from "../src/lib/theme";
import { MIN_TARGET } from "../src/lib/metrics";

// Pin the layout direction left-to-right, at MODULE scope so it runs before
// anything renders (inside a component or an effect is too late, and it
// must not be conditional).
//
// The app's UI is English-only with no translation layer, but Android's
// `supportsRtl` defaults to true while app.json declares no iOS `locales`.
// So a user whose system language is Arabic or Urdu — a meaningful slice of
// this audience — got a HALF-flipped layout on Android and none of it on
// iOS: `flexDirection: "row"` flips under I18nManager, but `left`/`right`,
// `paddingRight` and `textAlign: "right"` do not. That asymmetry is the one
// genuinely bad option, and this removes it.
//
// If translations are ever added, take the other branch instead: allow RTL
// and sweep the layouts onto start/end properties.
I18nManager.allowRTL(false);

/**
 * Root error boundary (picked up by expo-router). Without it, any uncaught
 * render error is a blank white screen on a production build. Reads the
 * colour scheme directly — it can render outside the ThemeProvider.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useColorScheme() === "dark" ? darkColors : lightColors;
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorBody}>{error.message}</Text>
      {/* The one TouchableOpacity left in the app, deliberately: Touchable
          calls useTheme(), and this boundary can render OUTSIDE the
          ThemeProvider — where it would silently fall back to the light
          ripple. A last-resort screen should depend on as little as
          possible. */}
      <TouchableOpacity
        style={styles.errorButton}
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.errorButtonLabel}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * The two global nav actions. Vector icons rather than 🧭 and ⚙️: emoji
 * ignore `color`, so they were the only chrome in the app that couldn't
 * follow the theme or the header tint, they render at visibly different
 * weights and baselines on iOS vs Android, and ⚙️ (U+2699 U+FE0F) can fall
 * back to a monochrome text glyph on some Android builds.
 */
const NAV_ACTIONS = [
  { href: "/qibla", icon: "compass-outline", label: "Qibla direction" },
  { href: "/settings", icon: "cog-outline", label: "Settings" },
] as const;

function HeaderButtons() {
  const { colors } = useTheme();
  return (
    <View style={staticStyles.headerButtons}>
      {NAV_ACTIONS.map(({ href, icon, label }) => (
        // asChild: expo-router's Link wraps its children in a <Text>, so
        // without it there is no Touchable in the tree at all and tapping
        // these produced no feedback on either platform.
        <Link key={href} href={href} asChild>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={label}
            style={staticStyles.headerButton}
            borderless
            rippleRadius={21}
            scaleTo={0.9}
          >
            <MaterialCommunityIcons name={icon} size={20} color={colors.text} />
          </Touchable>
        </Link>
      ))}
    </View>
  );
}

/** Inside ThemeProvider, so the navigation chrome follows the theme too. */
function ThemedNavigator() {
  const { scheme, colors } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "600" },
          // Android left-aligns header titles by default; center to match iOS.
          headerTitleAlign: "center",
          // Unset, every push inherited react-native-screens' platform
          // default — so the same tap slid on iOS and cross-faded on
          // Android, two different navigation metaphors for one action.
          // A 150ms fade is the reduced-motion target rather than "none",
          // which is jarring enough to read as a bug.
          animation: reduceMotion ? "fade" : "slide_from_right",
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Find a place to pray",
            headerRight: () => <HeaderButtons />,
          }}
        />
        <Stack.Screen name="place/[id]" options={{ title: "" }} />
        <Stack.Screen name="prayer" options={{ title: "Prayer times" }} />
        <Stack.Screen name="qibla" options={{ title: "Qibla" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    // Settings OUTSIDE theme: the theme setting (system/light/dark) lives in
    // settings, so ThemeProvider must be able to read it. SettingsProvider
    // renders no themed UI of its own, so the flip costs nothing.
    <SettingsProvider>
      <ThemeProvider>
        <NotificationsProvider>
          <PlacesProvider>
            <FavouritesProvider>
              <ThemedNavigator />
            </FavouritesProvider>
          </PlacesProvider>
        </NotificationsProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}

const staticStyles = StyleSheet.create({
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    // 20pt glyph + 12pt padding = ~44pt, the minimum comfortable target.
    // Padding belongs here rather than on the icon, where it would fight
    // the `size` prop.
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    errorScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.m,
      backgroundColor: colors.surface,
    },
    errorTitle: {
      ...type.title4,
      fontWeight: "700",
      color: colors.text,
    },
    errorBody: {
      ...type.subhead,
      color: colors.textSecondary,
      textAlign: "center",
    },
    errorButton: {
      marginTop: spacing.s,
      minHeight: MIN_TARGET,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.l,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    errorButtonLabel: {
      // Not "#FFFFFF": on the lightened dark-mode accent that measures
      // 2.07:1. colors.canvas tracks the theme and clears AA in both.
      color: colors.canvas,
      ...type.callout,
      fontWeight: "600",
    },
  });
