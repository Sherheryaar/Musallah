import React from "react";
import { StyleSheet, Text, View } from "react-native";

import Touchable from "@/components/Touchable";
import { MIN_TARGET } from "@/lib/metrics";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

type Props = {
  savedOnly: boolean;
  filterCount: number;
  onAddPlace: () => void;
};

/**
 * "Nothing here" — distinct from "nothing YET", which is PlacesSkeleton.
 * Places load live on every launch, so during the first fetch the list is
 * legitimately empty; showing this then invited users to report the entire
 * dataset as a gap.
 */
export default function EmptyState({ savedOnly, filterCount, onAddPlace }: Props) {
  const styles = useStyles();
  // Advice about a control that isn't on is worse than none: with no filter
  // narrowing the list, the only thing that can be hiding places is what
  // was typed.
  const advice = savedOnly
    ? "Tap the heart on a place to save it — or turn off the saved-places filter."
    : filterCount > 0
      ? "Try removing a filter — or this is a gap in the data worth fixing."
      : "Try a shorter search, or a nearby town — or this is a gap in the data worth fixing.";
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>
        {savedOnly ? "No saved places" : "No places match"}
      </Text>
      <Text style={styles.text}>{advice}</Text>
      <Touchable
        style={styles.button}
        onPress={onAddPlace}
        accessibilityRole="button"
        accessibilityLabel="Add a missing place"
      >
        <Text style={styles.buttonLabel}>Add a missing place</Text>
      </Touchable>
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    empty: {
      alignItems: "center",
      padding: spacing.xxl,
      gap: spacing.s,
    },
    title: {
      ...type.body,
      fontWeight: "600",
      color: colors.text,
    },
    text: {
      ...type.subhead,
      color: colors.textSecondary,
      textAlign: "center",
    },
    // A real filled pill, not a text link: on an empty screen this button IS
    // the way forward, so it dresses like the primary action it is.
    button: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: MIN_TARGET,
      marginTop: spacing.s,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      overflow: "hidden",
    },
    buttonLabel: {
      ...type.subhead,
      color: colors.canvas,
      fontWeight: "700",
    },
  }),
);
