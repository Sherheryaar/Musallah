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

/**
 * "noted" is the out-of-date report shown as filed but not yet sent — see
 * UNDO_WINDOW_MS; "outdated" is the same report once it has gone through.
 */
type Phase =
  | "idle"
  | "sending"
  | "confirmed"
  | "noted"
  | "outdated"
  | "failed";

/**
 * How long an "out of date" report waits behind an Undo before it is sent.
 * These chips sit directly under the times a user is reading, so a mis-tap is
 * likely enough that filing instantly — silently, into a moderation queue the
 * user never sees — is the wrong trade. Long enough to notice and react, short
 * enough that the report still lands while the screen is open.
 */
const UNDO_WINDOW_MS = 5000;

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
  // The held-back "out of date" report, if one is waiting out its Undo
  // window. A ref rather than state because the unmount cleanup must reach
  // the CURRENT pending report, and `send` is captured at scheduling time so
  // the report describes the times the user was actually looking at.
  const pending = useRef<{
    timer: ReturnType<typeof setTimeout>;
    send: () => void;
  } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const held = pending.current;
      if (!held) return;
      pending.current = null;
      clearTimeout(held.timer);
      // Leaving the screen commits rather than cancels: the user was already
      // shown "Noted", so dropping it would make that a lie, and there is no
      // second chance to tell them otherwise. Only Undo cancels. `send`
      // touches state solely behind the `mounted` guard, so nothing here
      // updates a gone component.
      held.send();
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

  /**
   * The actual delivery. Safe to call after unmount — every state write is
   * behind the `mounted` guard, and the cooldown deliberately is not, so an
   * answer that lands on the way out of the screen still counts.
   */
  const deliver = async (verdict: "confirmed" | "outdated") => {
    const jamaat = place.jamaat;
    if (!jamaat) return;
    const message =
      verdict === "confirmed"
        ? buildConfirmationMessage(jamaat, new Date())
        : buildOutdatedMessage(jamaat, new Date());
    const result = await submitJamaatCheck(place, message);
    if (result === "stored") {
      // Cooldown only starts on a DELIVERED answer; a failed send must
      // leave the question available to try again.
      void AsyncStorage.setItem(
        confirmStorageKey(place.id),
        new Date().toISOString(),
      ).catch(() => {});
    }
    if (!mounted.current) return;
    setPhase(result === "stored" ? verdict : "failed");
  };

  const confirm = () => {
    if (phase === "sending" || pending.current || !place.jamaat) return;
    setPhase("sending");
    void deliver("confirmed");
  };

  /**
   * Shows the report as filed straight away but holds the submit, so a
   * mis-tap has somewhere to go. Nothing has been sent while `pending` is
   * set.
   */
  const reportOutdated = () => {
    if (phase === "sending" || pending.current || !place.jamaat) return;
    setPhase("noted");
    const send = () => void deliver("outdated");
    pending.current = {
      send,
      timer: setTimeout(() => {
        pending.current = null;
        // Off "noted" before the network call so the Undo cannot be tapped
        // against a report that is already on its way.
        if (mounted.current) setPhase("outdated");
        send();
      }, UNDO_WINDOW_MS),
    };
  };

  const undoReport = () => {
    const held = pending.current;
    if (!held) return;
    pending.current = null;
    clearTimeout(held.timer);
    setPhase("idle");
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

  // Filed as far as the user is concerned, but still recallable.
  if (phase === "noted") {
    return (
      <View style={styles.thanksRow}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={16}
          color={colors.positive}
        />
        <Text style={styles.thanksText}>Noted {"—"} thank you.</Text>
        <Touchable
          style={styles.undoButton}
          onPress={undoReport}
          accessibilityRole="button"
          accessibilityLabel="Undo the out-of-date report"
        >
          <Text style={styles.inviteLink}>Undo</Text>
        </Touchable>
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
            onPress={confirm}
            disabled={phase === "sending"}
            accessibilityRole="button"
            accessibilityLabel="Yes, the jamaat times are still right"
          >
            <Text style={styles.checkChipLabel}>Still right</Text>
          </Touchable>
          <Touchable
            style={styles.checkChip}
            onPress={reportOutdated}
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
    // Soft-filled pills: the accent tint says "tappable" where the old
    // hairline outline was nearly invisible on the card it sits in.
    checkChip: {
      minHeight: MIN_TARGET,
      justifyContent: "center",
      paddingHorizontal: spacing.l,
      borderRadius: radius.pill,
      backgroundColor: colors.accentSoft,
      // Clips the Android ripple to the rounded corners.
      overflow: "hidden",
    },
    checkChipLabel: {
      ...type.footnote,
      fontWeight: "700",
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
    // Sized like a chip rather than an inline link: it is the only way back
    // from a mis-tap, and it is live for five seconds.
    undoButton: {
      minHeight: MIN_TARGET,
      minWidth: MIN_TARGET,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.s,
      borderRadius: radius.pill,
      overflow: "hidden",
    },
    failText: {
      ...type.footnote,
      color: colors.attention,
    },
  }),
);
