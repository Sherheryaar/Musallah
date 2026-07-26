import { Link, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, StyleSheet } from "react-native";
import { PlacesProvider } from "../src/context/PlacesContext";
import { SettingsProvider } from "../src/context/SettingsContext";
import { colors } from "../src/lib/theme";

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
});
