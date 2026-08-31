import React, { useCallback, useMemo } from "react";
import { Platform, Text, View, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "./Touchable";

import {
  FACILITY_KEYS,
  FACILITY_LABELS,
  Place,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import {
  FACILITY_ICONS,
  PLACE_TYPE_ICONS,
  TRAVEL_MODE_ICONS,
} from "@/lib/icons";
import { useTheme } from "@/context/ThemeContext";
import { formatTravelEstimate } from "@/lib/distance";
import { cardEdge } from "@/lib/elevation";
import { createThemedStyles } from "@/lib/themedStyles";
import {
  numeric,
  placeTypeColors,
  spacing,
  radius,
  type,
  type ThemeColors,
} from "@/lib/theme";

type Props = {
  place: Place;
  distanceLabel?: string;
  /**
   * Kilometres from the user, for the travel-time chip. A number, not the
   * computed estimate object: the list re-renders every 30s or 250m of
   * movement, and a fresh object literal here would fail memo's shallow
   * compare and re-render every row on every GPS tick.
   */
  distanceKm?: number;
  /** Called with the place id — keeps the prop stable so memo works. */
  onPress: (id: string) => void;
};

/**
 * One row in the results list: type tile, name (+ verified rosette),
 * Jumu'ah time, and the available facilities as an icon strip. Icons show
 * only what a place HAS — a row of crossed-out absences is noise, and
 * "not listed" isn't the same as "not there".
 */
function PlaceCard({ place, distanceLabel, distanceKm, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
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

  const travel = useMemo(
    () => (distanceKm === undefined ? null : formatTravelEstimate(distanceKm)),
    [distanceKm],
  );

  const accessibilityDistance = travel
    ? `${distanceLabel ?? "distance unknown"}, about ${travel.label}`
    : (distanceLabel ?? "distance unknown");

  return (
    <Touchable
      style={styles.card}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${PLACE_TYPE_LABELS[place.type]}, ${accessibilityDistance}${
        place.confidence === "verified" ? ", verified" : ""
      }. ${facilitiesLabel}`}
    >
      {/* Tile colour matches the place's map pin and the map legend — the
          fill is the same hue at 14% alpha, so each row carries its type's
          colour without shouting it. */}
      <View
        style={[
          styles.typeTile,
          { backgroundColor: placeTypeColors[place.type] + "24" },
        ]}
      >
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
                {/* A non-breaking space: a name that exactly fills the line
                    otherwise pushed the rosette onto a line of its own. It
                    now wraps together with the last word. */}
                {"\u00A0"}
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={15}
                  color={colors.accent}
                />
              </>
            ) : null}
          </Text>
          {/* "6 min", never "6m" — the chip sits beside formatDistance's own
              "350 m", where an abbreviated minute reads as a distance. */}
          {distanceLabel ? (
            <Text style={styles.distance}>
              {travel ? (
                <>
                  <MaterialCommunityIcons
                    name={TRAVEL_MODE_ICONS[travel.mode]}
                    size={12}
                    color={colors.accent}
                  />
                  {` ${travel.minutes} min · `}
                </>
              ) : null}
              {distanceLabel}
            </Text>
          ) : null}
        </View>

        {place.jumuahTimes?.length ? (
          <View style={styles.jumuahBadge}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={13}
              color={colors.accent}
            />
            <Text style={styles.jumuahText}>
              Jumu'ah {place.jumuahTimes.join(" & ")}
            </Text>
          </View>
        ) : place.jamaat ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons
              name="calendar-clock"
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.metaText}>
              Jamaat timetable available
            </Text>
          </View>
        ) : null}

        {available.length > 0 ? (
          // Decorative, and hidden from screen readers on both platforms:
          // these glyphs carry no text of their own, so a reader announces
          // them as raw icon-font characters. The words are already in the
          // card's own accessibilityLabel (facilitiesLabel above), which is
          // the one place they should be spoken.
          <View
            style={styles.facilityRow}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
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

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.m,
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    ...cardEdge(scheme, colors),
    padding: spacing.l,
    // Android only: keeps the ripple inside the rounded corners (the
    // elevation shadow survives — it draws from the outline). iOS must NOT
    // clip, or masksToBounds erases the card's shadow.
    ...Platform.select({ android: { overflow: "hidden" as const } }),
  },
  typeTile: {
    width: 44,
    height: 44,
    borderRadius: radius.l,
    // Fill comes per-type at the call site; this is the fallback.
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
    ...type.body,
    fontWeight: "700",
    color: colors.text,
  },
  // Pill chip: reads as "at a glance" info rather than body text.
  distance: {
    ...type.footnote,
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
    ...type.footnote,
    color: colors.textSecondary,
  },
  jumuahBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.s + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  jumuahText: {
    ...type.caption,
    fontWeight: "700",
    color: colors.accent,
    ...numeric,
  },
  facilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
  },
}),
);
