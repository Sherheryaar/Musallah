import { Platform } from "react-native";

// Kept OUT of theme.ts for the same reason as elevation.ts: that module is
// unit-tested in a plain node environment, and a runtime import of
// react-native there makes it unloadable, which silently drops the palette
// contrast tests.

/**
 * The minimum size of a tappable control, per platform.
 *
 * The two platforms genuinely disagree, and the app had settled on iOS's
 * number everywhere:
 *
 *   iOS      44×44 pt   (HIG)
 *   Android  48×48 dp   (Material 3), with 8 dp between adjacent targets
 *
 * So every `minHeight: 44` in the app was under-spec on Android — and the
 * codebase already knew the right number in five places (the filter rows and
 * Done button, onboarding's primary button, the directions button and the
 * place-detail quick actions all use 48), which is what made the rest read as
 * an oversight rather than a decision.
 *
 * Use this instead of a literal. A control that is deliberately smaller and
 * makes up the difference with `hitSlop` — the sheet's drag handle, the
 * inline text links — is a considered exception and stays as it is.
 */
export const MIN_TARGET = Platform.OS === "android" ? 48 : 44;
