import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { useSettings } from "@/context/SettingsContext";
import { colors, radius, spacing } from "@/lib/theme";

const PRIVACY_POINTS: { title: string; body: string }[] = [
  {
    title: "Your location never leaves your phone",
    body: "Location is used on-device to sort places by distance and to calculate prayer times. It is never uploaded, stored, or shared with anyone.",
  },
  {
    title: "Prayer times are calculated on-device",
    body: "No prayer-time service is contacted, so nothing about where or when you pray is sent anywhere. Times also work fully offline.",
  },
  {
    title: "No account, no tracking",
    body: "There is no sign-up, no analytics, and no advertising identifiers in this app.",
  },
  {
    title: "Suggestions are the only thing we receive",
    body: "When you suggest a new place or an edit, only the text you type is sent to our database so we can review it. Please don't include personal details you wouldn't want stored.",
  },
];

function OptionRow({
  label,
  detail,
  selected,
  divider,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  divider?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.optionRow,
        divider && styles.rowDivider,
        selected && styles.optionRowSelected,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={styles.optionTextWrap}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
    >
      <Text style={[styles.sectionTitle, styles.firstSectionTitle]}>
        Asr time (mithl)
      </Text>
      <Text style={styles.sectionIntro}>
        Schools of thought differ on when Asr begins, which is why timetables
        often print two timings — 1 mithl and 2 mithl. Choose the one you
        follow; it applies everywhere in the app.
      </Text>
      <View style={styles.card}>
        <OptionRow
          label="1 Mithl — earlier Asr"
          detail="Shafi'i, Maliki and Hanbali: Asr begins when an object's shadow equals its length."
          selected={settings.madhab === "shafi"}
          onPress={() => updateSettings({ madhab: "shafi" })}
        />
        <OptionRow
          label="2 Mithl — later Asr"
          detail="Hanafi: Asr begins when an object's shadow is twice its length."
          selected={settings.madhab === "hanafi"}
          divider
          onPress={() => updateSettings({ madhab: "hanafi" })}
        />
      </View>

      <Text style={styles.sectionTitle}>Fajr &amp; Isha calculation</Text>
      <Text style={styles.sectionIntro}>
        How dawn and nightfall are worked out. Moonsighting Committee is
        recommended for the UK — fixed-angle methods stop working at British
        latitudes in midsummer.
      </Text>
      <View style={styles.card}>
        <OptionRow
          label="Moonsighting Committee"
          detail="Seasonal twilight rules from moonsighting.com, with Zuhr +5 min and Maghrib +3 min precautions. Recommended for the UK."
          selected={settings.method === "moonsighting"}
          onPress={() => updateSettings({ method: "moonsighting" })}
        />
        <OptionRow
          label="Muslim World League"
          detail="Fixed 18° / 17° twilight angles with a high-latitude fallback."
          selected={settings.method === "mwl"}
          divider
          onPress={() => updateSettings({ method: "mwl" })}
        />
      </View>

      {settings.method === "moonsighting" ? (
        // Shafaq only affects the Moonsighting Committee Isha rule, so it is
        // hidden when MWL is selected rather than shown doing nothing.
        <>
          <Text style={styles.sectionTitle}>Isha twilight (Shafaq)</Text>
          <Text style={styles.sectionIntro}>
            Which evening twilight marks Isha under the Moonsighting Committee
            method. General is the recommended blend for the UK.
          </Text>
          <View style={styles.card}>
            <OptionRow
              label="General"
              detail="Blend of red and white twilight. Recommended up to 55° latitude."
              selected={settings.shafaq === "general"}
              onPress={() => updateSettings({ shafaq: "general" })}
            />
            <OptionRow
              label="Shafaq Ahmer (red)"
              detail="Isha when the red evening glow fades — the earlier opinion."
              selected={settings.shafaq === "ahmer"}
              divider
              onPress={() => updateSettings({ shafaq: "ahmer" })}
            />
            <OptionRow
              label="Shafaq Abyad (white)"
              detail="Isha when the white glow fades — the later, more cautious opinion."
              selected={settings.shafaq === "abyad"}
              divider
              onPress={() => updateSettings({ shafaq: "abyad" })}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Privacy Centre</Text>
      <View style={styles.card}>
        {PRIVACY_POINTS.map((point, i) => (
          <View
            key={point.title}
            style={[styles.privacyPoint, i > 0 && styles.rowDivider]}
          >
            <Text style={styles.privacyTitle}>{point.title}</Text>
            <Text style={styles.privacyBody}>{point.body}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>
        Questions or data requests? Send us a message with the suggestion form
        on the home screen.
      </Text>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>
            {Constants.expoConfig?.version ?? "dev"}
          </Text>
        </View>
        <View style={[styles.aboutRow, styles.rowDivider]}>
          <Text style={styles.aboutLabel}>Prayer times</Text>
          <Text style={styles.aboutValue}>Calculated on-device</Text>
        </View>
        <View style={[styles.aboutRow, styles.rowDivider]}>
          <Text style={styles.aboutLabel}>Place data</Text>
          <Text style={styles.aboutValue}>
            MuslimsInBritain.org (with permission)
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.l,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.s,
  },
  firstSectionTitle: {
    marginTop: 0,
  },
  sectionIntro: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.s,
  },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.l,
  },
  optionRowSelected: {
    backgroundColor: colors.accentSoft,
  },
  optionTextWrap: {
    flex: 1,
    paddingRight: spacing.m,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  optionDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  privacyPoint: {
    padding: spacing.l,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  privacyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  footnote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.s,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.l,
  },
  aboutLabel: {
    fontSize: 14,
    color: colors.text,
  },
  aboutValue: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
