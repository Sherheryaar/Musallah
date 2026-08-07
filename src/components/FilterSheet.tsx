import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Touchable from "./Touchable";
import { FACILITY_KEYS, FACILITY_LABELS, FacilityKey } from "@/data/places";
import { useTheme } from "@/context/ThemeContext";
import { elevation } from "@/lib/elevation";
import { radius, spacing, type ThemeColors } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useSheetAnimation } from "@/lib/useSheetAnimation";

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
  savedOnly,
  onToggle,
  onToggleCorroborated,
  onToggleSaved,
  onClear,
  onClose,
}: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, scheme), [colors, scheme]);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { mounted, progress } = useSheetAnimation(visible, reduceMotion);
  // Cached in a ref, with a sensible fallback: measuring is only possible
  // AFTER the first layout, and without the fallback the very first open
  // would slide from 0 and appear not to move at all.
  const cardHeight = useRef(420);

  // Android hardware/gesture back closes the sheet instead of the screen.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!mounted) return null;

  const totalActive =
    active.size + (corroboratedOnly ? 1 : 0) + (savedOnly ? 1 : 0);

  return (
    // accessibilityViewIsModal goes on the BACKDROP, not the card: it makes
    // VoiceOver ignore this view's SIBLINGS, and the siblings that need
    // ignoring are the map, the search box and the list underneath. Without
    // it the reader swiped straight through the scrim into the screen below.
    //
    // onAccessibilityEscape is the iOS counterpart to the Android
    // BackHandler above — the two-finger-Z gesture — not a duplicate of it.
    <Animated.View
      style={[styles.backdrop, { opacity: progress }]}
      // Without this the fading-out scrim keeps eating taps for the whole
      // 180ms exit.
      pointerEvents={visible ? "auto" : "none"}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
    >
      <Touchable
        style={styles.backdropTouch}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close filters"
        // The scrim is a big empty target that reads as noise in the
        // rotor; the header's own close affordances cover this action.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Animated.View
        onLayout={(e) => {
          cardHeight.current = e.nativeEvent.layout.height;
        }}
        style={[
          styles.card,
          { paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.s) },
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [cardHeight.current, 0],
                }),
              },
            ],
          },
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
        {/* Scrolls so the sheet stays usable at large system font sizes.
            At 200% the card previously overflowed off the TOP of the screen
            and the title, "Clear all" and the first filters became
            unreachable, with nothing to scroll. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
        <Text style={styles.subtitle}>
          Only show places with everything you tick. Your choices are saved
          for next time.
        </Text>
        {FACILITY_KEYS.map((key) => {
          const isActive = active.has(key);
          return (
            <Touchable
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
            </Touchable>
          );
        })}
        <Text style={styles.sectionTitle}>Your places</Text>
        <Touchable
          style={styles.row}
          onPress={onToggleSaved}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: savedOnly }}
          accessibilityLabel="Filter: saved places only"
        >
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>Saved places only</Text>
            <Text style={styles.rowHint}>
              Only show places you&apos;ve saved with the heart button — on
              the map and in the list.
            </Text>
          </View>
          <View style={[styles.box, savedOnly && styles.boxActive]}>
            {savedOnly ? (
              <MaterialCommunityIcons
                name="check-bold"
                size={15}
                color={colors.canvas}
              />
            ) : null}
          </View>
        </Touchable>
        <Text style={styles.sectionTitle}>Data quality</Text>
        <Touchable
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
        </Touchable>
        </ScrollView>

        <Touchable
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
        </Touchable>
      </Animated.View>
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors, scheme: "light" | "dark") =>
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
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  // canvas, not literal white: the dark theme's accent is a LIGHT green,
  // where white text fails contrast — canvas flips to near-black there.
  doneLabel: {
    color: colors.canvas,
    fontSize: 16,
    fontWeight: "700",
  },
});
