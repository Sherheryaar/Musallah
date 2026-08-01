// One place for colours and spacing so the whole app stays consistent
// and is easy to restyle later. Components get the active palette via
// useTheme() (src/context/ThemeContext.tsx) — never import a palette
// directly, or dark mode silently stops applying to that component.

export const lightColors = {
  text: "#2C2C2B",
  textSecondary: "#7D7A75",
  canvas: "#FFFFFF",
  surface: "#F9F8F7",
  surfaceSecondary: "#F0EFED",
  border: "#E6E5E3",
  // The identity colour: the same deep masjid green as the map pins.
  // (Was a generic blue; green is the app's most meaningful colour.)
  accent: "#2E7D57",
  accentSoft: "#E6F0EA",
  positive: "#46A171",
  positiveSoft: "#E8F1EC",
  attention: "#D5803B",
  attentionSoft: "#FBEBDE",
  // Blue is reserved for ONE meaning: the you-are-here dot the map draws
  // on both platforms. Anything pointing at the user (the recenter button)
  // uses this, and nothing else does.
  youAreHere: "#2783DE",
};

export type ThemeColors = typeof lightColors;

// Dark palette: same roles, tuned for contrast on near-black. The accent is
// lightened — the light-mode green fails contrast on dark surfaces.
export const darkColors: ThemeColors = {
  text: "#ECEAE6",
  textSecondary: "#A29E96",
  canvas: "#201F1D",
  surface: "#141312",
  surfaceSecondary: "#2C2B28",
  border: "#3A3835",
  accent: "#6FC59B",
  accentSoft: "#1C332A",
  positive: "#63B98D",
  positiveSoft: "#1D2F26",
  attention: "#E09A5C",
  attentionSoft: "#37281B",
  youAreHere: "#6FB1EF",
};

/**
 * One colour per place type — used for map pins, the map legend, and the
 * type badges on list cards, so the colour language is consistent
 * everywhere. Deliberately NO blue: the map's user-location dot is blue on
 * both platforms, and a blue pin was indistinguishable from "you are here".
 * Same hues in both themes (they sit on the map, not on app surfaces).
 * Mirrored in scripts/gen-pin-assets.js (regenerate the PNGs on change).
 */
export const placeTypeColors = {
  masjid: "#2E7D57",
  musalla: "#D5803B",
  multi_faith_room: "#7A5FA8",
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  m: 8,
  l: 12,
};
