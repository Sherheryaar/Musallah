import { Platform } from "react-native";

import type { ThemeColors } from "./theme";

// Kept OUT of theme.ts on purpose: that module is unit-tested in a plain
// node environment, and a runtime import of react-native there makes it
// unloadable, which silently drops the palette contrast tests.

/**
 * Depth, as three named levels rather than seven hand-rolled shadows.
 *
 * The two platforms use DIFFERENT props and ignore each other's entirely:
 * Android renders only `elevation` and ignores every shadow* prop, while
 * iOS does the reverse. Written by hand, the same surface drifted — the
 * recenter button and the qibla dial declared visibly different iOS shadows
 * but the identical Android elevation, so they matched on one platform and
 * not the other.
 *
 * Dark mode gets no shadow at all: a black shadow on a near-black surface
 * is mathematically invisible, so depth there is carried by the border and
 * surface luminance instead.
 */
export function elevation(
  scheme: "light" | "dark",
  level: "raised" | "floating" | "ambient" | "sheet",
) {
  // Redesign: shadows got softer and larger-radius — cards float on a wash
  // of shadow instead of sitting behind a hairline. Android `elevation`
  // values are UNCHANGED: their relative order is a contract (the sheet at
  // 12 must keep sliding over the recenter FAB at 6 — see BottomSheet).
  const spec = {
    raised: { opacity: 0.1, radius: 12, offsetY: 4, android: 3 },
    floating: { opacity: 0.14, radius: 18, offsetY: 8, android: 6 },
    // A wide, faint lift for one LARGE surface — the 320px qibla dial. The
    // same opacity as `raised` under a 320px disc reads as a hard edge; this
    // trades darkness for spread so the instrument sits on the page instead
    // of being outlined on it. Added as a level rather than hand-rolled at
    // the call site, which is what this module exists to prevent.
    ambient: { opacity: 0.07, radius: 24, offsetY: 10, android: 3 },
    sheet: { opacity: 0.16, radius: 24, offsetY: -6, android: 12 },
  }[level];

  if (scheme === "dark") {
    return Platform.select({
      android: { elevation: spec.android },
      default: {},
    });
  }
  return Platform.select({
    android: { elevation: spec.android },
    default: {
      shadowColor: "#000",
      shadowOpacity: spec.opacity,
      shadowRadius: spec.radius,
      shadowOffset: { width: 0, height: spec.offsetY },
    },
  });
}

/**
 * The redesign's card edge, in one place instead of ten.
 *
 * Light mode: NO border — cards float on a soft `raised` shadow, which is
 * what makes the screen read as layered rather than outlined. Dark mode:
 * the exact opposite, a hairline and no shadow, because a black shadow on a
 * near-black screen is invisible and the border is what gives a card an
 * edge there. Spread this into any card-like surface after its own
 * backgroundColor/radius; it only supplies the edge treatment.
 */
export function cardEdge(scheme: "light" | "dark", colors: ThemeColors) {
  // Both schemes return the SAME set of style keys, and only the values
  // change. The earlier shape — border props in dark, elevation in light —
  // meant a live theme switch ADDED and REMOVED native props on mounted
  // views, and on Android (Fabric) that prop swap on an `overflow: "hidden"`
  // card corrupted its canvas: every card on the mounted screen kept its
  // white fill but stopped drawing its children until the screen was left
  // and reopened. Zero-valued props render identically to absent ones, so
  // pinning the set costs nothing visually and makes the diff value-only,
  // which Android applies correctly.
  if (scheme === "dark") {
    return {
      borderWidth: 1,
      borderColor: colors.border,
      ...Platform.select({
        android: { elevation: 0 },
        default: {
          shadowColor: "#000",
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
        },
      }),
    };
  }
  return {
    borderWidth: 0,
    borderColor: colors.border,
    ...elevation(scheme, "raised"),
  };
}
