import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Location from "expo-location";

import { useHeaderHeight } from "@react-navigation/elements";

import Touchable from "./Touchable";
import { useOverlayLock } from "@/context/OverlayContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { elevation } from "@/lib/elevation";
import { MIN_TARGET } from "@/lib/metrics";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

// First run, before anything asks for anything.
//
// Two problems this exists to solve:
//
// 1. The location permission was requested cold on mount, with no
//    explanation. iOS grants exactly ONE prompt — deny it and the dialog
//    never returns — after which every distance and every prayer time
//    silently falls back to central London, with no visible cause. A
//    sentence of context before the prompt is the difference between a
//    working app and a permanently degraded one.
//
// 2. Asr is shipped on 2 mithl (Hanafi) by default and the explanation of
//    that choice is behind the gear icon. A Shafi'i user therefore gets a
//    systematically late Asr on every screen and is never told there is a
//    choice — so it is offered here, once, in the same words Settings uses.

const STORAGE_KEY = "onboarding:v1";

// Shared with the header strip this overlay cannot reach on its own, so the
// two halves of the scrim are the same colour. See OverlayContext — on this
// screen the header is how a first-run user reached Qibla, which asks for
// location on mount and spends the one prompt iOS ever gives.
const scrim = (scheme: "light" | "dark") =>
  scheme === "dark" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.45)";

type Props = {
  /** Called once the user has finished — the caller then reads location. */
  onDone: () => void;
};

export default function Onboarding({ onDone }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const headerHeight = useHeaderHeight();
  const { settings, updateSettings } = useSettings();
  // `null` = storage not read yet. Gating on "has hydrated" rather than on
  // "the flag is absent" is what stops first-run users seeing a flash of
  // the map before this appears.
  const [seen, setSeen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // Held in a ref so the resolution effect below never re-runs just because
  // the caller re-created its callback.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (flag) => {
        if (cancelled) return;
        if (flag) {
          setSeen(true);
          onDoneRef.current();
          return;
        }
        // Already granted (a reinstall, or the flag was cleared)? Then
        // there is nothing to explain — don't re-interrupt.
        // getForegroundPermissionsAsync only READS; it never prompts.
        const current = await Location.getForegroundPermissionsAsync().catch(
          () => null,
        );
        if (cancelled) return;
        const granted = current?.status === "granted";
        setSeen(granted);
        if (granted) onDoneRef.current();
      })
      .catch(() => {
        if (cancelled) return;
        setSeen(true);
        onDoneRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "1").catch(() => {});
    setSeen(true);
    onDone();
  };

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    // The one prompt, fired from a button the user pressed knowing why.
    await Location.requestForegroundPermissionsAsync().catch(() => {});
    setBusy(false);
    void finish();
  };

  // Dim and disarm the header while this owns the screen. No progress value:
  // this card has no entry animation to stay in step with.
  useOverlayLock(seen === false, {
    headerHeight,
    color: scrim(scheme),
  });

  if (seen !== false) return null;

  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.card}>
        {/* The prose and the madhab choice scroll; the buttons below do not.
            This card is modal and has no dismiss affordance other than those
            buttons, so at large system font sizes it grew past the top and
            bottom of the screen and the user could not get out of onboarding
            at all — the app was unusable before it started. FilterSheet
            already carries this exact fix (its own comment describes the same
            bug at 200%); this component never got it. Pinning the actions
            outside the scroll region means they cannot go off-screen however
            tall the content gets. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
        <MaterialCommunityIcons
          name="map-marker-radius-outline"
          size={34}
          color={colors.accent}
        />
        <Text style={styles.title}>Find your nearest place to pray</Text>
        <Text style={styles.body}>
          Your location is used on your phone to sort places by distance and
          to work out prayer times. It never leaves your device — there is no
          account, no tracking, and nothing is uploaded.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.question}>When does Asr begin for you?</Text>
        <Text style={styles.hint}>
          Timetables often print both. You can change this any time in
          Settings.
        </Text>
        <View style={styles.choices}>
          {(
            [
              { key: "shafi", label: "1 mithl", sub: "Shafi'i, Maliki, Hanbali" },
              { key: "hanafi", label: "2 mithl", sub: "Hanafi" },
            ] as const
          ).map(({ key, label, sub }) => {
            const selected = settings.madhab === key;
            return (
              <Touchable
                key={key}
                style={[styles.choice, selected && styles.choiceSelected]}
                // Written through updateSettings so it is recorded as a
                // DELIBERATE choice, not left on the shipped default.
                onPress={() => updateSettings({ madhab: key })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Asr at ${label}, ${sub}`}
              >
                <Text
                  style={[
                    styles.choiceLabel,
                    selected && styles.choiceLabelSelected,
                  ]}
                >
                  {label}
                </Text>
                <Text style={styles.choiceSub}>{sub}</Text>
              </Touchable>
            );
          })}
        </View>

        <View style={styles.divider} />

        <Text style={styles.body}>
          Prayer times and the Qibla compass are calculated on your phone, so
          they keep working with no signal at all.
        </Text>
        </ScrollView>

        <Touchable
          style={styles.primary}
          onPress={allow}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Allow location access"
        >
          <Text style={styles.primaryLabel}>Allow location</Text>
        </Touchable>
        <Touchable
          style={styles.secondary}
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Continue without location"
        >
          <Text style={styles.secondaryLabel}>Not now</Text>
        </Touchable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme: "light" | "dark") =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: scrim(scheme),
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.l,
      zIndex: 80,
      elevation: 80,
    },
    card: {
      width: "100%",
      maxWidth: 460,
      backgroundColor: colors.canvas,
      borderRadius: radius.xl,
      // Value-only across schemes — see cardEdge in elevation.ts for why a
      // theme switch must never add or remove native props on a mounted view.
      borderWidth: scheme === "dark" ? 1 : 0,
      borderColor: colors.border,
      padding: spacing.xl,
      gap: spacing.m,
      alignItems: "flex-start",
      // Never taller than the screen, so the pinned buttons below always have
      // somewhere to sit.
      maxHeight: "100%",
      ...elevation(scheme, "floating"),
    },
    scroll: {
      // flexShrink, NOT flex: 1 — flex would make the scroll region claim the
      // full card height even when the content is short, stranding the buttons
      // at the bottom of a mostly empty card. Same reasoning as FilterSheet.
      flexShrink: 1,
      alignSelf: "stretch",
    },
    scrollContent: {
      gap: spacing.m,
      alignItems: "flex-start",
    },
    title: {
      ...type.title3,
      fontWeight: "700",
      color: colors.text,
    },
    body: {
      ...type.subhead,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      alignSelf: "stretch",
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    question: {
      ...type.callout,
      fontWeight: "700",
      color: colors.text,
    },
    hint: {
      ...type.footnote,
      color: colors.textSecondary,
    },
    choices: {
      flexDirection: "row",
      gap: spacing.s,
      alignSelf: "stretch",
    },
    choice: {
      flex: 1,
      minHeight: MIN_TARGET,
      justifyContent: "center",
      paddingVertical: spacing.s,
      paddingHorizontal: spacing.m,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    choiceSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    choiceLabel: {
      ...type.callout,
      fontWeight: "700",
      color: colors.text,
    },
    choiceLabelSelected: {
      color: colors.accent,
    },
    choiceSub: {
      ...type.caption,
      color: colors.textSecondary,
    },
    primary: {
      alignSelf: "stretch",
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      overflow: "hidden",
    },
    primaryLabel: {
      ...type.body,
      fontWeight: "700",
      // canvas, not white: the dark accent is light enough that white fails.
      color: colors.canvas,
    },
    secondary: {
      alignSelf: "stretch",
      minHeight: MIN_TARGET,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      overflow: "hidden",
    },
    secondaryLabel: {
      ...type.callout,
      fontWeight: "600",
      color: colors.textSecondary,
    },
  }),
);
