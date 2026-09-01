import React, { useEffect } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OverlaySheet from "./OverlaySheet";
import Touchable from "./Touchable";
import { FACILITY_KEYS, FACILITY_LABELS, FacilityKey } from "@/data/places";
import { useTheme } from "@/context/ThemeContext";
import { elevation } from "@/lib/elevation";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

type Props = {
  visible: boolean;
  active: Set<FacilityKey>;
  corroboratedOnly: boolean;
  savedOnly: boolean;
  onToggle: (key: FacilityKey) => void;
  onToggleCorroborated: () => void;
  onToggleSaved: () => void;
  onClear: () => void;
  onClose: () => void;
};

/** One filter: a label (with an optional explanation) and a checkbox. */
function CheckRow({
  label,
  hint,
  checked,
  accessibilityLabel,
  onToggle,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  accessibilityLabel: string;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Touchable
      style={styles.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      {hint ? (
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowHint}>{hint}</Text>
        </View>
      ) : (
        <Text style={styles.rowLabel}>{label}</Text>
      )}
      <View style={[styles.box, checked && styles.boxActive]}>
        {checked ? (
          <MaterialCommunityIcons
            name="check-bold"
            size={15}
            color={colors.canvas}
          />
        ) : null}
      </View>
    </Touchable>
  );
}

/** All filters behind one button, in a slide-up sheet (see OverlaySheet). */
export default function FilterSheet({
  visible,
  active,
  corroboratedOnly,
  savedOnly,
  onToggle,
  onToggleCorroborated,
  onToggleSaved,
  onClear,
  onClose,
}: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  // The Filters button sits beside the search field, so this sheet routinely
  // opens with the keyboard up — and it is bottom-anchored, which put the
  // last filters and the Done button behind the keyboard with no way to
  // scroll them out.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  const totalActive =
    active.size + (corroboratedOnly ? 1 : 0) + (savedOnly ? 1 : 0);

  return (
    <OverlaySheet
      visible={visible}
      onClose={onClose}
      anchor="bottom"
      zIndex={50}
      closeLabel="Close filters"
      cardStyle={[
        styles.card,
        { paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.s) },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Filters</Text>
        {totalActive > 0 ? (
          <Touchable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            // The destructive action in this sheet, and it was the
            // smallest target in it.
            hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
          >
            <Text style={styles.clear}>Clear all</Text>
          </Touchable>
        ) : null}
      </View>
      {/* Scrolls so the sheet stays usable at large system font sizes: at
          200% the card previously overflowed off the TOP of the screen and
          the title, "Clear all" and the first filters became unreachable. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.subtitle}>
          Only show places with everything you tick. Your choices are saved
          for next time.
        </Text>
        {FACILITY_KEYS.map((key) => (
          <CheckRow
            key={key}
            label={FACILITY_LABELS[key]}
            checked={active.has(key)}
            accessibilityLabel={`Filter: ${FACILITY_LABELS[key]}`}
            onToggle={() => onToggle(key)}
          />
        ))}
        <Text style={styles.sectionTitle}>Your places</Text>
        <CheckRow
          label="Saved places only"
          hint="Only show places you've saved with the heart button — on the map and in the list."
          checked={savedOnly}
          accessibilityLabel="Filter: saved places only"
          onToggle={onToggleSaved}
        />
        <Text style={styles.sectionTitle}>Data quality</Text>
        <CheckRow
          label="Hide unconfirmed places"
          hint="Only show places backed by more than one source. Useful when you're travelling and can't afford a wasted trip."
          checked={corroboratedOnly}
          accessibilityLabel="Filter: hide unconfirmed places"
          onToggle={onToggleCorroborated}
        />
      </ScrollView>

      <Touchable
        style={styles.doneButton}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Text style={styles.doneLabel}>
          {totalActive > 0
            ? `Done · ${totalActive} filter${
                totalActive === 1 ? "" : "s"
              } on`
            : "Done"}
        </Text>
      </Touchable>
    </OverlaySheet>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme: "light" | "dark") =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.canvas,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      padding: spacing.xl,
      gap: spacing.s,
      // Never taller than most of the screen, so the sheet cannot grow off
      // the top when the system font is scaled up.
      maxHeight: "85%",
      // Android draws elevation shadows in black, which is invisible against
      // the dark theme's near-black backdrop — the border is what gives the
      // sheet an edge there.
      borderTopWidth: 1,
      borderColor: colors.border,
      ...elevation(scheme, "sheet"),
    },
    scroll: {
      // flexShrink, NOT flex: 1 — flex would make the scroll region claim the
      // whole 85% card even when there are only six short rows, stranding the
      // Done button at the bottom of a mostly empty sheet.
      flexShrink: 1,
    },
    scrollContent: {
      gap: spacing.s,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      ...type.title4,
      fontWeight: "700",
      color: colors.text,
    },
    clear: {
      ...type.subhead,
      fontWeight: "600",
      color: colors.accent,
    },
    subtitle: {
      ...type.footnote,
      color: colors.textSecondary,
      marginBottom: spacing.s,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      minHeight: 48,
      gap: spacing.m,
    },
    rowTextWrap: {
      flex: 1,
    },
    rowLabel: {
      ...type.body,
      color: colors.text,
    },
    rowHint: {
      ...type.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sectionTitle: {
      ...type.eyebrow,
      color: colors.textSecondary,
      marginTop: spacing.l,
    },
    box: {
      width: 26,
      height: 26,
      borderRadius: radius.m,
      borderWidth: 2,
      // controlBorder: unchecked, this box IS the checkbox — there is no label
      // inside it and no fill. In `border` it measured 1.26:1 on canvas, so all
      // eight checkboxes in this sheet were invisible until ticked.
      borderColor: colors.controlBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    boxActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    doneButton: {
      marginTop: spacing.m,
      minHeight: 52,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      // Clips the Android ripple to the rounded corners.
      overflow: "hidden",
    },
    // canvas, not literal white: the dark theme's accent is a LIGHT green,
    // where white text fails contrast — canvas flips to near-black there.
    doneLabel: {
      color: colors.canvas,
      ...type.body,
      fontWeight: "700",
    },
  }),
);
