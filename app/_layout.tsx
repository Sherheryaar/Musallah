import { Link, Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, StyleSheet, TouchableOpacity, View } from "react-native";
import { PlacesProvider } from "../src/context/PlacesContext";
import { SettingsProvider } from "../src/context/SettingsContext";
import { colors, radius, spacing } from "../src/lib/theme";

/**
 * Root error boundary (picked up by expo-router). Without it, any uncaught
 * render error is a blank white screen on a production build.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
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

function SettingsButton() {
  return (
    <Link href="/settings" accessibilityLabel="Settings">
      <Text style={styles.settingsIcon}>{"\u2699\uFE0F"}</Text>
    </Link>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <PlacesProvider>
        <StatusBar style="dark" />
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
              headerRight: () => <SettingsButton />,
            }}
          />
          <Stack.Screen name="place/[id]" options={{ title: "" }} />
          <Stack.Screen name="prayer" options={{ title: "Prayer times" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
        </Stack>
      </PlacesProvider>
    </SettingsProvider>
  );
}

const styles = StyleSheet.create({
  settingsIcon: {
    fontSize: 18,
    // Generous padding = a comfortable ~44pt tap target in the header
    // (18pt glyph + 6pt padding was only ~30pt -- too easy to miss).
    padding: 12,
  },
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
