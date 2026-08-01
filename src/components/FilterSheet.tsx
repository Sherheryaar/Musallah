import React, { useEffect, useMemo } from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FACILITY_KEYS, FACILITY_LABELS, FacilityKey } from "@/data/places";
import { useTheme } from "@/context/ThemeContext";
import { radius, spacing, type ThemeColors } from "@/lib/theme";

type Props = {
  visible: boolean;
  active: Set<FacilityKey>;
  corroboratedOnly: boolean;
  onToggle: (key: FacilityKey) => void;
  onToggleCorroborated: () => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * All filters behind one button, in a slide-up sheet.
 *
 * Deliberately NOT a native <Modal>: React Native's modal host view was
 * crashing on iOS when combined with react-native-screens while the map
 * bottom sheet was being dragged. A plain absolutely-positioned overlay
 * renders the same UI with no native modal involved.
 */
export default function FilterSheet({
  visible,
  active,
  corroboratedOnly,
  onToggle,
  onToggleCorroborated,
  onClear,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  // Android hardware/gesture back closes the sheet instead of the screen.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  const totalActive = active.size + (corroboratedOnly ? 1 : 0);

  return (
    <View style={styles.backdrop}>
      <TouchableOpacity
        style={styles.backdropTouch}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close filters"
      />
      <View
        style={[
          styles.card,
          { paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.s) },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Filters</Text>
          {active.size > 0 || corroboratedOnly ? (
            <TouchableOpacity onPress={onClear} accessibilityRole="button">
              <Text style={styles.clear}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.subtitle}>
          Only show places with everything you tick. Your choices are saved
          for next time.
        </Text>
        {FACILITY_KEYS.map((key) => {
          const isActive = active.has(key);
          return (
            <TouchableOpacity
              key={key}
              style={styles.row}
              onPress={() => onToggle(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`Filter: ${FACILITY_LABELS[key]}`}
            >
              <Text style={styles.rowLabel}>{FACILITY_LABELS[key]}</Text>
              <View style={[styles.box, isActive && styles.boxActive]}>
                {isActive ? (
                  <MaterialCommunityIcons
                    name="check-bold"
                    size={15}
                    color={colors.canvas}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.sectionTitle}>Data quality</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={onToggleCorroborated}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: corroboratedOnly }}
          accessibilityLabel="Filter: hide unconfirmed places"
        >
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Hide unconfirmed places</Text>
            <Text style={styles.rowHint}>
              Only show places backed by more than one source. Useful when
              you&apos;re travelling and can&apos;t afford a wasted trip.
            </Text>
          </View>
          <View style={[styles.box, corroboratedOnly && styles.boxActive]}>
            {corroboratedOnly ? (
              <MaterialCommunityIcons
                name="check-bold"
                size={15}
                color={colors.canvas}
              />
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.doneButton}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.doneLabel}>
            {totalActive > 0
              ? `Done \u00B7 ${totalActive} filter${
                  totalActive === 1 ? "" : "s"
                } on`
              : "Done"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    zIndex: 50,
    elevation: 50,
  },
  backdropTouch: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    gap: spacing.s,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  clear: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
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
    fontSize: 16,
    color: colors.text,
  },
  rowHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.l,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  doneButton: {
    marginTop: spacing.m,
    minHeight: 48,
    borderRadius: radius.l,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  // canvas, not literal white: the dark theme's accent is a LIGHT green,
  // where white text fails contrast — canvas flips to near-black there.
  doneLabel: {
    color: colors.canvas,
    fontSize: 16,
    fontWeight: "700",
  },
});
