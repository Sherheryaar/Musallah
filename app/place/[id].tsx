import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FACILITY_LABELS,
  FacilityKey,
  isCorroborated,
  Place,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import Touchable from "@/components/Touchable";
import { useFavourites } from "@/context/FavouritesContext";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import OfflineScreen from "@/components/OfflineScreen";
import SuggestionSheet from "@/components/SuggestionSheet";
import { submitEditSuggestion } from "@/lib/feedback";
import { FACILITY_ICONS, PLACE_TYPE_ICONS, type IconName } from "@/lib/icons";
import { isLikelyIreland } from "@/lib/geo";
import { computePrayerTimes, PrayerTimes } from "@/lib/prayerTimes";
import {
  numeric,
  placeTypeColors,
  spacing,
  radius,
  type,
  type ThemeColors,
} from "@/lib/theme";
import { MIN_TARGET } from "@/lib/metrics";

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

/**
 * Northern Ireland uses the UK's own numbering plan end-to-end (the "028"
 * area code, and the same "07" mobile ranges as Great Britain), so a bare
 * leading "0" number there really does mean +44. The Republic of Ireland
 * doesn't: a Dublin/Cork/Galway landline written locally ("01 234 5678")
 * also starts with "0", but dials as +353. Neither area code nor mobile
 * prefix distinguishes the two on shape alone, so this checks the PLACE's
 * own location, and inside that region only overrides to +353 for numbers
 * that aren't already unambiguously Northern Irish (028 landlines, or 07
 * mobiles shared UK-wide).
 */
function phoneToTel(display: string, place: Place): string {
  // Strip everything except digits and a leading "+" -- display strings
  // like "(020) 7650 3000" must still produce a dialable URL.
  const digits = display.replace(/[^\d+]/g, "");
  if (!digits.startsWith("0")) {
    return "tel:" + digits;
  }
  const isNorthernIrelandShaped =
    digits.startsWith("028") || digits.startsWith("07");
  if (isLikelyIreland(place.lat, place.lng) && !isNorthernIrelandShaped) {
    return "tel:+353" + digits.slice(1);
  }
  return "tel:+44" + digits.slice(1);
}

function confidenceLabel(confidence?: "verified" | "community" | "unverified"): string {
  switch (confidence) {
    case "verified":
      return "Verified";
    case "unverified":
      return "Unverified";
    case "community":
    default:
      // Matches isCorroborated() (data/places.ts): a place with no
      // confidence set at all is treated the same as "community" here, not
      // as "unverified" -- otherwise this label would contradict the green
      // corroborated checkmark shown right next to it.
      return "Community-verified";
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
  const { places, status: placesStatus, refresh: refreshPlaces } =
    usePlaces();
  // Memoized lookup: this screen re-renders on form/times state changes,
  // and a linear scan per render is wasted work as the dataset grows.
  const place = useMemo(() => places.find((p) => p.id === id), [places, id]);
  const { settings } = useSettings();
  const { isFavourite, toggle: toggleFavourite } = useFavourites();
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
    // Distinguish "we have no data at all" from "this id genuinely doesn't
    // exist" -- the first is an offline/connectivity problem with a retry,
    // not a dead link.
    if (placesStatus === "offline") {
      return <OfflineScreen onRetry={refreshPlaces} />;
    }
    // ...and neither of those is "the first fetch is still in flight".
    // Places are never bundled or cached, so a deep link from a
    // notification or a shared URL arrives before any data exists and would
    // otherwise report a perfectly good link as a dead one.
    if (placesStatus === "loading") {
      return (
        <View style={styles.missing}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Place not found.</Text>
      </View>
    );
  }

  const saved = isFavourite(place.id);

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
      url: phoneToTel(place.phone, place),
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
  // every possible status at once. The SOURCE is deliberately not shown
  // here — where the data comes from is acknowledged once, in the settings
  // screen's thanks section, not stamped on every place.
  const verificationDetail = place.lastVerified
    ? "checked " + place.lastVerified
    : "";

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
        <Touchable
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
        </Touchable>
        {place.phone ? (
          <Touchable
            style={styles.quickAction}
            onPress={() => {
              Linking.openURL(phoneToTel(place.phone!, place)).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Call phone"
          >
            <MaterialCommunityIcons
              name="phone"
              size={19}
              color={colors.accent}
            />
          </Touchable>
        ) : null}
        {place.website ? (
          <Touchable
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
          </Touchable>
        ) : null}
        {/* Saving is the highest-frequency action a regular attendee has —
            jamaat times are a daily lookup — so it sits with the other
            first-class actions, not buried in a menu. */}
        <Touchable
          style={styles.quickAction}
          onPress={() => toggleFavourite(place.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? "Remove from saved" : "Save this place"}
        >
          {/* The filled/outline glyph carries the state (with
              accessibilityState above); the colour is accent either way. */}
          <MaterialCommunityIcons
            name={saved ? "heart" : "heart-outline"}
            size={19}
            color={colors.accent}
          />
        </Touchable>
        <Touchable
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
        </Touchable>
      </View>

      {contactRows.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.contactList}>
            {contactRows.map((row) => (
              <Touchable
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
              </Touchable>
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

      <Touchable
        style={styles.suggestEditButton}
        onPress={() => setShowEditForm(true)}
        accessibilityRole="button"
        accessibilityLabel="Suggest an edit"
      >
        <Text style={styles.suggestEditLabel}>
          Something wrong? Suggest an edit
        </Text>
      </Touchable>
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
    // No paddingBottom here — the inline style adds insets.bottom to it, so a
    // value in the stylesheet is always overridden and only misleads.
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
    ...type.body,
    color: colors.textSecondary,
  },
  hero: {
    backgroundColor: HERO_BACKGROUND,
    borderRadius: radius.xl,
    padding: spacing.l,
    paddingVertical: spacing.xl - spacing.xs,
    gap: spacing.xs,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  // No `opacity` on any of the three. White has only 5.02:1 to spend on this
  // green, so dimming it is expensive: the address shipped at 0.9, which
  // composites to 4.40:1 and fails AA for 14px regular text. The palette
  // tests never saw it, because they compare opaque colours and this was a
  // stylesheet alpha — theme.test.ts now composites these explicitly.
  //
  // Nothing is lost visually. 0.9 vs 0.95 vs 1.0 white on this green is not a
  // perceptible hierarchy; the real hierarchy is 22/700 → 14/400 → 12/600,
  // which is doing all the work already.
  heroMeta: {
    ...type.caption,
    fontWeight: "600",
    color: HERO_TEXT,
  },
  heroName: {
    ...type.title2,
    fontWeight: "700",
    color: HERO_TEXT,
  },
  heroAddress: {
    ...type.subhead,
    color: HERO_TEXT,
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
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  // canvas, not white: the dark theme's accent is light green.
  directionsLabel: {
    color: colors.canvas,
    ...type.body,
    fontWeight: "600",
  },
  quickAction: {
    width: 48,
    minHeight: 48,
    borderRadius: radius.l,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
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
    ...type.eyebrow,
    color: colors.textSecondary,
  },
  sectionBody: {
    ...type.body,
    color: colors.text,
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
    minHeight: MIN_TARGET,
  },
  prayerNameCell: {
    flex: 1,
    ...type.body,
    color: colors.text,
  },
  prayerTimeCell: {
    // minWidth, not width: at a large system font size a fixed 64pt box
    // clips the time. flexShrink: 0 keeps the columns aligned.
    minWidth: 64,
    flexShrink: 0,
    ...type.subhead,
    textAlign: "center",
  },
  prayerHeaderCell: {
    ...type.eyebrow,
    color: colors.textSecondary,
  },
  prayerJamaatCell: {
    minWidth: 64,
    flexShrink: 0,
    ...type.body,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    ...numeric,
  },
  prayerCalculatedCell: {
    minWidth: 64,
    flexShrink: 0,
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    ...numeric,
  },
  jamaatSource: {
    ...type.subhead,
    color: colors.textSecondary,
  },
  jamaatCaution: {
    ...type.footnote,
    color: colors.attention,
  },
  contactList: {
    gap: spacing.s,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.m,
    minHeight: MIN_TARGET,
  },
  contactLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
  },
  contactLabel: {
    ...type.body,
    fontWeight: "600",
    color: colors.text,
  },
  contactValue: {
    flex: 1,
    ...type.body,
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
    ...type.body,
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
    ...type.subhead,
    color: colors.textSecondary,
  },
  verificationStatus: {
    fontWeight: "600",
    color: colors.text,
  },
  suggestEditButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: MIN_TARGET,
  },
  suggestEditLabel: {
    ...type.subhead,
    color: colors.accent,
  },
});