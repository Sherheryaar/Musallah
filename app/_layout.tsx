import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PlacesProvider } from "@/context/PlacesContext";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
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
        <Stack.Screen name="index" options={ { title: "Find a place to pray" } } />
        <Stack.Screen name="place/[id]" options={ { title: "" } } />
      </Stack>
    </PlacesProvider>
  );
}
