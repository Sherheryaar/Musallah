import React from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import {
  FACILITY_LABELS,
  FacilityKey,
  Place,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import { colors, spacing, radius } from "@/lib/theme";

type Props = {
  place: Place;
  distanceLabel?: string;
  onPress: () => void;
};

/** One row in the results list: name, type, distance, key facilities. */
export default function PlaceCard({ place, distanceLabel, onPress }: Props) {
  const availableFacilities = (
    Object.keys(FACILITY_LABELS) as FacilityKey[]
  ).filter((key) => place.facilities[key]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${
        distanceLabel ?? "distance unknown"
      }`}
    >
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={2}>
          {place.name}
        </Text>
        {distanceLabel ? (
          <Text style={styles.distance}>{distanceLabel}</Text>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {PLACE_TYPE_LABELS[place.type]}
          </Text>
        </View>
        {place.jumuahTimes?.length ? (
          <Text style={styles.metaText}>
            Jumu'ah {place.jumuahTimes.join(" & ")}
          </Text>
        ) : null}
      </View>

      {availableFacilities.length > 0 ? (
        <Text style={styles.facilities} numberOfLines={1}>
          {availableFacilities.map((key) => FACILITY_LABELS[key]).join(" · ")}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.s,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.m,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 22,
  },
  distance: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
  },
  typeBadge: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.m,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  typeBadgeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  metaText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  facilities: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
