import React, { useCallback, useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";

import Touchable from "./Touchable";
import { MIN_TARGET } from "@/lib/metrics";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";

// Why a prayer app has to nag about two Android settings.
//
// The times themselves are exact — they are computed on the device — but
// Android decides when a scheduled alert is actually allowed to fire, and two
// separate mechanisms hold it back:
//
// 1. Exact alarms. expo-notifications only asks for an exact alarm when
//    `AlarmManager.canScheduleExactAlarms()` is true, and falls back to
//    `setAndAllowWhileIdle` otherwise — an INEXACT alarm the system batches
//    at its own convenience. From Android 12 that capability needs the
//    SCHEDULE_EXACT_ALARM permission (declared in app.json), which on modern
//    versions is off until the user turns it on. Maghrib arriving a quarter of
//    an hour late is the visible result, and nothing in the app can work
//    around it.
//
// 2. Battery optimisation. Even with an exact alarm, an optimised app sits in
//    Doze, where alarms are deferred to maintenance windows.
//
// Only the second is readable from JS (expo-battery), so that row appears
// strictly when the phone says the app is being optimised and disappears when
// it is not. The first cannot be read at all, so it is offered until the user
// says they have dealt with it — an acknowledgement, not a claim by us that
// the permission was granted.

const ACK_KEY = "reminders:exactAlarmsAcknowledged:v1";

/**
 * Below Android 12 exact alarms need no opt-in, so there is nothing to ask
 * for. Platform.Version is the API level on Android.
 */
const NEEDS_EXACT_ALARM_OPT_IN =
  Platform.OS === "android" && Number(Platform.Version) >= 31;

type Props = {
  /** Only worth raising while the user actually wants reminders. */
  enabled: boolean;
};

export default function ReminderReliabilityNotice({ enabled }: Props) {
  const styles = useStyles();
  // null = not answered yet, or not an Android question at all. Only an
  // explicit `true` shows the row: an unknown must not accuse the phone.
  const [optimised, setOptimised] = useState<boolean | null>(null);
  // null until storage has been read, so the notice cannot flash on launch
  // for someone who dismissed it months ago.
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);

  const checkOptimisation = useCallback(() => {
    if (Platform.OS !== "android") return;
    Battery.isBatteryOptimizationEnabledAsync()
      .then(setOptimised)
      .catch(() => setOptimised(null));
  }, []);

  useEffect(() => {
    checkOptimisation();
  }, [checkOptimisation]);

  // The fix happens in a system screen, so the answer changes while the app is
  // in the background. Re-reading on return is what lets the row disappear by
  // itself once the user has actually done it.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") checkOptimisation();
    });
    return () => sub.remove();
  }, [checkOptimisation]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ACK_KEY)
      .then((value) => {
        if (!cancelled) setAcknowledged(value === "1");
      })
      // Storage unavailable: err towards silence rather than a notice that
      // can never be dismissed.
      .catch(() => {
        if (!cancelled) setAcknowledged(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledge = () => {
    setAcknowledged(true);
    void AsyncStorage.setItem(ACK_KEY, "1").catch(() => {});
    // They may well have fixed the battery side in the same visit.
    checkOptimisation();
  };

  const openSettings = (action: IntentLauncher.ActivityAction) => {
    // The package has to be the RUNNING app — inside Expo Go that is Expo Go
    // itself, which is also the app posting these notifications, so this is
    // correct in both.
    const pkg = Application.applicationId;
    IntentLauncher.startActivityAsync(
      action,
      pkg ? { data: `package:${pkg}` } : {},
    ).catch(() => {
      // Not every OEM ships every screen; app details always exists and gets
      // them within one tap of both settings.
      void IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        pkg ? { data: `package:${pkg}` } : {},
      ).catch(() => {});
    });
  };

  if (Platform.OS !== "android" || !enabled || acknowledged === null) {
    return null;
  }

  const showExactAlarms = NEEDS_EXACT_ALARM_OPT_IN && !acknowledged;
  const showBattery = optimised === true;
  if (!showExactAlarms && !showBattery) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>If reminders arrive late</Text>
      <Text style={styles.lead}>
        Prayer times are worked out on your phone, but Android decides when an
        alert may actually fire. Two of its settings can hold reminders back.
      </Text>

      {showExactAlarms ? (
        <View style={styles.item}>
          <Text style={styles.itemBody}>
            <Text style={styles.itemLabel}>Alarms &amp; reminders. </Text>
            Without this, Android is free to batch a reminder and deliver it
            minutes after the adhan rather than on the minute.
          </Text>
          <Touchable
            style={styles.action}
            onPress={() =>
              openSettings(
                IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Open the alarms and reminders setting"
          >
            <Text style={styles.actionLabel}>Allow exact alarms</Text>
          </Touchable>
        </View>
      ) : null}

      {showBattery ? (
        <View style={styles.item}>
          <Text style={styles.itemBody}>
            <Text style={styles.itemLabel}>Battery optimisation. </Text>
            This phone is currently holding the app back in the background,
            which delays reminders. Find Musallah in the list and choose
            {" "}Don&apos;t optimise.
          </Text>
          <Touchable
            style={styles.action}
            onPress={() =>
              openSettings(
                IntentLauncher.ActivityAction
                  .IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Open battery optimisation settings"
          >
            <Text style={styles.actionLabel}>Battery settings</Text>
          </Touchable>
        </View>
      ) : null}

      {showExactAlarms ? (
        // Wording is deliberate: the app cannot read this permission back, so
        // this records what the user says rather than what it has verified.
        <Touchable
          style={styles.dismiss}
          onPress={acknowledge}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the reminder reliability notice"
        >
          <Text style={styles.dismissLabel}>I&apos;ve done this</Text>
        </Touchable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      // Sits inside the notifications card, below its rows, so it reads as
      // part of that setting rather than as a separate warning banner.
      paddingHorizontal: spacing.l,
      paddingVertical: spacing.m,
      gap: spacing.s,
      backgroundColor: colors.attentionSoft,
    },
    title: {
      ...type.footnote,
      fontWeight: "700",
      color: colors.attention,
    },
    lead: {
      ...type.footnote,
      color: colors.attention,
    },
    item: {
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    itemBody: {
      ...type.footnote,
      color: colors.attention,
    },
    itemLabel: {
      fontWeight: "700",
    },
    action: {
      alignSelf: "flex-start",
      minHeight: MIN_TARGET,
      justifyContent: "center",
      paddingHorizontal: spacing.m,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.attention,
      overflow: "hidden",
    },
    actionLabel: {
      ...type.footnote,
      fontWeight: "700",
      color: colors.attention,
    },
    dismiss: {
      alignSelf: "flex-start",
      minHeight: MIN_TARGET,
      justifyContent: "center",
      overflow: "hidden",
    },
    dismissLabel: {
      ...type.footnote,
      fontWeight: "600",
      color: colors.textSecondary,
    },
  }),
);
