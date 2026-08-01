import { Link, Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useMemo } from "react";
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { PlacesProvider } from "../src/context/PlacesContext";
import { SettingsProvider } from "../src/context/SettingsContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import {
  darkColors,
  lightColors,
  radius,
  spacing,
  type ThemeColors,
} from "../src/lib/theme";

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

function HeaderButtons() {
  return (
    <View style={staticStyles.headerButtons}>
      <Link href="/qibla" accessibilityLabel="Qibla direction">
        <Text style={staticStyles.headerIcon}>{"🧭"}</Text>
      </Link>
      <Link href="/settings" accessibilityLabel="Settings">
        <Text style={staticStyles.headerIcon}>{"⚙️"}</Text>
      </Link>
    </View>
  );
}

/** Inside ThemeProvider, so the navigation chrome follows the theme too. */
function ThemedNavigator() {
  const { scheme, colors } = useTheme();
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
    <ThemeProvider>
      <SettingsProvider>
        <PlacesProvider>
          <ThemedNavigator />
        </PlacesProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

const staticStyles = StyleSheet.create({
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    fontSize: 18,
    // Generous padding = a comfortable ~44pt tap target in the header
    // (18pt glyph + 6pt padding was only ~30pt -- too easy to miss).
    padding: 12,
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
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
    },
    errorBody: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    errorButton: {
      marginTop: spacing.s,
      minHeight: 44,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.l,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    errorButtonLabel: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "600",
    },
  });
