// Whether the OS "reduce motion" setting is on, live.
//
// Every animation in the app should either shorten to 0ms or degrade to a
// plain state change when this is true — vestibular disorders are a real
// accessibility need, and a spinning compass dial is exactly the kind of
// motion the setting exists to suppress. The value still CHANGES; it just
// stops sweeping.
//
// react-native-web backs both calls with
// `window.matchMedia('(prefers-reduced-motion: reduce)')`, so the browser
// honours it too — but when matchMedia is unavailable RNW resolves the
// promise to `true` and returns `undefined` from addEventListener, hence
// the optional-chained cleanup below.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => {
        // Setting unreadable on this platform — assume motion is fine.
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  return reduced;
}
