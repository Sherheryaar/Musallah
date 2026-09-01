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
// under. Contrast is the reason these are not the "nicer" lighter values.
//
// The 2026-08 redesign: a deeper, more saturated emerald identity in light
// mode; a near-black, luminance-layered dark mode with a genuinely vibrant
// accent (dark ink on bright green, the way music apps do their play
// buttons). Same roles as before — only the values moved, and every one of
// them re-cleared the contrast suite.
export const lightColors = {
  text: "#1C1B18",
  textSecondary: "#605E57",
  canvas: "#FFFFFF",
  surface: "#F6F5F1",
  surfaceSecondary: "#ECEAE4",
  border: "#E6E4DE",
  // `border` is a DIVIDER: it separates things that are already legible on
  // their own, and at ~1.25:1 on canvas that is exactly the right weight for
  // one. It is the wrong colour for the OUTLINE OF A CONTROL, which WCAG
  // 1.4.11 requires to clear 3:1 whenever that outline is the only thing
  // identifying the control (the sheet's drag handle, the unselected radio
  // rings in Settings, the qibla turn tape's graduations). This is the
  // weakest value that clears 3:1 on canvas, surface, surfaceSecondary AND
  // accentSoft, so it stays a hairline instead of becoming a second tier of
  // ink. Enforced by theme.test.ts.
  controlBorder: "#88857E",
  // The identity colour: a vivid emerald, one notch deeper and more
  // saturated than the map pins' green so it can carry filled buttons and
  // still clear 4.5:1 as ink on white.
  accent: "#067647",
  accentSoft: "#E2F5EA",
  positive: "#1B7742",
  positiveSoft: "#E3F4E8",
  // NOT placeTypeColors.musalla. That value is baked into assets/pins/*.png
  // and must not move; this one is ink for caution text and has to stay
  // legible on white.
  attention: "#9E5310",
  attentionSoft: "#FBEFE0",
  // Blue is reserved for ONE meaning: the you-are-here dot the map draws
  // on both platforms. Anything pointing at the user (the recenter button)
  // uses this, and nothing else does.
  youAreHere: "#2783DE",
  // The hero gradient (place detail, prayer countdown): emerald falling
  // into deep teal. White text must clear AA on BOTH stops — asserted in
  // theme.test.ts — which is why the stops are this dark. Identical in both
  // palettes on purpose: the hero is the brand moment, not a surface, so it
  // does not re-theme.
  heroGradientStart: "#0B7A4B",
  heroGradientEnd: "#0B5E58",
};

export type ThemeColors = typeof lightColors;

// Dark palette: same roles on true near-black. Surfaces separate by
// LUMINANCE (cards sit lighter than the screen), and the accent brightens
// to a saturated green that reads as the brand rather than a pastel echo
// of it — button labels on it are near-black canvas, which is what clears
// contrast there.
export const darkColors: ThemeColors = {
  text: "#F4F3EF",
  textSecondary: "#A9A79F",
  canvas: "#1E1E1C",
  surface: "#121211",
  surfaceSecondary: "#2C2C29",
  border: "#33332F",
  controlBorder: "#807E76",
  accent: "#3BC98A",
  accentSoft: "#173A2A",
  positive: "#4CC286",
  positiveSoft: "#16331F",
  attention: "#EDA45F",
  attentionSoft: "#3A2A16",
  youAreHere: "#6FB1EF",
  heroGradientStart: "#0B7A4B",
  heroGradientEnd: "#0B5E58",
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

/**
 * The scrim behind every sheet and dialog. The root layout paints the same
 * colour over the native header while one is open (see OverlayContext), so
 * every overlay must take it from here or the two halves of the scrim differ.
 */
export const scrimColor = (scheme: "light" | "dark"): string =>
  scheme === "dark" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.45)";

export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
};

// One notch chunkier across the board (the redesign's shape language):
// friendly, thumb-round corners rather than utility rounding.
export const radius = {
  m: 10,
  l: 14,
  /** Cards that carry a whole screen's identity — the place-detail hero. */
  xl: 20,
  /** The bottom sheet's top corners. */
  xxl: 28,
  /** Fully rounded: distance chips, reminder chips, the search bar. */
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

/**
 * The type scale: SIZE and LEADING only. Weight and colour stay at the call
 * site, because they vary independently of the step — `body` is used at 400,
 * 600 and 700 in this app, and a `bodyStrong` token per weight just moves the
 * combinatorial mess into this file.
 *
 * Spread it first, so anything a call site adds still wins:
 *
 *   rowLabel: { ...type.body, fontWeight: "600", color: colors.text },
 *
 * Why the values changed: the previous version of this object was written
 * aspirationally and never adopted — every screen hand-picked sizes instead,
 * which produced 42 distinct size/leading/weight combinations across 107 text
 * styles, including SEVEN spellings of the uppercase section header. These
 * steps are the ones the app actually renders, so adopting the scale is
 * mostly a no-op on screen; what it removes is the accidental variance.
 *
 * Every step names a lineHeight, which is the part that was really missing.
 * Roughly half the app's text styles set a fontSize and no leading at all,
 * leaving the two platforms to apply their own font defaults — so the same
 * label occupied a different height on iOS than on Android.
 */
export const type = {
  /** The qibla turn/bearing readout — the largest thing in the app. */
  display: { fontSize: 52, lineHeight: 60, letterSpacing: -1.5 },
  /** The qibla lock-on word ("Aligned"). */
  hero: { fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  /** Screen-level headline: the prayer countdown. Tracked tight — large
      bold type at default tracking reads loose and dated. */
  title1: { fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  /** A place's name on its own page. */
  title2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  /** Card and dialog titles. */
  title3: { fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  title4: { fontSize: 18, lineHeight: 24 },
  title5: { fontSize: 17, lineHeight: 22 },
  /** Default reading size: list rows, table cells, prose. */
  body: { fontSize: 16, lineHeight: 22 },
  callout: { fontSize: 15, lineHeight: 20 },
  subhead: { fontSize: 14, lineHeight: 20 },
  /** Secondary/explanatory text — the app's most-used step after body. */
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  /** Instrument labels and dense metadata. */
  micro: { fontSize: 11, lineHeight: 15 },
  /**
   * The one uppercase section label. The only COMPLETE role in here — it
   * carries tracking, transform and weight, because all three are the role
   * rather than a choice: a 13px uppercase run needs the extra letterSpacing
   * to stay readable and the extra weight to hold up at that size, neither of
   * which is true of any other step. Fixing the weight here is also what
   * finishes the job: the seven places that spell this label were split 4/3
   * between 700 and 600 for no reason anyone chose.
   */
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
} satisfies Record<string, TextStyle>;
