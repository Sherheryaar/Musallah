import { Platform } from "react-native";

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
 * surface luminance instead. The web branch also avoids react-native-web's
 * deprecation warning for the shadow* props.
 */
export function elevation(
  scheme: "light" | "dark",
  level: "raised" | "floating" | "sheet",
) {
  const spec = {
    raised: { opacity: 0.08, radius: 6, offsetY: 2, android: 3 },
    floating: { opacity: 0.12, radius: 12, offsetY: 4, android: 6 },
    sheet: { opacity: 0.15, radius: 16, offsetY: -4, android: 12 },
  }[level];

  if (scheme === "dark") {
    return Platform.select({
      android: { elevation: spec.android },
      default: {},
    });
  }
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: spec.opacity,
      shadowRadius: spec.radius,
      shadowOffset: { width: 0, height: spec.offsetY },
    },
    android: { elevation: spec.android },
    default: {
      boxShadow: `0px ${spec.offsetY}px ${spec.radius}px rgba(0,0,0,${spec.opacity})`,
    },
  });
}
