import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "@/components/Touchable";
import { useTheme } from "@/context/ThemeContext";
import { FACILITY_LABELS, type FacilityKey } from "@/data/places";
import { cardEdge } from "@/lib/elevation";
import { FACILITY_ICONS, type IconName } from "@/lib/icons";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

export type QuickFilterKey = FacilityKey | "saved";

// Labels and icons come from the schema's own vocabulary so a chip can never
// name a facility key the data does not have — three of these once did, and
// toggling them filtered out every place.
const QUICK_FILTERS: readonly QuickFilterKey[] = [
  "sistersSpace",
  "disabledAccess",
  "parking",
  "wudu",
  "jumuah",
  "saved",
];
const labelOf = (key: QuickFilterKey) =>
  key === "saved" ? "Saved" : FACILITY_LABELS[key];
const iconOf = (key: QuickFilterKey): IconName =>
  key === "saved" ? "heart" : FACILITY_ICONS[key];

type Props = {
  active: ReadonlySet<FacilityKey>;
  savedOnly: boolean;
  onToggle: (key: QuickFilterKey) => void;
};

/** The one-tap filter chips under the times bar. */
export default function QuickFilterStrip({ active, savedOnly, onToggle }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      style={styles.scroll}
    >
      {QUICK_FILTERS.map((key) => {
        const label = labelOf(key);
        const on = key === "saved" ? savedOnly : active.has(key);
        return (
          <Touchable
            key={key}
            style={[styles.chip, on && styles.chipActive]}
            onPress={() => onToggle(key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`Filter: ${label}`}
          >
            <MaterialCommunityIcons
              name={iconOf(key)}
              size={15}
              color={on ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.label, on && styles.labelActive]}>{label}</Text>
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
    scroll: {
      flexGrow: 0,
      // NO negative marginHorizontal here. That trick only works when the
      // parent HAS matching padding to cancel — and BottomSheet's body is a
      // bare `flex: 1`, so it sliced the first chip's corner flat against the
      // sheet edge. Without it the chips line up with the cards below.
      marginBottom: spacing.xs,
    },
    strip: {
      paddingHorizontal: spacing.l,
      // Room for the chips' own shadow: cardEdge gives them Android
      // elevation, whose shadow draws OUTSIDE the view box, and a ScrollView
      // clips its children.
      paddingVertical: spacing.s,
      gap: spacing.s,
      flexDirection: "row",
      alignItems: "center",
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      minHeight: 34,
      paddingHorizontal: spacing.m,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.canvas,
      ...cardEdge(scheme, colors),
    },
    chipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    label: {
      ...type.footnote,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    labelActive: {
      color: colors.accent,
      fontWeight: "700",
    },
  }),
);
