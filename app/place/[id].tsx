import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
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
import JamaatCheck from "@/components/JamaatCheck";
import OfflineScreen from "@/components/OfflineScreen";
import SuggestionSheet from "@/components/SuggestionSheet";
import { submitEditSuggestion, submitJamaatTimes } from "@/lib/feedback";
import { JAMAAT_SOURCE_TOPICS } from "@/lib/jamaatContribution";
import { FACILITY_ICONS, PLACE_TYPE_ICONS, type IconName } from "@/lib/icons";
import { formatAddress } from "@/lib/formatAddress";
import { isLikelyIreland } from "@/lib/geo";
import { computePrayerTimes, PrayerTimes } from "@/lib/prayerTimes";
import { createThemedStyles } from "@/lib/themedStyles";
import {
  numeric,
  spacing,
  radius,
  type,
  type ThemeColors,
} from "@/lib/theme";
import { cardEdge } from "@/lib/elevation";
import { MIN_TARGET } from "@/lib/metrics";

// The hero band is always the brand gradient (emerald into deep teal — the
// stops live in the palette and white text is contrast-asserted against
// both). Deliberately NOT per-type: white text fails contrast on the amber
// musalla colour, and a header that changes colour per page reads as
// inconsistency, not information (the type is stated in words).
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

export default function PlaceDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { byId, status: placesStatus, refresh: refreshPlaces } = usePlaces();
  // Straight off the shared id index (see PlacesContext) — this screen
  // re-renders on form and prayer-time state changes, and the previous
  // `places.find()` walked the whole dataset to reach one row.
  const place = byId.get(id);
  const { settings } = useSettings();
  const { isFavourite, toggle: toggleFavourite } = useFavourites();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showTimesForm, setShowTimesForm] = useState(false);

  // The header carries the place TYPE until the hero card scrolls away, then
  // the place NAME — otherwise nothing on screen says which place this is.
  // The crossing is tracked in a ref as well as state so the scroll handler
  // only touches state at the threshold rather than on every frame; the
  // native header title is a single ellipsized line on both platforms, so a
  // long name truncates instead of wrapping.
  const [headerShowsName, setHeaderShowsName] = useState(false);
  const pastHero = useRef(false);
  // Until the hero has laid itself out, no offset counts as past it.
  const heroBottom = useRef(Number.POSITIVE_INFINITY);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = event.nativeEvent.contentOffset.y > heroBottom.current;
      if (past !== pastHero.current) {
        pastHero.current = past;
        setHeaderShowsName(past);
      }
    },
    [],
  );

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
  const address = formatAddress(place.address);

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
      message: `${place.name}\n${address}\n${mapsSearchUrl(place)}`,
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

  // ...and only ONCE per screen. The hero already stamps "Verified" on a
  // verified record, so the banner earns its space only when it carries
  // something the hero doesn't: a last-checked date, or a status the hero
  // never shows. Those are the statuses that matter most here — a traveller
  // relying on an unverified record needs to be told.
  const showVerificationBanner =
    place.confidence !== "verified" || verificationDetail !== "";

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
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <Stack.Screen
        options={{
          title: headerShowsName
            ? place.name
            : PLACE_TYPE_LABELS[place.type],
        }}
      />

      <LinearGradient
        colors={[colors.heroGradientStart, colors.heroGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
        // Measured rather than assumed: the hero's height depends on how many
        // lines the name and address take at the user's font size.
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          heroBottom.current = y + height;
        }}
      >
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
        {address ? <Text style={styles.heroAddress}>{address}</Text> : null}
      </LinearGradient>

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
          {/* The community loop for the Jamaat column: one-tap
              confirm/dispute when times exist, an invitation to add them
              when they don't. Sits INSIDE the prayer-times card because it
              is about exactly the numbers (or dashes) directly above it. */}
          <JamaatCheck place={place} onAddTimes={() => setShowTimesForm(true)} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Facilities</Text>
        <View style={styles.facilityList}>
          {facilityKeys.map((key) => {
            const available = place.facilities[key];
            return (
              <View key={key} style={styles.facilityRow}>
                {/* Dimmed, not erased. `colors.border` is a divider —
                    ~1.3:1 on this card in both themes — so an absent
                    facility rendered a blank gap where the others show a
                    glyph, which reads as a broken icon. textSecondary is the
                    same ink as the dimmed label beside it. */}
                <MaterialCommunityIcons
                  name={FACILITY_ICONS[key]}
                  size={19}
                  color={available ? colors.accent : colors.textSecondary}
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

      {showVerificationBanner ? (
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
      ) : null}

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
    {/* The jamaat-times contribution sheet (opened from JamaatCheck). The
        topic chips ARE the provenance question — "where did these times
        come from?" — answered by tapping, not typing, and prefixed onto
        the message so triage can weigh each contribution instantly. */}
    <SuggestionSheet
      visible={showTimesForm}
      title="Add jamaat times"
      placeholder={
        "e.g. Fajr 6:00, Dhuhr 1:30, Asr 6:45, Maghrib +5, Isha 9:15.\n" +
        "Rough or partial is fine — every prayer you know helps."
      }
      topics={[...JAMAAT_SOURCE_TOPICS]}
      onSend={(message) => submitJamaatTimes(place, message)}
      onClose={() => setShowTimesForm(false)}
    />
    </View>
  );
}

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
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
    width: "100%",
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
    borderRadius: radius.xl,
    padding: spacing.l + spacing.xs,
    paddingVertical: spacing.xl,
    gap: spacing.s - 2,
    // Clips the gradient to the rounded corners on Android.
    overflow: "hidden",
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
    ...type.title1,
    fontWeight: "800",
    color: HERO_TEXT,
  },
  heroAddress: {
    ...type.subhead,
    fontWeight: "500",
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
    borderRadius: radius.pill,
    paddingVertical: spacing.m,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  // canvas, not white: the dark theme's accent is a bright green under
  // near-black labels.
  directionsLabel: {
    color: colors.canvas,
    ...type.body,
    fontWeight: "700",
  },
  quickAction: {
    width: 52,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  section: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    ...cardEdge(scheme, colors),
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
}),
);
