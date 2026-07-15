import React from "react";
import {
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { FACILITY_LABELS, FacilityKey } from "@/data/places";
import { colors, spacing, radius } from "@/lib/theme";

type Props = {
  active: Set<FacilityKey>;
  onToggle: (key: FacilityKey) => void;
};

/** Horizontal row of facility filter chips. Tap to toggle. */
export default function FilterChips({ active, onToggle }: Props) {
  const keys = Object.keys(FACILITY_LABELS) as FacilityKey[];
  const chips = keys.map((key) => {
        const isActive = active.has(key);
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onToggle(key)}
            style={[styles.chip, isActive && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={ { selected: isActive } } 
            accessibilityLabel={`Filter: ${FACILITY_LABELS[key]}`}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {FACILITY_LABELS[key]}
            </Text>
          </TouchableOpacity>
        );
  });

  // On web, wrap chips onto multiple lines instead of horizontal scrolling —
  // mouse and trackpad users can't easily scroll sideways.
  if (Platform.OS === "web") {
    return <View style={[styles.row, styles.wrapRow]}>{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Stops the chip bar from stretching vertically or being overlapped by the list.
  bar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
  },
  wrapRow: {
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    minHeight: 44,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.accent,
    fontWeight: "600",
  },
});
