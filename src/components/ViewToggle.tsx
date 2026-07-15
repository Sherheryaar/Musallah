import React from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";

import { colors, spacing, radius } from "@/lib/theme";

type ViewMode = "list" | "map";

type Props = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
};

const SEGMENTS: { key: ViewMode; label: string }[] = [
  { key: "list", label: "List" },
  { key: "map", label: "Map" },
];

export default function ViewToggle({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      {SEGMENTS.map((segment) => {
        const isActive = value === segment.key;
        return (
          <TouchableOpacity
            key={segment.key}
            style={[styles.segment, isActive && styles.segmentActive]}
            onPress={() => onChange(segment.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={segment.label}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {segment.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.m,
  },
  segmentActive: {
    backgroundColor: colors.accentSoft,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.accent,
  },
});
