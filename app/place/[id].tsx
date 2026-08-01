import React, { useMemo, useState } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FACILITY_LABELS,
  FacilityKey,
  isCorroborated,
  Place,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import SuggestionSheet from "@/components/SuggestionSheet";
import { submitEditSuggestion } from "@/lib/feedback";
import { FACILITY_ICONS, PLACE_TYPE_ICONS, type IconName } from "@/lib/icons";
import { computePrayerTimes, PrayerTimes } from "@/lib/prayerTimes";
import {
  placeTypeColors,
  spacing,
  radius,
  type ThemeColors,
} from "@/lib/theme";

// The hero band is always the deep masjid green — the identity colour the
// pins already use. Deliberately NOT per-type: white text fails contrast
// on the amber musalla colour, and a header that changes colour per page
// reads as inconsistency, not information (the type is stated in words).
const HERO_BACKGROUND = placeTypeColors.masjid;
const HERO_TEXT = "#FFFFFF";

function mapsSearchUrl(place: Place): string {
  const query = encodeURIComponent(place.name + ", " + place.address);
  return "https://www.google.com/maps/search/?api=1&query=" + query;
}

const PRAYER_ROWS: {
  label: string;
  jamaatKey: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
  calculatedKey: keyof PrayerTimes;
}[] = [
  { label: "Fajr", jamaatKey: "fajr", calculatedKey: "Fajr" },
  { label: "Dhuhr", jamaatKey: "dhuhr", calculatedKey: "Dhuhr" },
  { label: "Asr", jamaatKey: "asr", calculatedKey: "Asr" },
  { label: "Maghrib", jamaatKey: "maghrib", calculatedKey: "Maghrib" },
  { label: "Isha", jamaatKey: "isha", calculatedKey: "Isha" },
];

function ukPhoneToTel(display: string): string {
  // Strip everything except digits and a leading "+" -- display strings
  // like "(020) 7650 3000" must still produce a dialable URL.
  const digits = display.replace(/[^\d+]/g, "");
  if (digits.startsWith("0")) {
    return "tel:+44" + digits.slice(1);
  }
  return "tel:" + digits;
}

function confidenceLabel(confidence?: "verified" | "community" | "unverified"): string {
  switch (confidence) {
    case "verified":
      return "Verified";
    case "community":
      return "Community-verified";
    default:
      return "Unverified";
  }
}

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

export default function PlaceDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { places } = usePlaces();
  // Memoized lookup: this screen re-renders on form/times state changes,
  // and a linear scan per render is wasted work as the dataset grows.
  const place = useMemo(() => places.find((p) => p.id === id), [places, id]);
  const { settings } = useSettings();
  const [showEditForm, setShowEditForm] = useState(false);

  // Computed on-device for this place's exact coordinates -- instant,
  // offline, and it follows the mithl/method chosen in Settings. Only the
  // calculation-relevant settings are dependencies.
  const calculatedTimes = useMemo<PrayerTimes | null>(
    () =>
      place
        ? computePrayerTimes(place.lat, place.lng, {
            method: settings.method,
            madhab: settings.madhab,
            shafaq: settings.shafaq,
          })
        : null,
    [place, settings.method, settings.madhab, settings.shafaq],
  );

  if (!place) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Place not found.</Text>
      </View>
    );
  }

  const openDirections = () => {
    const query = encodeURIComponent(place.name + ", " + place.address);
    const webUrl = mapsSearchUrl(place);
    const url = Platform.select({
      ios: "maps:0,0?q=" + query,
      android: "geo:0,0?q=" + query,
      default: webUrl,
    });
    // Fall back to a web map if no maps app is available. The second
    // .catch prevents an unhandled promise rejection if that fails too.
    Linking.openURL(url).catch(() => {
      Linking.openURL(webUrl).catch(() => {});
    });
  };

  const sharePlace = () => {
    // A maps link, not an app link: the recipient may not have the app.
    Share.share({
      message: `${place.name}\n${place.address}\n${mapsSearchUrl(place)}`,
    }).catch(() => {});
  };

  const facilityKeys = Object.keys(FACILITY_LABELS) as FacilityKey[];

  const contactRows: {
    label: string;
    icon: IconName;
    url: string;
    accessibilityLabel: string;
  }[] = [];
  if (place.phone) {
    contactRows.push({
      label: "Phone",
      icon: "phone",
      url: ukPhoneToTel(place.phone),
      accessibilityLabel: "Call phone",
    });
  }
  if (place.website) {
    contactRows.push({
      label: "Website",
      icon: "web",
      url: place.website,
      accessibilityLabel: "Open website",
    });
  }
  if (place.facebook) {
    contactRows.push({
      label: "Facebook",
      icon: "facebook",
      url: place.facebook,
      accessibilityLabel: "Open Facebook",
    });
  }
  if (place.instagram) {
    contactRows.push({
      label: "Instagram",
      icon: "instagram",
      url: place.instagram,
      accessibilityLabel: "Open Instagram",
    });
  }

  // One status, not a pile of verification phrases: the old line rendered
  // "Unverified · Not yet verified · <source>", which read like a list of
  // every possible status at once.
  const verificationDetail = [
    place.lastVerified ? "checked " + place.lastVerified : null,
    place.source,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // Root View, not bare ScrollView: the suggestion sheet overlays with
    // absolute positioning, which must anchor to the screen — inside the
    // ScrollView it would scroll away with the content.
    <View style={styles.screen}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
    >
      <Stack.Screen options={ { title: PLACE_TYPE_LABELS[place.type] } } />

      <View style={styles.hero}>
        <View style={styles.heroMetaRow}>
          <MaterialCommunityIcons
            name={PLACE_TYPE_ICONS[place.type]}
            size={15}
            color={HERO_TEXT}
          />
          <Text style={styles.heroMeta}>{PLACE_TYPE_LABELS[place.type]}</Text>
          {place.confidence === "verified" ? (
            <>
              <Text style={styles.heroMeta}>{"·"}</Text>
              <MaterialCommunityIcons
                name="check-decagram"
                size={15}
                color={HERO_TEXT}
              />
              <Text style={styles.heroMeta}>Verified</Text>
            </>
          ) : null}
        </View>
        <Text style={styles.heroName}>{place.name}</Text>
        {place.address ? (
          <Text style={styles.heroAddress}>{place.address}</Text>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.directionsButton}
          onPress={openDirections}
          accessibilityRole="button"
          accessibilityLabel="Get directions"
        >
          <MaterialCommunityIcons
            name="navigation-variant"
            size={18}
            color={colors.canvas}
          />
          <Text style={styles.directionsLabel}>Directions</Text>
        </TouchableOpacity>
        {place.phone ? (
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              Linking.openURL(ukPhoneToTel(place.phone!)).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Call phone"
          >
            <MaterialCommunityIcons
              name="phone"
              size={19}
              color={colors.accent}
            />
          </TouchableOpacity>
        ) : null}
        {place.website ? (
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => {
              Linking.openURL(place.website!).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Open website"
          >
            <MaterialCommunityIcons
              name="web"
              size={19}
              color={colors.accent}
            />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.quickAction}
          onPress={sharePlace}
          accessibilityRole="button"
          accessibilityLabel="Share this place"
        >
          <MaterialCommunityIcons
            name="share-variant"
            size={19}
            color={colors.accent}
          />
        </TouchableOpacity>
      </View>

      {contactRows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.contactList}>
            {contactRows.map((row) => (
              <TouchableOpacity
                key={row.label}
                style={styles.contactRow}
                onPress={() => {
                  Linking.openURL(row.url).catch(() => {});
                }}
                accessibilityRole="button"
                accessibilityLabel={row.accessibilityLabel}
              >
                <View style={styles.contactLabelWrap}>
                  <MaterialCommunityIcons
                    name={row.icon}
                    size={17}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.contactLabel}>{row.label}</Text>
                </View>
                <Text style={styles.contactValue} numberOfLines={1}>
                  {row.label === "Phone" ? place.phone : row.url}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {place.jumuahTimes?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jumu'ah</Text>
          <Text style={styles.sectionBody}>
            {place.jumuahTimes.join("  ·  ")}
          </Text>
        </View>
      ) : null}

      {calculatedTimes || place.jamaat ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prayer times</Text>
          <View style={styles.prayerTable}>
            <View style={styles.prayerHeaderRow}>
              <Text style={[styles.prayerNameCell, styles.prayerHeaderCell]} />
              <Text style={[styles.prayerTimeCell, styles.prayerHeaderCell]}>
                Jamaat
              </Text>
              <Text style={[styles.prayerTimeCell, styles.prayerHeaderCell]}>
                Start
              </Text>
            </View>
            {PRAYER_ROWS.map((row) => (
              <View key={row.label} style={styles.prayerRow}>
                <Text style={styles.prayerNameCell}>
                  {row.label === "Asr"
                    ? `Asr (${settings.madhab === "hanafi" ? "2" : "1"} mithl)`
                    : row.label}
                </Text>
                <Text style={styles.prayerJamaatCell}>
                  {place.jamaat?.[row.jamaatKey] ?? "—"}
                </Text>
                <Text style={styles.prayerCalculatedCell}>
                  {calculatedTimes?.[row.calculatedKey] ?? "—"}
                </Text>
              </View>
            ))}
          </View>
          {place.jamaat ? (
            <Text style={styles.jamaatSource}>
              {"Jamaat times: " +
                place.jamaat.source +
                " (" +
                place.jamaat.recordedOn +
                ")"}
            </Text>
          ) : null}
          {place.jamaat && place.confidence !== "verified" ? (
            // Unverified jamaat times look exactly as authoritative as real
            // ones -- for prayer times that's dangerous, so say it plainly.
            <Text style={styles.jamaatCaution}>
              These jamaat times are unverified — confirm with the masjid
              before relying on them.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Facilities</Text>
        <View style={styles.facilityList}>
          {facilityKeys.map((key) => {
            const available = place.facilities[key];
            return (
              <View key={key} style={styles.facilityRow}>
                <MaterialCommunityIcons
                  name={FACILITY_ICONS[key]}
                  size={19}
                  color={available ? colors.accent : colors.border}
                />
                <Text
                  style={[
                    styles.facilityLabel,
                    !available && styles.facilityLabelMissing,
                  ]}
                >
                  {FACILITY_LABELS[key]}
                </Text>
                <MaterialCommunityIcons
                  name={available ? "check" : "close"}
                  size={17}
                  color={available ? colors.positive : colors.textSecondary}
                  style={styles.facilityMark}
                />
              </View>
            );
          })}
        </View>
      </View>

      {place.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.sectionBody}>{place.notes}</Text>
        </View>
      ) : null}

      <View style={styles.verification}>
        <Text style={styles.verificationText}>
          {isCorroborated(place) ? (
            <>
              <MaterialCommunityIcons
                name="check-decagram"
                size={14}
                color={colors.positive}
              />{" "}
            </>
          ) : null}
          <Text style={styles.verificationStatus}>
            {confidenceLabel(place.confidence)}
          </Text>
          {verificationDetail ? " · " + verificationDetail : ""}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.suggestEditButton}
        onPress={() => setShowEditForm(true)}
        accessibilityRole="button"
        accessibilityLabel="Suggest an edit"
      >
        <Text style={styles.suggestEditLabel}>
          Something wrong? Suggest an edit
        </Text>
      </TouchableOpacity>
    </ScrollView>
    <SuggestionSheet
      visible={showEditForm}
      title="Suggest an edit"
      placeholder="Tell us what's wrong or missing..."
      topics={[
        "Prayer times",
        "Facilities",
        "Address or location",
        "Contact details",
        "Closed or moved",
      ]}
      onSend={(message) => submitEditSuggestion(place, message)}
      onClose={() => setShowEditForm(false)}
    />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.l,
    gap: spacing.l,
    paddingBottom: spacing.xxl,
    // Centered, phone-width column on desktop browsers.
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  missingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  hero: {
    backgroundColor: HERO_BACKGROUND,
    borderRadius: 16,
    padding: spacing.l,
    paddingVertical: spacing.xl - spacing.xs,
    gap: spacing.xs,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  heroMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: HERO_TEXT,
    opacity: 0.95,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "700",
    color: HERO_TEXT,
    lineHeight: 28,
  },
  heroAddress: {
    fontSize: 14,
    color: HERO_TEXT,
    opacity: 0.9,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.s,
  },
  directionsButton: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.s,
    backgroundColor: colors.accent,
    borderRadius: radius.l,
    paddingVertical: spacing.m,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  // canvas, not white: the dark theme's accent is light green.
  directionsLabel: {
    color: colors.canvas,
    fontSize: 16,
    fontWeight: "600",
  },
  quickAction: {
    width: 48,
    minHeight: 48,
    borderRadius: radius.l,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.m,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionBody: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  prayerTable: {
    gap: spacing.s,
  },
  prayerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  prayerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  prayerNameCell: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  prayerTimeCell: {
    width: 64,
    fontSize: 14,
    textAlign: "center",
  },
  prayerHeaderCell: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  prayerJamaatCell: {
    width: 64,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  prayerCalculatedCell: {
    width: 64,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
  jamaatSource: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  jamaatCaution: {
    fontSize: 13,
    color: colors.attention,
    lineHeight: 18,
  },
  contactList: {
    gap: spacing.s,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.m,
    minHeight: 44,
  },
  contactLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
  },
  contactLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  contactValue: {
    flex: 1,
    fontSize: 16,
    color: colors.accent,
    textAlign: "right",
  },
  facilityList: {
    gap: spacing.s,
  },
  facilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
  },
  facilityMark: {
    marginLeft: "auto",
  },
  facilityLabel: {
    fontSize: 16,
    color: colors.text,
  },
  facilityLabelMissing: {
    color: colors.textSecondary,
  },
  verification: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.m,
    padding: spacing.m,
  },
  verificationText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  verificationStatus: {
    fontWeight: "600",
    color: colors.text,
  },
  suggestEditButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  suggestEditLabel: {
    fontSize: 14,
    color: colors.accent,
  },
});