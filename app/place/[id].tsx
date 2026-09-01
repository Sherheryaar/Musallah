import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
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
import * as Clipboard from "expo-clipboard";
import Svg, { Path } from "react-native-svg";

import {
  FACILITY_LABELS,
  FacilityKey,
  isCorroborated,
  Place,
  PLACE_TYPE_LABELS,
  PRAYER_KEYS,
  PRAYER_LABELS,
} from "@/data/places";
import Touchable from "@/components/Touchable";
import { useFavourites } from "@/context/FavouritesContext";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { hapticSuccess } from "@/lib/haptics";
import JamaatCheck from "@/components/JamaatCheck";
import OfflineScreen from "@/components/OfflineScreen";
import SuggestionSheet from "@/components/SuggestionSheet";
import { submitEditSuggestion, submitJamaatTimes } from "@/lib/feedback";
import { JAMAAT_SOURCE_TOPICS } from "@/lib/jamaatContribution";
import { FACILITY_ICONS, PLACE_TYPE_ICONS, type IconName } from "@/lib/icons";
import { formatAddress } from "@/lib/formatAddress";
import { isLikelyIreland } from "@/lib/geo";
import { computePrayerSchedule } from "@/lib/prayerTimes";
import { createThemedStyles } from "@/lib/themedStyles";
import { hhmm } from "@/lib/time";
import { useMinuteTick } from "@/lib/useMinuteTick";
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

/** "Name, address" as a maps query — what every directions handoff searches. */
const placeQuery = (place: Place) =>
  encodeURIComponent(`${place.name}, ${place.address}`);
const mapsSearchUrl = (place: Place) =>
  `https://www.google.com/maps/search/?api=1&query=${placeQuery(place)}`;

/** The contact rows, in display order. Only fields the place has render. */
const CONTACT_FIELDS = [
  { field: "phone", label: "Phone", icon: "phone", action: "Call phone" },
  { field: "website", label: "Website", icon: "web", action: "Open website" },
  { field: "facebook", label: "Facebook", icon: "facebook", action: "Open Facebook" },
  { field: "instagram", label: "Instagram", icon: "instagram", action: "Open Instagram" },
] as const satisfies readonly {
  field: keyof Place;
  label: string;
  icon: IconName;
  action: string;
}[];

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

/**
 * Whole days since a "YYYY-MM-DD" recordedOn stamp, in the DEVICE's zone, or
 * null for a stamp that isn't one. Parsed by hand rather than `new Date(iso)`:
 * a bare ISO date parses as UTC midnight, which for anyone west of Greenwich
 * reads as "yesterday" and would age every stamp by a day.
 */
function jamaatAgeDays(recordedOn: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(recordedOn);
  if (!m) return null;
  const recorded = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - recorded.getTime()) / 86_400_000);
}

/** "recorded today" / "yesterday" / "3 days ago" — a raw ISO date is for
    machines; how stale the times are is the fact a reader needs. */
function describeRecordedOn(recordedOn: string, now: Date): string {
  const days = jamaatAgeDays(recordedOn, now);
  if (days === null) return recordedOn;
  if (days <= 0) return "recorded today";
  if (days === 1) return "recorded yesterday";
  return `recorded ${days} days ago`;
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
  const { settings, calcOptions } = useSettings();
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

  const now = useMinuteTick();

  // Computed on-device for this place's exact coordinates -- instant,
  // offline, and it follows the mithl/method chosen in Settings. Keyed on
  // `now` so the column rolls over at midnight; the astronomy behind it is
  // cached per day, so the per-minute recompute is six Date objects.
  const calculated = useMemo<Partial<Record<string, string>> | null>(() => {
    if (!place) return null;
    const schedule = computePrayerSchedule(place.lat, place.lng, calcOptions, now);
    return schedule
      ? Object.fromEntries(schedule.map((e) => [e.key, e.display]))
      : null;
  }, [place, calcOptions, now]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      await Clipboard.setStringAsync(text);
      hapticSuccess(settings.hapticFeedback);
      AccessibilityInfo.announceForAccessibility(`${label} copied to clipboard`);
      setToastMessage(`${label} copied`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        setToastMessage(null);
        toastTimer.current = null;
      }, 2500);
    },
    [settings.hapticFeedback],
  );

  // The first prayer whose time (jamaat where known, else calculated) is
  // still ahead today; after Isha, tomorrow's Fajr. Both sides are zero-
  // padded "HH:MM" (placesRepo normalises jamaat on load), so a plain string
  // comparison against the clock is exact and needs no parsing.
  const currentUpcomingKey = useMemo(() => {
    if (!calculated) return null;
    const clock = hhmm(now);
    return (
      PRAYER_KEYS.find((key) => {
        const t = place?.jamaat?.[key] ?? calculated[key];
        return t !== undefined && t > clock;
      }) ?? "fajr"
    );
  }, [calculated, place?.jamaat, now]);

  // One sentence covering both ways these times can mislead, so the card
  // never stacks two near-identical warnings. The age is not repeated here:
  // the source line above already carries "recorded N days ago".
  const jamaatCaution = useMemo(() => {
    if (!place?.jamaat) return null;
    const stale = (jamaatAgeDays(place.jamaat.recordedOn, now) ?? 0) > 3;
    const unverified = place.confidence !== "verified";
    if (stale && unverified) {
      return "Unverified, and possibly out of date — confirm with the masjid before relying on these.";
    }
    if (stale) {
      return "These may have moved since — confirm with the masjid.";
    }
    if (unverified) {
      return "Unverified — confirm with the masjid before relying on these.";
    }
    return null;
  }, [place?.jamaat, place?.confidence, now]);

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
    const query = placeQuery(place);
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

  // `value` is what is shown and copied; `url` is what a tap opens (the same
  // thing for links, a tel: URL for the phone number).
  const contactRows = CONTACT_FIELDS.flatMap((row) => {
    const value = place[row.field];
    if (!value) return [];
    const url = row.field === "phone" ? phoneToTel(value, place) : value;
    return [{ ...row, value, url }];
  });

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
        <View style={styles.heroArchWatermark} pointerEvents="none">
          <Svg width={130} height={150} viewBox="0 0 120 140">
            <Path
              d="M 10 140 L 10 70 C 10 30 60 10 60 10 C 60 10 110 30 110 70 L 110 140"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2}
              opacity={0.09}
            />
            <Path
              d="M 25 140 L 25 75 C 25 45 60 25 60 25 C 60 25 95 45 95 75 L 95 140"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              opacity={0.06}
            />
          </Svg>
        </View>
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
        {address ? (
          <Touchable
            onLongPress={() => copyToClipboard(address, "Address")}
            accessibilityRole="text"
            accessibilityLabel={`${address}. Long press to copy address`}
          >
            <Text style={styles.heroAddress}>{address}</Text>
          </Touchable>
        ) : null}
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
                onLongPress={() => copyToClipboard(row.value, row.label)}
                accessibilityRole="button"
                accessibilityLabel={`${row.action}. Long press to copy`}
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
                  {row.value}
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

      {calculated || place.jamaat ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prayer times</Text>
          <View style={styles.prayerTable}>
            <View style={styles.prayerHeaderRow}>
              {/* Same flex:1 spacer the data rows use for the name column —
                  a bare zero-width Text here left the two column headings
                  bunched at the left edge, nowhere near their numbers. */}
              <View style={styles.prayerNameWrap} />
              <Text style={[styles.prayerTimeCell, styles.prayerHeaderCell]}>
                Jamaat
              </Text>
              <Text style={[styles.prayerTimeCell, styles.prayerHeaderCell]}>
                Start
              </Text>
            </View>
            {PRAYER_KEYS.map((key) => {
              const isUpcoming = key === currentUpcomingKey;
              return (
                <View
                  key={key}
                  style={[
                    styles.prayerRow,
                    isUpcoming && styles.prayerRowUpcoming,
                  ]}
                >
                  <View style={styles.prayerNameWrap}>
                    <Text
                      style={[
                        styles.prayerNameCell,
                        isUpcoming && styles.prayerNameCellUpcoming,
                      ]}
                    >
                      {key === "asr"
                        ? `Asr (${settings.madhab === "hanafi" ? "2" : "1"} mithl)`
                        : PRAYER_LABELS[key]}
                    </Text>
                    {isUpcoming ? (
                      <View style={styles.nextPill}>
                        <Text style={styles.nextPillText}>Next</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.prayerJamaatCell,
                      isUpcoming && styles.prayerJamaatCellUpcoming,
                    ]}
                  >
                    {place.jamaat?.[key] ?? "—"}
                  </Text>
                  <Text style={styles.prayerCalculatedCell}>
                    {calculated?.[key] ?? "—"}
                  </Text>
                </View>
              );
            })}
          </View>
          {place.jamaat ? (
            <Text style={styles.jamaatSource}>
              {`Jamaat times: ${place.jamaat.source} · ${describeRecordedOn(
                place.jamaat.recordedOn,
                now,
              )}`}
            </Text>
          ) : null}
          {/* ONE caution, never a stack: jamaat times drift with the sun and
              the pipeline keeps last-known times when a page stops parsing,
              so a stale or unverified time looks exactly as authoritative as
              a real one. The age itself is on the source line above. */}
          {jamaatCaution ? (
            <Text style={styles.jamaatCaution}>{jamaatCaution}</Text>
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
    {toastMessage ? (
      <View style={styles.toastWrap} pointerEvents="none">
        <View style={styles.toast}>
          <MaterialCommunityIcons
            name="check-circle"
            size={15}
            color={colors.positive}
          />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      </View>
    ) : null}
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
    position: "relative",
  },
  heroArchWatermark: {
    position: "absolute",
    right: -10,
    bottom: -15,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  // No `opacity` on any of the three: white has only 5.02:1 to spend on this
  // green, and dimming it to 0.9 fails AA at 14px (theme.test.ts asserts the
  // composites). Size and weight carry the hierarchy.
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
    // Matches prayerRow: without it the headings hang left of their columns.
    paddingHorizontal: spacing.s,
  },
  prayerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TARGET,
    paddingHorizontal: spacing.s,
    borderRadius: radius.m,
  },
  prayerRowUpcoming: {
    backgroundColor: colors.accentSoft,
  },
  prayerNameWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
  },
  prayerNameCell: {
    ...type.body,
    color: colors.text,
  },
  prayerNameCellUpcoming: {
    color: colors.accent,
    fontWeight: "700",
  },
  nextPill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
  nextPillText: {
    ...type.caption,
    color: colors.canvas,
    fontWeight: "700",
    fontSize: 10,
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
  prayerJamaatCellUpcoming: {
    color: colors.accent,
  },
  prayerCalculatedCell: {
    minWidth: 64,
    flexShrink: 0,
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    ...numeric,
  },
  toastWrap: {
    position: "absolute",
    bottom: spacing.xxl + 20,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
    borderRadius: radius.pill,
    ...cardEdge(scheme, colors),
  },
  toastText: {
    ...type.footnote,
    fontWeight: "600",
    color: colors.text,
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
