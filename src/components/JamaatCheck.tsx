import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import Touchable from "./Touchable";
import type { Place } from "@/data/places";
import { submitJamaatCheck } from "@/lib/feedback";
import {
  buildConfirmationMessage,
  buildOutdatedMessage,
  canContributeJamaat,
  confirmStorageKey,
  shouldOfferConfirmation,
} from "@/lib/jamaatContribution";
import { useTheme } from "@/context/ThemeContext";
import { createThemedStyles } from "@/lib/themedStyles";
import { MIN_TARGET } from "@/lib/metrics";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

// The community half of the prayer-times table.
//
// Jamaat times are the app's weakest data (136 of 2,244 places carry them)
// and the only people who can fix that are the ones standing in the
// building. So contributing is made as close to free as possible:
//
//   - With times on record: "Still right?" — one tap either way. The
//     answer goes through the existing submissions pipe as a structured
//     message (see src/lib/jamaatContribution.ts), so the review side can
//     count confirmations per place and treat a pile of "outdated" taps as
//     a refresh queue, without anyone having typed a word.
//   - Without times: a single line inviting them, wired by the parent to a
//     suggestion sheet whose topic chips double as provenance.
//
// One tap per place per month per device (AsyncStorage cooldown): a regular
// attendee is exactly who we want a monthly pulse from, and no one gets
// nagged on every visit.

type Phase = "idle" | "sending" | "confirmed" | "outdated" | "failed";

type Props = {
  place: Place;
  /** Open the add/correct-times sheet (owned by the screen root). */
  onAddTimes: () => void;
};

export default function JamaatCheck({ place, onAddTimes }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  // null = storage not read yet; render nothing rather than flashing the
  // question at someone who answered it last week.
  const [offer, setOffer] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  // The tap outlives the screen (user answers and immediately leaves), so
  // the write must not be applied to state after unmount.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(confirmStorageKey(place.id))
      .then((last) => {
        if (!cancelled) setOffer(shouldOfferConfirmation(last, new Date()));
      })
      .catch(() => {
        // Unreadable storage means "never asked" — the wrong failure mode
        // would be never asking again.
        if (!cancelled) setOffer(true);
      });
    return () => {
      cancelled = true;
    };
  }, [place.id]);

  const send = async (verdict: "confirmed" | "outdated") => {
    if (phase === "sending" || !place.jamaat) return;
    setPhase("sending");
    const message =
      verdict === "confirmed"
        ? buildConfirmationMessage(place.jamaat, new Date())
        : buildOutdatedMessage(place.jamaat, new Date());
    const result = await submitJamaatCheck(place, message);
    if (!mounted.current) return;
    if (result === "stored") {
      setPhase(verdict);
      // Cooldown only starts on a DELIVERED answer; a failed send must
      // leave the question available to try again.
      void AsyncStorage.setItem(
        confirmStorageKey(place.id),
        new Date().toISOString(),
      ).catch(() => {});
    } else {
      setPhase("failed");
    }
  };

  if (!canContributeJamaat(place)) return null;

  // ---------------------------------------------------------------------
  // No times on record: the invitation IS the feature for 94% of places.
  // ---------------------------------------------------------------------
  if (!place.jamaat) {
    return (
      <View style={styles.inviteRow}>
        <Text style={styles.inviteText}>Know the jamaat times here?</Text>
        <Touchable
          onPress={onAddTimes}
          accessibilityRole="button"
          accessibilityLabel="Add the jamaat times"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.inviteLink}>Add them</Text>
        </Touchable>
      </View>
    );
  }

  // ---------------------------------------------------------------------
  // Times on record: the monthly pulse.
  // ---------------------------------------------------------------------
  if (offer !== true && phase === "idle") return null;

  if (phase === "confirmed") {
    return (
      <View style={styles.thanksRow}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={16}
          color={colors.positive}
        />
        <Text style={styles.thanksText}>
          JazakAllah khair {"—"} noted as still correct.
        </Text>
      </View>
    );
  }

  if (phase === "outdated") {
    return (
      <View style={styles.thanksRow}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={16}
          color={colors.positive}
        />
        <Text style={styles.thanksText}>Noted {"—"} thank you. </Text>
        <Touchable
          onPress={onAddTimes}
          accessibilityRole="button"
          accessibilityLabel="Send the correct jamaat times"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.inviteLink}>Know the new times?</Text>
        </Touchable>
      </View>
    );
  }

  return (
    <View style={styles.checkBlock}>
      <View style={styles.checkRow}>
        <Text style={styles.checkQuestion}>Are these times still right?</Text>
        <View style={styles.checkActions}>
          <Touchable
            style={styles.checkChip}
            onPress={() => send("confirmed")}
            disabled={phase === "sending"}
            accessibilityRole="button"
            accessibilityLabel="Yes, the jamaat times are still right"
          >
            <Text style={styles.checkChipLabel}>Still right</Text>
          </Touchable>
          <Touchable
            style={styles.checkChip}
            onPress={() => send("outdated")}
            disabled={phase === "sending"}
            accessibilityRole="button"
            accessibilityLabel="No, the jamaat times are out of date"
          >
            <Text style={styles.checkChipLabel}>Out of date</Text>
          </Touchable>
        </View>
      </View>
      {phase === "failed" ? (
        <Text style={styles.failText}>
          Couldn&apos;t send {"—"} check your connection and tap again.
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.xs,
      // The row that follows the prayer table; minHeight keeps the inline
      // link a comfortable target without a boxy button under a table of
      // quiet dashes.
      minHeight: MIN_TARGET,
    },
    inviteText: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    inviteLink: {
      ...type.footnote,
      fontWeight: "700",
      color: colors.accent,
    },
    checkBlock: {
      gap: spacing.s,
    },
    checkRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.s,
      justifyContent: "space-between",
    },
    checkQuestion: {
      ...type.footnote,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    checkActions: {
      flexDirection: "row",
      gap: spacing.s,
    },
    checkChip: {
      minHeight: MIN_TARGET,
      justifyContent: "center",
      paddingHorizontal: spacing.m,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      // Clips the Android ripple to the rounded corners.
      overflow: "hidden",
    },
    checkChipLabel: {
      ...type.footnote,
      fontWeight: "600",
      color: colors.accent,
    },
    thanksRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.xs,
      minHeight: MIN_TARGET,
    },
    thanksText: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    failText: {
      ...type.footnote,
      color: colors.attention,
    },
  }),
);
