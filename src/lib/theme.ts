// One place for colours and spacing so the whole app stays consistent
// and is easy to restyle later.

export const colors = {
  text: "#2C2C2B",
  textSecondary: "#7D7A75",
  canvas: "#FFFFFF",
  surface: "#F9F8F7",
  surfaceSecondary: "#F0EFED",
  border: "#E6E5E3",
  accent: "#2783DE",
  accentSoft: "#E5F2FC",
  positive: "#46A171",
  positiveSoft: "#E8F1EC",
  attention: "#D5803B",
  attentionSoft: "#FBEBDE",
};

/**
 * One colour per place type — used for map pins, the map legend, and the
 * type badges on list cards, so the colour language is consistent
 * everywhere. Deliberately NO blue: the map's user-location dot is blue on
 * both platforms, and a blue pin was indistinguishable from "you are here".
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

