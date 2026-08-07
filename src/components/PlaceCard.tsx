import React, { useCallback, useMemo } from "react";
import { Text, View, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "./Touchable";

import {
  FACILITY_KEYS,
  FACILITY_LABELS,
  Place,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import { FACILITY_ICONS, PLACE_TYPE_ICONS } from "@/lib/icons";
import { useTheme } from "@/context/ThemeContext";
import {
  numeric,
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

/**
 * One row in the results list: type tile, name (+ verified rosette),
 * Jumu'ah time, and the available facilities as an icon strip. Icons show
 * only what a place HAS — a row of crossed-out absences is noise, and
 * "not listed" isn't the same as "not there".
 */
function PlaceCard({ place, distanceLabel, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Memoized: recomputing per row on every list render adds up with
  // hundreds of places.
  const available = useMemo(
    () => FACILITY_KEYS.filter((key) => place.facilities[key]),
    [place.facilities],
  );

  const handlePress = useCallback(() => onPress(place.id), [onPress, place.id]);

  const facilitiesLabel =
    available.length > 0
      ? `Facilities: ${available.map((key) => FACILITY_LABELS[key]).join(", ")}`
      : "";

  return (
    <Touchable
      style={styles.card}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${PLACE_TYPE_LABELS[place.type]}, ${
        distanceLabel ?? "distance unknown"
      }${place.confidence === "verified" ? ", verified" : ""}. ${facilitiesLabel}`}
    >
      {/* Tile colour matches the place's map pin and the map legend. */}
      <View style={styles.typeTile}>
        <MaterialCommunityIcons
          name={PLACE_TYPE_ICONS[place.type]}
          size={22}
          color={placeTypeColors[place.type]}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={2}>
            {place.name}
            {place.confidence === "verified" ? (
              <>
                {" "}
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={15}
                  color={colors.accent}
                />
              </>
            ) : null}
          </Text>
          {distanceLabel ? (
            <Text style={styles.distance}>{distanceLabel}</Text>
          ) : null}
        </View>

        {place.jumuahTimes?.length ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.metaText}>
              Jumu'ah {place.jumuahTimes.join(" & ")}
            </Text>
          </View>
        ) : null}

        {available.length > 0 ? (
          <View style={styles.facilityRow}>
            {available.map((key) => (
              <MaterialCommunityIcons
                key={key}
                name={FACILITY_ICONS[key]}
                size={17}
                color={colors.accent}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Touchable>
  );
}

// React.memo: rows only re-render when their own place/distance changes,
// not on every keystroke, GPS tick, or unrelated screen state change.
export default React.memo(PlaceCard);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.m,
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    // Keeps Android's ripple inside the card's rounded corners.
    overflow: "hidden",
  },
  typeTile: {
    width: 42,
    height: 42,
    borderRadius: radius.l,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: spacing.s,
    minWidth: 0,
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
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s + 2,
    paddingVertical: 3,
    overflow: "hidden",
    alignSelf: "flex-start",
    ...numeric,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  facilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
  },
});
