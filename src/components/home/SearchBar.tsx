import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "@/components/Touchable";
import { useTheme } from "@/context/ThemeContext";
import { cardEdge, clipRipple } from "@/lib/elevation";
import { MIN_TARGET } from "@/lib/metrics";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

type Props = {
  query: string;
  onChangeQuery: (text: string) => void;
  /** Return key / search: geocode the text as an area. */
  onSubmit: () => void;
  /** True while there is anything to clear — typed text or an anchored area. */
  canClear: boolean;
  onClear: () => void;
  filterCount: number;
  filtersOpen: boolean;
  onOpenFilters: () => void;
};

/**
 * The search pill and the Filters button. The box doubles as the area anchor
 * ("Near Stratford" lives in the input, not a separate chip) and the live
 * name filter; one ✕ clears whichever it currently is.
 */
export default function SearchBar({
  query,
  onChangeQuery,
  onSubmit,
  canClear,
  onClear,
  filterCount,
  filtersOpen,
  onOpenFilters,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchInputWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder={'Try "Stratford" or a masjid name...'}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search for an area or place"
        />
        {canClear ? (
          <Touchable
            style={styles.clearButton}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            // The target box is deliberately wider than the ✕ it draws, so a
            // bounded ripple would flash a square of empty input. A circular
            // one lands on the glyph, which is what the finger aimed at.
            borderless
            rippleRadius={20}
          >
            <View style={styles.clearBadge}>
              <MaterialCommunityIcons
                name="close"
                size={14}
                color={colors.textSecondary}
              />
            </View>
          </Touchable>
        ) : null}
      </View>
      <Touchable
        style={[
          styles.filterButton,
          filterCount > 0 && styles.filterButtonActive,
        ]}
        onPress={onOpenFilters}
        accessibilityRole="button"
        accessibilityLabel={
          filterCount > 0 ? `Filters, ${filterCount} on` : "Filters"
        }
        accessibilityState={{ expanded: filtersOpen }}
      >
        <Text
          style={[
            styles.filterButtonLabel,
            filterCount > 0 && styles.filterButtonLabelActive,
          ]}
        >
          {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
        </Text>
      </Touchable>
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
    searchRow: {
      flexDirection: "row",
      gap: spacing.s,
    },
    searchInputWrap: {
      flex: 1,
      justifyContent: "center",
    },
    // A floating pill, the redesign's signature control: no outline, just a
    // soft lift off the map. Dark mode keeps its hairline via cardEdge — an
    // unlit dark pill over dark map tiles has no edge at all.
    searchInput: {
      minHeight: 48,
      backgroundColor: colors.canvas,
      borderRadius: radius.pill,
      ...cardEdge(scheme, colors),
      paddingLeft: spacing.l + spacing.xs,
      // Room for the ✕ so text never runs under it — this clears the whole
      // clearBadge below, not just the glyph, and must move with it.
      paddingRight: spacing.xxl + spacing.l,
      ...type.callout,
      fontWeight: "500",
      color: colors.text,
    },
    // MIN_TARGET lives on the BOX, not on hitSlop: Touchable hoists width and
    // height onto its outer wrapper while hitSlop lands on the Pressable
    // inside it, and neither platform dispatches a touch that already missed
    // the wrapper — so slop around a 24pt box is unreachable, and a near miss
    // lands in the TextInput and raises the keyboard instead of clearing the
    // search. The box is transparent; clearBadge is the part that is seen.
    clearButton: {
      position: "absolute",
      right: spacing.xs,
      width: MIN_TARGET,
      height: MIN_TARGET,
      alignItems: "center",
      justifyContent: "center",
    },
    clearBadge: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
    },
    filterButton: {
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: spacing.l,
      backgroundColor: colors.canvas,
      borderRadius: radius.pill,
      ...cardEdge(scheme, colors),
      ...clipRipple,
    },
    // Filters on = the pill fills with the accent. Louder than a tinted
    // outline on purpose: an active filter silently hides places, which is
    // exactly the state that must never be missable.
    filterButtonActive: {
      backgroundColor: colors.accent,
      // Only meaningful in dark mode, where cardEdge drew a hairline.
      borderColor: colors.accent,
    },
    filterButtonLabel: {
      ...type.subhead,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    filterButtonLabelActive: {
      color: colors.canvas,
    },
  }),
);
