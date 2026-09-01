import React, { useMemo } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import ReminderReliabilityNotice from "@/components/ReminderReliabilityNotice";
import Touchable from "@/components/Touchable";
import ThemedSwitch from "@/components/ThemedSwitch";
import { useNotifications } from "@/context/NotificationsContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { cardEdge } from "@/lib/elevation";
import { PRAYER_KEYS, PRAYER_LABELS } from "@/data/places";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";
import { MIN_TARGET } from "@/lib/metrics";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const PRIVACY_POINTS: { title: string; body: string }[] = [
  {
    title: "Your location never leaves your phone",
    body: "Location is used on-device to sort places by distance and to calculate prayer times. It is never uploaded, stored, or shared with anyone.",
  },
  {
    title: "Prayer times are calculated on-device",
    body: "No prayer-time service is contacted, so nothing about where or when you pray is sent anywhere. Times also work fully offline, and prayer notifications are scheduled locally on your phone the same way.",
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

// The attribution that used to sit at the bottom of every place page, in
// one deliberate home. Each row opens the project's own site.
const CREDITS: { name: string; role: string; url: string }[] = [
  {
    name: "MuslimsInBritain.org",
    role: "The UK mosque directory our place data is built from — used with permission.",
    url: "https://www.muslimsinbritain.org",
  },
  {
    name: "Mawaqit",
    role: "Jamaat timetables for masjids that publish there — used with permission.",
    url: "https://mawaqit.net",
  },
  {
    name: "Masjidbox",
    role: "Jamaat timetables for masjids that publish there.",
    url: "https://masjidbox.com",
  },
  {
    name: "Sirat",
    role: "Mosque directory used where a masjid publishes nowhere else we can read (ODC-By 1.0).",
    url: "https://sirat.uk",
  },
  {
    name: "Moonsighting Committee",
    role: "The seasonal Fajr & Isha calculation method recommended for the UK.",
    url: "https://www.moonsighting.com",
  },
];

const THEME_OPTIONS: {
  key: "system" | "light" | "dark";
  label: string;
  icon: IconName;
}[] = [
  { key: "system", label: "System", icon: "theme-light-dark" },
  { key: "light", label: "Light", icon: "white-balance-sunny" },
  { key: "dark", label: "Dark", icon: "weather-night" },
];

function SectionHeader({
  icon,
  title,
  first,
}: {
  icon: IconName;
  title: string;
  first?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, first && styles.firstSectionHeader]}>
      {/* Accent, not textSecondary: the icons are the one place the brand
          colour can run down this page without shouting. */}
      <MaterialCommunityIcons name={icon} size={16} color={colors.accent} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function OptionRow({
  label,
  detail,
  selected,
  divider,
  last,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  divider?: boolean;
  /** Bottom row of its card — see styles.optionRowLast. */
  last?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  // A divider is the "there is a row above me" signal, so its absence is
  // exactly what makes a row the first in its card. Being at the bottom edge
  // is the one position nothing else already encodes.
  const first = !divider;
  return (
    <Touchable
      style={[
        styles.optionRow,
        divider && styles.rowDivider,
        selected && styles.optionRowSelected,
        selected && first && styles.optionRowFirst,
        selected && last && styles.optionRowLast,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      // `detail` is not decoration — it is the entire explanation of what
      // the option means ("Asr begins when an object's shadow equals its
      // length"). Dropping it left the reader with two near-identical
      // labels and no way to tell them apart.
      accessibilityLabel={`${label}. ${detail}`}
    >
      <View style={styles.optionTextWrap}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Touchable>
  );
}

const REMINDER_OPTIONS = [0, 10, 20] as const;

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const notifications = useNotifications();

  const toggleNotifications = async (on: boolean) => {
    if (!on) {
      notifications.disable();
      return;
    }
    await notifications.enable();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
    >
      {/* ------------------------------------------------------------------
          APPEARANCE
          ------------------------------------------------------------------ */}
      <SectionHeader icon="palette-outline" title="Appearance" first />
      <View style={styles.card}>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(({ key, label, icon }) => {
            const selected = settings.theme === key;
            return (
              <Touchable
                key={key}
                style={[styles.themeChip, selected && styles.themeChipActive]}
                onPress={() => updateSettings({ theme: key })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  key === "system" ? "Follow the system theme" : `${label} theme`
                }
              >
                <MaterialCommunityIcons
                  name={icon}
                  size={18}
                  color={selected ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.themeChipLabel,
                    selected && styles.themeChipLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Touchable>
            );
          })}
        </View>
        {settings.theme === "system" ? (
          <Text style={styles.themeHint}>
            Follows your phone&apos;s light/dark setting.
          </Text>
        ) : null}
      </View>

      {/* ------------------------------------------------------------------
          PRAYER TIME CALCULATION
          ------------------------------------------------------------------ */}
      <SectionHeader icon="clock-outline" title="Asr time (mithl)" />
      <Text style={styles.sectionIntro}>
        Schools of thought differ on when Asr begins, which is why timetables
        often print two timings. Choose the one you follow; it applies
        everywhere in the app.
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
          last
          onPress={() => updateSettings({ madhab: "hanafi" })}
        />
      </View>

      <SectionHeader icon="weather-sunset" title="Fajr & Isha calculation" />
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
          last
          onPress={() => updateSettings({ method: "mwl" })}
        />
      </View>

      {settings.method === "moonsighting" ? (
        // Shafaq only affects the Moonsighting Committee Isha rule, so it is
        // hidden when MWL is selected rather than shown doing nothing.
        <>
          <SectionHeader icon="weather-night" title="Isha twilight (Shafaq)" />
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
              last
              onPress={() => updateSettings({ shafaq: "abyad" })}
            />
          </View>
        </>
      ) : null}

      {/* ------------------------------------------------------------------
          FEEDBACK & NOTIFICATIONS
          ------------------------------------------------------------------ */}
      <SectionHeader icon="vibrate" title="Vibration" />
      <Text style={styles.sectionIntro}>
        The Qibla compass buzzes once when you face the qibla, and ticks
        lightly every 15° as you turn {"—"} so you can follow it without
        watching the screen.
      </Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.optionLabel}>Vibration</Text>
          <ThemedSwitch
            value={settings.hapticFeedback}
            onValueChange={(on) => updateSettings({ hapticFeedback: on })}
            accessibilityLabel="Vibration feedback"
          />
        </View>
      </View>

      <SectionHeader icon="bell-outline" title="Prayer notifications" />
      <Text style={styles.sectionIntro}>
        Reminders are scheduled on your phone from your location {"—"} no
        server is involved and nothing leaves your device. Open the app
        every week or so to keep the schedule topped up.
      </Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.optionLabel}>Notify me at prayer times</Text>
          <ThemedSwitch
            value={notifications.prefs.enabled}
            onValueChange={toggleNotifications}
            accessibilityLabel="Prayer time notifications"
          />
        </View>
        {notifications.permissionGranted === false ? (
          <View style={[styles.rowDivider, styles.permissionNote]}>
            <Text style={styles.permissionNoteText}>
              Notifications are blocked at the system level {"—"} allow
              them for this app in your phone&apos;s Settings, then try
              again.
            </Text>
          </View>
        ) : null}
        {notifications.prefs.enabled && !notifications.locationAvailable ? (
          // Reminders are computed from coordinates, so with none known
          // nothing is scheduled however this card reads. Saying so is the
          // only honest option: the toggle is genuinely on, and silently
          // flipping it back off would leave the user with no explanation.
          <View style={[styles.rowDivider, styles.permissionNote]}>
            <Text style={styles.permissionNoteText}>
              Reminders are worked out from your location, and none is
              known yet {"—"} enable location for this app, then open the
              home screen once so the schedule can be built.
            </Text>
          </View>
        ) : null}
        {notifications.prefs.enabled ? (
          <>
            {PRAYER_KEYS.map((key) => (
              <View key={key} style={[styles.switchRow, styles.rowDivider]}>
                <Text style={styles.optionLabel}>{PRAYER_LABELS[key]}</Text>
                <ThemedSwitch
                  value={notifications.prefs.prayers[key]}
                  onValueChange={(on) =>
                    notifications.updatePrefs({
                      prayers: {
                        ...notifications.prefs.prayers,
                        [key]: on,
                      },
                    })
                  }
                  accessibilityLabel={`Notify for ${PRAYER_LABELS[key]}`}
                />
              </View>
            ))}
            <View style={[styles.reminderRow, styles.rowDivider]}>
              <Text style={styles.optionLabel}>Remind me</Text>
              <View style={styles.reminderChips}>
                {REMINDER_OPTIONS.map((mins) => {
                  const selected =
                    notifications.prefs.minutesBefore === mins;
                  return (
                    <Touchable
                      key={mins}
                      style={[
                        styles.reminderChip,
                        selected && styles.reminderChipActive,
                      ]}
                      onPress={() =>
                        notifications.updatePrefs({ minutesBefore: mins })
                      }
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.reminderChipLabel,
                          selected && styles.reminderChipLabelActive,
                        ]}
                      >
                        {mins === 0 ? "On time" : `${mins} min early`}
                      </Text>
                    </Touchable>
                  );
                })}
              </View>
            </View>
            {__DEV__ ? (
              // Development builds only: verify delivery without waiting
              // for the next prayer. Never shown in production.
              <Touchable
                style={[styles.switchRow, styles.rowDivider]}
                onPress={() => void notifications.sendTest()}
                accessibilityRole="button"
                accessibilityLabel="Send a test notification"
              >
                <Text style={styles.optionLabel}>
                  Send test notification
                </Text>
                <Text style={styles.optionDetail}>
                  fires in 5 s {"—"} lock the phone
                </Text>
              </Touchable>
            ) : null}
            {/* Last in the card: the times are already correct, this is only
                about Android being allowed to deliver them punctually. */}
            <ReminderReliabilityNotice enabled={notifications.prefs.enabled} />
          </>
        ) : null}
      </View>

      {/* ------------------------------------------------------------------
          PRIVACY
          ------------------------------------------------------------------ */}
      <SectionHeader icon="shield-check-outline" title="Privacy" />
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

      {/* ------------------------------------------------------------------
          THANKS — the attributions that used to sit on every place page.
          ------------------------------------------------------------------ */}
      <SectionHeader icon="hand-heart-outline" title="With thanks to" />
      <Text style={styles.sectionIntro}>
        The projects this app is built on. Place details and jamaat times come
        from the sources below {"—"} spotted a mistake? Use &quot;Suggest an
        edit&quot; on the place itself.
      </Text>
      <View style={styles.card}>
        {CREDITS.map((credit, i) => (
          <Touchable
            key={credit.name}
            style={[styles.creditRow, i > 0 && styles.rowDivider]}
            onPress={() => {
              Linking.openURL(credit.url).catch(() => {});
            }}
            accessibilityRole="link"
            accessibilityLabel={`Open ${credit.name}`}
          >
            <View style={styles.creditTextWrap}>
              <Text style={styles.creditName}>{credit.name}</Text>
              <Text style={styles.creditRole}>{credit.role}</Text>
            </View>
            <MaterialCommunityIcons
              name="open-in-new"
              size={16}
              color={colors.textSecondary}
            />
          </Touchable>
        ))}
      </View>

      {/* ------------------------------------------------------------------
          ABOUT
          ------------------------------------------------------------------ */}
      <SectionHeader icon="information-outline" title="About" />
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>
            {Constants.expoConfig?.version ?? "dev"}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.l,
    width: "100%",
    alignSelf: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s - 2,
    marginTop: spacing.xl,
    marginBottom: spacing.s,
  },
  firstSectionHeader: {
    marginTop: 0,
  },
  sectionTitle: {
    ...type.eyebrow,
    color: colors.textSecondary,
  },
  sectionIntro: {
    ...type.footnote,
    color: colors.textSecondary,
    marginBottom: spacing.s,
  },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    ...cardEdge(scheme, colors),
    // Android only: clips row ripples/selected fills to the corners. iOS
    // must NOT clip — masksToBounds would erase the card's shadow.
    ...Platform.select({ android: { overflow: "hidden" as const } }),
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  themeRow: {
    flexDirection: "row",
    gap: spacing.s,
    padding: spacing.m,
  },
  themeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s - 2,
    minHeight: MIN_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  themeChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  themeChipLabel: {
    ...type.subhead,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  themeChipLabelActive: {
    color: colors.accent,
  },
  themeHint: {
    ...type.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.l,
  },
  optionRowSelected: {
    backgroundColor: colors.accentSoft,
  },
  // The selected fill spans the whole row, so a row at a card's top or bottom
  // edge has to carry the card's radius itself: `card` clips only on Android
  // (clipping on iOS would erase its shadow), which otherwise leaves iOS
  // painting a square fill over the rounded corner — and over the card's
  // hairline border in dark mode. Every one of these groups ships with an
  // edge row already selected, so it is visible by default, not on a corner
  // case.
  optionRowFirst: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  optionRowLast: {
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  optionTextWrap: {
    flex: 1,
    paddingRight: spacing.m,
  },
  optionLabel: {
    ...type.callout,
    fontWeight: "600",
    color: colors.text,
  },
  optionDetail: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    // controlBorder, not border: this ring IS the unselected state. Drawn in
    // `border` it measured 1.26:1, so the nine option rows across this screen
    // showed one selected row and eight blanks — nothing said the blanks were
    // radio buttons you could pick.
    borderColor: colors.controlBorder,
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    minHeight: 52,
  },
  permissionNote: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
  },
  permissionNoteText: {
    ...type.footnote,
    color: colors.attention,
  },
  reminderRow: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    gap: spacing.s,
  },
  reminderChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s,
  },
  reminderChip: {
    // Footnote text inside this padding is only ~36dp tall, so the tap
    // target comes from the floor and the label is centred within it — the
    // same treatment as themeChip above.
    minHeight: MIN_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  reminderChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  reminderChipLabel: {
    ...type.footnote,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  reminderChipLabelActive: {
    color: colors.accent,
  },
  privacyPoint: {
    padding: spacing.l,
  },
  privacyTitle: {
    ...type.subhead,
    fontWeight: "600",
    color: colors.text,
  },
  privacyBody: {
    ...type.footnote,
    color: colors.textSecondary,
    marginTop: 4,
  },
  footnote: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.s,
  },
  creditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
    padding: spacing.l,
    minHeight: MIN_TARGET,
  },
  creditTextWrap: {
    flex: 1,
  },
  creditName: {
    ...type.subhead,
    fontWeight: "600",
    color: colors.text,
  },
  creditRole: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.l,
  },
  aboutLabel: {
    ...type.subhead,
    color: colors.text,
  },
  aboutValue: {
    ...type.subhead,
    color: colors.textSecondary,
  },
}),
);
