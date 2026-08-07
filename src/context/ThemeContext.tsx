import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import { darkColors, lightColors, ThemeColors } from "@/lib/theme";
import { useSettings } from "./SettingsContext";

type ThemeValue = {
  scheme: "light" | "dark";
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeValue>({
  scheme: "light",
  colors: lightColors,
});

/**
 * Resolves the app's colour scheme from the theme SETTING: "system" follows
 * the OS live (useColorScheme re-renders on change, including
 * react-native-web's prefers-color-scheme on the web), while "light"/"dark"
 * pin it regardless of the OS.
 *
 * Must be rendered INSIDE SettingsProvider — see RootLayout, where the
 * settings provider deliberately sits outermost for exactly this reason.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const { settings } = useSettings();
  const scheme =
    settings.theme === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : settings.theme;
  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: scheme === "dark" ? darkColors : lightColors }),
    [scheme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
