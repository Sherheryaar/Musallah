import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import { darkColors, lightColors, ThemeColors } from "@/lib/theme";

type ThemeValue = {
  scheme: "light" | "dark";
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeValue>({
  scheme: "light",
  colors: lightColors,
});

/**
 * Follows the system light/dark setting live (useColorScheme re-renders on
 * change, including react-native-web's prefers-color-scheme on the web).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const scheme = system === "dark" ? "dark" : "light";
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
