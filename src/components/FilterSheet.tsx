import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { FACILITY_LABELS, FacilityKey } from "@/data/places";
import { colors, radius, spacing } from "@/lib/theme";

const FACILITY_KEYS = Object.keys(FACILITY_LABELS) as FacilityKey[];

type Props = {
  visible: boolean;
  active: Set<FacilityKey>;
  onToggle: (key: FacilityKey) => void;
  onClear: () => void;
  onClose: () => void;
};

/** All filters behind one button, in a slide-up sheet. */
export default function FilterSheet({
  visible,
  active,
  onToggle,
  onClear,
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel="Close filters"
        />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Filters</Text>
            {active.size > 0 ? (
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
                  {isActive ? <Text style={styles.tick}>{"\u2713"}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.doneLabel}>
              {active.size > 0
                ? `Done \u00B7 ${active.size} filter${
                    active.size === 1 ? "" : "s"
                  } on`
                : "Done"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
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
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text,
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
  tick: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  doneButton: {
    marginTop: spacing.m,
    minHeight: 48,
    borderRadius: radius.l,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  doneLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
