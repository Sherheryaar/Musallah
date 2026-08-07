import type { TextStyle } from "react-native";

// NOTE: this module must stay free of RUNTIME react-native imports.
// The palette is unit-tested (theme.test.ts) in a plain node
// environment, and a value import of Platform makes the whole file
// unloadable there — the contrast tests silently stop running.
// Type-only imports are erased and are fine. Anything needing
// Platform at runtime belongs in src/lib/elevation.ts.
//
// One place for colours and spacing so the whole app stays consistent
// and is easy to restyle later. Components get the active palette via
// useTheme() (src/context/ThemeContext.tsx) — never import a palette
// directly, or dark mode silently stops applying to that component.

// Every text/background pairing below clears WCAG AA (4.5:1) — enforced by
// theme.test.ts, which will fail the build if a future tweak drops one
// under. The light palette needed real work to get there: textSecondary is
// the app's most-used colour and was 4.03:1 on surface, and the ink of all
// three status colours was between 2.6 and 3.2:1. Contrast is the reason
// these are not the "nicer" lighter values.
export const lightColors = {
  text: "#2C2C2B",
  textSecondary: "#6F6C68",
  canvas: "#FFFFFF",
  surface: "#F9F8F7",
  surfaceSecondary: "#F0EFED",
  border: "#E6E5E3",
  // `border` is a DIVIDER: it separates things that are already legible on
  // their own, and at 1.26:1 on canvas that is exactly the right weight for
  // one. It is the wrong colour for the OUTLINE OF A CONTROL, which WCAG
  // 1.4.11 requires to clear 3:1 whenever that outline is the only thing
  // identifying the control. Three places were relying on it that way — the
  // sheet's drag handle, the unselected radio rings in Settings, and the
  // qibla turn tape's graduations — and all three were effectively invisible.
  // This is the weakest value that clears 3:1 on canvas, surface,
  // surfaceSecondary AND accentSoft, so it stays a hairline instead of
  // becoming a second tier of ink. Enforced by theme.test.ts.
  controlBorder: "#8A8784",
  // The identity colour: the same deep masjid green as the map pins.
  // (Was a generic blue; green is the app's most meaningful colour.)
  accent: "#2E7D57",
  accentSoft: "#EEF5F1",
  positive: "#357955",
  positiveSoft: "#E8F1EC",
  // NOT placeTypeColors.musalla any more, though it used to be byte
  // identical. That value is baked into assets/pins/*.png and must not
  // move; this one is ink for caution text and had to darken to be
  // legible. The legend amber and the caution amber now differ slightly,
  // deliberately — they were never the same role.
  attention: "#A2612D",
  attentionSoft: "#FDF4ED",
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
  controlBorder: "#7C7973",
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

/**
 * Android ripple colour. Deliberately NOT accentSoft: in dark mode that is
 * #1C332A against a #201F1D canvas, a delta small enough that the ripple
 * is invisible — which reads as an unresponsive button. A neutral wash
 * works on every surface in both themes.
 */
export const rippleColor = (scheme: "light" | "dark"): string =>
  scheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";

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
  /** Cards that carry a whole screen's identity — the place-detail hero. */
  xl: 16,
  /** The bottom sheet's top corners. */
  xxl: 20,
  /** Fully rounded: distance chips, reminder chips. */
  pill: 999,
};


/**
 * The type scale. Every size and weight the app uses, named.
 *
 * `numeric` is spread into anything showing a time, countdown, bearing or
 * distance: without tabular figures the digits have different widths, so a
 * countdown ticking 1→2 visibly jitters the text beside it. Roboto and SF
 * both ship the `tnum` feature, so this costs no bundled font.
 */
export const numeric = { fontVariant: ["tabular-nums"] } satisfies TextStyle;

export const type = {
  display: { fontSize: 44, lineHeight: 52, fontWeight: "700", letterSpacing: -1 },
  title1: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  title2: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  title3: { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 19, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: "400" },
  /** Small uppercase label above a value. */
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
} satisfies Record<string, TextStyle>;
