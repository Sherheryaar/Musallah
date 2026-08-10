import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/lib/theme";

// A stylesheet is a pure function of the palette, so it should be built once
// per palette for the whole app — not once per component INSTANCE.
//
// The pattern this replaces was `useMemo(() => createStyles(colors), [colors])`
// inside the component. useMemo is per-instance, so every mounted copy ran
// StyleSheet.create again over an identical palette: one per list row (the
// results list holds up to 25 PlaceCards, each rebuilding ten rules), and on
// the settings screen one per SectionHeader and per OptionRow — seventeen
// rebuilds of a forty-rule sheet to render one screen.
//
// There are exactly two palettes in the app and both are module constants, so
// keying on the palette object gives a cache with at most two entries and no
// lifetime concerns.

type Scheme = "light" | "dark";

/**
 * Wrap a stylesheet factory into a hook that returns the app-wide instance
 * for the active palette.
 *
 *   const useStyles = createThemedStyles((colors, scheme) =>
 *     StyleSheet.create({ ... }),
 *   );
 *
 * The factory must be PURE in (colors, scheme). Anything else the styles
 * depend on — a measured width, a layout inset — has to stay in a useMemo at
 * the call site, because it cannot be part of this cache's key.
 */
export function createThemedStyles<T extends object>(
  factory: (colors: ThemeColors, scheme: Scheme) => T,
): () => T {
  const cache = new Map<ThemeColors, T>();
  return function useThemedStyles(): T {
    const { colors, scheme } = useTheme();
    let styles = cache.get(colors);
    if (styles === undefined) {
      styles = factory(colors, scheme);
      cache.set(colors, styles);
    }
    return styles;
  };
}
