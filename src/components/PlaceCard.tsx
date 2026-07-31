import React, { useCallback, useMemo } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import {
  FACILITY_LABELS,
  FacilityKey,
  Place,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import { useTheme } from "@/context/ThemeContext";
import {
  placeTypeColors,
  spacing,
  radius,
  type ThemeColors,
} from "@/lib/theme";

type Props = {
  place: Place;
  distanceLabel?: string;
  /** Called with the place id — keeps the prop stable so memo works. */
  onPress: (id: string) => void;
};

/** One row in the results list: name, type, distance, key facilities. */
function PlaceCard({ place, distanceLabel, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Memoized: recomputing keys/filter/join for every row on every list
  // render adds up with hundreds of places.
  const facilitiesLabel = useMemo(
    () =>
      (Object.keys(FACILITY_LABELS) as FacilityKey[])
        .filter((key) => place.facilities[key])
        .map((key) => FACILITY_LABELS[key])
        .join(" \u00b7 "),
    [place.facilities],
  );

  const handlePress = useCallback(() => onPress(place.id), [onPress, place.id]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
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
        {/* Dot colour matches the place's map pin and the map legend. */}
        <View style={styles.typeBadge}>
          <View
            style={[
              styles.typeDot,
              { backgroundColor: placeTypeColors[place.type] },
            ]}
          />
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

      {facilitiesLabel.length > 0 ? (
        <Text style={styles.facilities} numberOfLines={1}>
          {facilitiesLabel}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// React.memo: rows only re-render when their own place/distance changes,
// not on every keystroke, GPS tick, or unrelated screen state change.
export default React.memo(PlaceCard);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  // Pill chip: reads as "at a glance" info rather than body text.
  distance: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: "700",
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.s + 2,
    paddingVertical: 3,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.m,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  typeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
