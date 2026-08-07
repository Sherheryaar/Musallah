// How much of the screen the software keyboard is currently covering.
//
// iOS only, by design. On Android, Expo's default
// `softwareKeyboardLayoutMode: "resize"` shrinks the window itself, so any
// container measured with onLayout ALREADY excludes the keyboard —
// subtracting it again would double-count and leave a card half the size it
// should be. iOS never resizes the window, so it has to be measured.
//
// `keyboardWillChangeFrame` rather than `keyboardDidShow`: it fires with
// the animation, covers the undocked/split keyboard and the height changes
// when an autocomplete bar appears, and gives a value in time to be used in
// the same frame the keyboard starts moving.

import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const onFrame = Keyboard.addListener("keyboardWillChangeFrame", (e) => {
      // screenY is where the keyboard's top edge sits; anything below it is
      // covered. A keyboard that is dismissed reports a screenY at or past
      // the bottom of the screen, which yields 0 here.
      const covered = e.endCoordinates.height;
      setHeight(covered > 0 ? covered : 0);
    });
    const onHide = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      onFrame.remove();
      onHide.remove();
    };
  }, []);

  return height;
}
