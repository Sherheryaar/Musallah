import React from "react";
import { Platform, Switch, type SwitchProps } from "react-native";

import { useTheme } from "@/context/ThemeContext";

/**
 * A Switch in the app's own green rather than the OS default (iOS system
 * green #34C759, Android's generated Material accent) — the one control in
 * the app that was still wearing someone else's brand.
 *
 * The platforms mean DIFFERENT things by `trackColor.true`, which is the
 * whole reason this component exists:
 *
 *   iOS      fills the entire track with it, behind an opaque white thumb.
 *            So it must be the saturated accent; a pale tint here renders
 *            as a near-white track under a white thumb and reads as OFF.
 *   Android  draws a thin track BEHIND a coloured thumb, Material-style.
 *            The saturated accent there is far too heavy, so the track
 *            takes a translucent accent and the thumb takes the solid one.
 */
export default function ThemedSwitch(props: SwitchProps) {
  const { colors } = useTheme();
  const on = props.value === true;

  if (Platform.OS === "android") {
    return (
      <Switch
        {...props}
        trackColor={{ false: colors.border, true: colors.accent + "66" }}
        thumbColor={on ? colors.accent : colors.textSecondary}
      />
    );
  }

  return (
    <Switch
      {...props}
      trackColor={{ false: colors.border, true: colors.accent }}
      // The off-state track on iOS, which trackColor.false does not cover
      // during the toggle animation.
      ios_backgroundColor={colors.border}
    />
  );
}
