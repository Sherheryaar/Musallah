import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { cardEdge } from "@/lib/elevation";
import { createThemedStyles } from "@/lib/themedStyles";
import {
  placeTypeColors,
  radius,
  spacing,
  type,
  type ThemeColors,
} from "@/lib/theme";

const LEGEND_ITEMS: { type: keyof typeof placeTypeColors; label: string }[] = [
  { type: "masjid", label: "Masjid" },
  { type: "musalla", label: "Prayer room" },
  { type: "multi_faith_room", label: "Multi-faith" },
];

/**
 * What each pin colour means. Sits under the search bar: the bottom of the
 * map is covered by the list sheet, so a bottom-corner key would be hidden at
 * the default sheet position.
 */
export default function MapLegend() {
  const styles = useStyles();
  return (
    <View
      style={styles.legend}
      // Without `accessible`, iOS ignores a container's accessibilityLabel
      // entirely and reads the three loose words instead — so the one place
      // the pin colours are explained in WORDS never reached the people who
      // can only use words. Android's twin is "yes" on the group ITSELF —
      // "no-hide-descendants" would drop the label along with the children.
      accessible
      importantForAccessibility="yes"
      accessibilityLabel="Map key: green is a masjid, amber is a prayer room, purple is a multi-faith room. The blue dot is your location. A numbered circle groups several places — tap it to zoom in."
    >
      {LEGEND_ITEMS.map(({ type: placeType, label }) => (
        <View key={placeType} style={styles.item}>
          <View
            style={[styles.dot, { backgroundColor: placeTypeColors[placeType] }]}
          />
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
    legend: {
      alignSelf: "flex-start",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.m,
      backgroundColor: colors.canvas,
      borderRadius: radius.pill,
      ...cardEdge(scheme, colors),
      paddingHorizontal: spacing.l,
      paddingVertical: spacing.s,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.canvas,
    },
    label: {
      ...type.caption,
      fontWeight: "600",
      color: colors.textSecondary,
    },
  }),
);
