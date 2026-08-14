// Keeps a sheet mounted while it animates OUT.
//
// Both sheets used `if (!visible) return null`, so they appeared and
// vanished in a single frame — the screen just went dark. The fix is not
// "animate the opacity": a component that unmounts on the same tick has
// nothing left to animate. It has to stay mounted until the exit finishes,
// which is what the extra `mounted` state buys.
//
// Returns 0 → 1 progress on the NATIVE driver: it only ever feeds opacity
// and translateY.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export function useSheetAnimation(visible: boolean, reduceMotion: boolean) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: reduceMotion ? 0 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      // Out is quicker than in: a dismissal should get out of the way.
      duration: reduceMotion ? 0 : 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Only unmount if the animation actually ran to the end — an exit
      // interrupted by the sheet being reopened must not then unmount it.
      if (finished) setMounted(false);
    });
  }, [visible, reduceMotion, progress]);

  return { mounted, progress };
}
