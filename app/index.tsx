import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import { FacilityKey, isCorroborated, Place } from "@/data/places";
import { useNotifications } from "@/context/NotificationsContext";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import BottomSheet from "@/components/BottomSheet";
import FilterSheet from "@/components/FilterSheet";
import PlaceCard from "@/components/PlaceCard";
import PlacesMap from "@/components/PlacesMap";
import SuggestionSheet from "@/components/SuggestionSheet";
import { distanceKm, formatDistance } from "@/lib/distance";
import { fuzzyMatches, tokenize } from "@/lib/fuzzy";
import {
  FALLBACK_LOCATION,
  isInCoverage,
  queryMatchesPlaceFields,
} from "@/lib/geo";
import { computePrayerTimes, PrayerTimes } from "@/lib/prayerTimes";
import { submitNewPlaceSuggestion } from "@/lib/feedback";
import { useTheme } from "@/context/ThemeContext";
import {
  placeTypeColors,
  radius,
  spacing,
  type ThemeColors,
} from "@/lib/theme";

// The list shows a handful of nearby, reasonable options -- not the whole
// dataset. The map receives ALL filtered results and picks what to render
// per viewport itself (see src/lib/mapPins.ts), so panning to another city
// shows that city's pins.
const MAX_LIST_RESULTS = 12;
const MAX_LIST_DISTANCE_KM = 30;
const MIN_LIST_RESULTS = 5;

const LEGEND_ITEMS: { type: keyof typeof placeTypeColors; label: string }[] = [
  { type: "masjid", label: "Masjid" },
  { type: "musalla", label: "Prayer room" },
  { type: "multi_faith_room", label: "Multi-faith" },
];

// km: distance from the active anchor (searched area or user) — used for
// selection and ordering. kmFromUser: distance from the user's own location
// — what the row LABEL shows, because that's the journey they'd make.
type Result = { place: Place; km: number; kmFromUser: number };
type SearchOrigin = { lat: number; lng: number; label: string };

// Module-level so the reference is stable across renders (helps FlatList).
const keyExtractor = (item: Result) => item.place.id;

/** Local calendar day, e.g. "2026-7-29" — changes exactly at midnight. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  // Bottom inset keeps the list clear of the Android gesture/nav bar
  // (the app draws edge-to-edge on Android).
  const insets = useSafeAreaInsets();
  const { places } = usePlaces();
  const { settings, updateSettings } = useSettings();
  const { reportLocation } = useNotifications();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [usingFallback, setUsingFallback] = useState(false);
  const [showNewPlaceForm, setShowNewPlaceForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOrigin, setSearchOrigin] = useState<SearchOrigin | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState(() => todayKey());
  const [recenterNonce, setRecenterNonce] = useState(0);

  // Roll the prayer-times bar over at midnight. Without this the memo below
  // never re-runs on a new day: a user who leaves the app open (or foregrounds
  // it the next morning without moving 250 m) would see yesterday's times.
  useEffect(() => {
    const update = () =>
      setDateKey((prev) => {
        const next = todayKey();
        return next === prev ? prev : next;
      });
    const id = setInterval(update, 30_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  // Get location once at launch, then keep it updated as the user moves
  // (re-sorts distances after every ~250 m). No account, no tracking --
  // everything is processed on-device.
  useEffect(() => {
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;
    (async () => {
      let coords = FALLBACK_LOCATION;
      let fellBack = true;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          // A recent cached fix is instant; only wait for a fresh GPS
          // reading if there is no fix from the last 5 minutes.
          const pos =
            (await Location.getLastKnownPositionAsync({
              maxAge: 5 * 60 * 1000,
            })) ??
            (await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }));
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          fellBack = false;
          watcher = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 30 * 1000,
              distanceInterval: 250,
            },
            (p) => {
              if (!cancelled) {
                setLocation({
                  lat: p.coords.latitude,
                  lng: p.coords.longitude,
                });
              }
            },
          );
        }
      } catch {
        // Keep fallback -- the app must still work without location.
      }
      if (cancelled) {
        watcher?.remove();
        return;
      }
      setLocation(coords);
      setUsingFallback(fellBack);
    })();
    return () => {
      cancelled = true;
      watcher?.remove();
    };
  }, []);

  // Facility filters live in Settings storage, so a choice like "sisters'
  // space" made on first launch is remembered on every later launch.
  const activeFilters = useMemo(
    () => new Set(settings.facilityFilters),
    [settings.facilityFilters],
  );

  const toggleFilter = useCallback(
    (key: FacilityKey) => {
      const next = new Set(settings.facilityFilters);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      updateSettings({ facilityFilters: [...next] });
    },
    [settings.facilityFilters, updateSettings],
  );

  const clearFilters = useCallback(
    () => updateSettings({ facilityFilters: [], corroboratedOnly: false }),
    [updateSettings],
  );

  const toggleCorroborated = useCallback(
    () => updateSettings({ corroboratedOnly: !settings.corroboratedOnly }),
    [settings.corroboratedOnly, updateSettings],
  );

  const gpsOrigin = location ?? FALLBACK_LOCATION;

  // Feed fixes to the notification scheduler so its prayer times track the
  // user's real location (it tops up its rolling window from here).
  useEffect(() => {
    if (location && !usingFallback) {
      reportLocation(location.lat, location.lng);
    }
  }, [location, usingFallback, reportLocation]);

  // "I'm going here" -- geocode the query and measure distances from there.
  // Hits outside the UK & Ireland are rejected ("Paris" must not re-anchor
  // every distance to France), and ambiguity inside the box ("Stratford" in
  // London vs Stratford-upon-Avon) is resolved by picking the geocoder hit
  // NEAREST the user -- the local one is almost always the one they meant.
  const searchArea = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    Keyboard.dismiss();
    if (Platform.OS === "web") return; // typing already filters names on web
    setSearchNote(null);
    try {
      const nearestHit = async (q: string) => {
        const matches = (await Location.geocodeAsync(q)).filter((m) =>
          isInCoverage(m.latitude, m.longitude),
        );
        if (matches.length === 0) return null;
        return matches.reduce((best, m) =>
          distanceKm(gpsOrigin.lat, gpsOrigin.lng, m.latitude, m.longitude) <
          distanceKm(gpsOrigin.lat, gpsOrigin.lng, best.latitude, best.longitude)
            ? m
            : best,
        );
      };
      // Geocoders resolve even gibberish to SOMEWHERE rather than fail, so
      // a hit must also pass a sanity check: reverse-geocode it and require
      // something the user typed to appear in what that place is actually
      // called. Otherwise "asdf qwerty" quietly re-anchors to a random
      // village. (If reverse geocoding itself fails, trust the hit.)
      const looksRight = async (hit: {
        latitude: number;
        longitude: number;
      }) => {
        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: hit.latitude,
            longitude: hit.longitude,
          });
          const fields = rev
            .slice(0, 3)
            .flatMap((a) => [
              a.name,
              a.street,
              a.district,
              a.city,
              a.subregion,
              a.region,
              a.postalCode,
            ]);
          return queryMatchesPlaceFields(text, fields);
        } catch {
          return true;
        }
      };
      const hit = (await nearestHit(text)) ?? (await nearestHit(`${text}, UK`));
      if (hit && (await looksRight(hit))) {
        // The query stays in the box \u2014 it IS the search state ("Near X"
        // lives in the input, not a separate chip).
        setSearchOrigin({ lat: hit.latitude, lng: hit.longitude, label: text });
      } else {
        setSearchNote(
          `Couldn't find "${text}" \u2014 showing name matches instead.`,
        );
      }
    } catch {
      setSearchNote(
        "Area search needs a connection \u2014 try a place name instead.",
      );
    }
  }, [query, gpsOrigin.lat, gpsOrigin.lng]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setSearchOrigin(null);
    setSearchNote(null);
  }, []);

  // "Back to my location": fly the map home and drop any search, so
  // distances re-anchor to the user at the same time as the view does.
  const recenter = useCallback(() => {
    clearSearch();
    setRecenterNonce((n) => n + 1);
  }, [clearSearch]);

  // Distances come from the searched area when one is set; prayer times
  // always follow the user's real location.
  const origin = searchOrigin ?? gpsOrigin;

  // Only the calculation-relevant settings: depending on the whole settings
  // object meant toggling a facility filter recomputed prayer times.
  const calcOptions = useMemo(
    () => ({
      method: settings.method,
      madhab: settings.madhab,
      shafaq: settings.shafaq,
    }),
    [settings.method, settings.madhab, settings.shafaq],
  );

  // Prayer times are computed on-device (see src/lib/prayerCalc.ts) --
  // instant and offline, following the user's Settings choices. dateKey is a
  // deliberate dependency: it invalidates this memo at midnight.
  const times = useMemo<PrayerTimes | null>(
    () => computePrayerTimes(gpsOrigin.lat, gpsOrigin.lng, calcOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gpsOrigin.lat, gpsOrigin.lng, calcOptions, dateKey],
  );

  // Two-stage memo: distances/sorting only recompute when location or data
  // changes -- NOT on every filter toggle or keystroke.
  // When an area search is active the two anchors differ: places are chosen
  // and ordered around the searched area (km), but each row is labelled
  // with the distance from the user (kmFromUser) — "the masjids in London,
  // and how far each one is from me".
  const byDistance = useMemo<Result[]>(
    () =>
      places
        .map((place) => ({
          place,
          km: distanceKm(origin.lat, origin.lng, place.lat, place.lng),
          kmFromUser: distanceKm(
            gpsOrigin.lat,
            gpsOrigin.lng,
            place.lat,
            place.lng,
          ),
        }))
        .sort((a, b) => a.km - b.km),
    [places, origin.lat, origin.lng, gpsOrigin.lat, gpsOrigin.lng],
  );

  // Pre-tokenised name+address per place, so typo-tolerant matching doesn't
  // re-tokenise 2,000+ strings on every keystroke.
  const searchTokens = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const place of places) {
      map.set(place.id, tokenize(`${place.name} ${place.address}`));
    }
    return map;
  }, [places]);

  // The search box doubles as the area anchor and the live name filter.
  // While its text is exactly the anchored area ("Stratford"), it's an
  // AREA, not a name filter — filtering names by it too would hide every
  // place not literally called Stratford. The moment the user edits the
  // text, it's a name query again.
  const effectiveQuery =
    searchOrigin &&
    query.trim().toLowerCase() === searchOrigin.label.trim().toLowerCase()
      ? ""
      : query.trim();

  // Filter (must have ALL selected facilities + match the typed query),
  // preserving nearest-first order. Jumu'ah-only venues are hidden by
  // default, but a typed query overrides that: searching a venue by name is
  // a stronger signal of intent than the default suppression.
  //
  // Query matching runs in two tiers: exact substring matches first, then
  // typo-tolerant matches ("birmingam", "masjed", "mosque"→masjid) — so a
  // spelling mistake still finds the place, but exact hits always outrank
  // guesses. Distance order is preserved within each tier.
  const results = useMemo(() => {
    const selected = [...activeFilters]; // spread once, not once per place
    const q = effectiveQuery.toLowerCase();
    const base = byDistance.filter(
      ({ place }) =>
        selected.every((key) => place.facilities[key]) &&
        (!settings.corroboratedOnly || isCorroborated(place)) &&
        (!place.jumuahOnly || activeFilters.has("jumuah") || q.length > 0),
    );
    if (!q) return base;
    const exact: Result[] = [];
    const fuzzy: Result[] = [];
    for (const result of base) {
      const { place } = result;
      if (
        place.name.toLowerCase().includes(q) ||
        place.address.toLowerCase().includes(q)
      ) {
        exact.push(result);
      } else if (fuzzyMatches(searchTokens.get(place.id) ?? [], q)) {
        fuzzy.push(result);
      }
    }
    return exact.concat(fuzzy);
  }, [
    byDistance,
    activeFilters,
    effectiveQuery,
    searchTokens,
    settings.corroboratedOnly,
  ]);

  // The list only shows the nearest few reasonable options. When the user is
  // typing a name search, show matches regardless of distance.
  const listResults = useMemo(() => {
    if (effectiveQuery) return results.slice(0, 25);
    const within = results.filter((r) => r.km <= MAX_LIST_DISTANCE_KM);
    const base =
      within.length >= MIN_LIST_RESULTS
        ? within
        : results.slice(0, MIN_LIST_RESULTS);
    return base.slice(0, MAX_LIST_RESULTS);
  }, [results, effectiveQuery]);

  // Stable callbacks keep React.memo'd rows from re-rendering needlessly.
  const openPlace = useCallback(
    (id: string) => router.push(`/place/${id}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Result }) => (
      <PlaceCard
        place={item.place}
        distanceLabel={formatDistance(item.kmFromUser)}
        onPress={openPlace}
      />
    ),
    [openPlace],
  );

  const filterCount = activeFilters.size + (settings.corroboratedOnly ? 1 : 0);

  const searchRow = (
    <View style={styles.searchRow}>
      <View style={styles.searchInputWrap}>
        <TextInput
          style={styles.searchInput}
          // Area search is native-only (no geocoder on web) -- don't promise it.
          placeholder={
            Platform.OS === "web"
              ? "Search by name or address..."
              : 'Try "Stratford" or a masjid name...'
          }
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={searchArea}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search for an area or place"
        />
        {query.length > 0 || searchOrigin ? (
          // One search at a time: the box holds it, this clears it. (The
          // old separate "Near X" pill read like stackable filter tags.)
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearSearch}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearGlyph}>{"✕"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        style={[
          styles.filterButton,
          filterCount > 0 && styles.filterButtonActive,
        ]}
        onPress={() => setShowFilters(true)}
        accessibilityRole="button"
        accessibilityLabel="Open filters"
      >
        <Text
          style={[
            styles.filterButtonLabel,
            filterCount > 0 && styles.filterButtonLabelActive,
          ]}
        >
          {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const searchNoteRow = searchNote ? (
    <View style={styles.contextRow}>
      <Text style={styles.searchNote}>{searchNote}</Text>
    </View>
  ) : null;

  // What each pin colour means. Sits under the search bar (the bottom of the
  // map is covered by the list sheet, so a bottom-corner key would be hidden
  // at the default sheet position).
  const mapLegend = (
    <View
      style={styles.legend}
      accessibilityLabel="Map key: green is a masjid, amber is a prayer room, purple is a multi-faith room. The blue dot is your location. A numbered circle groups several places — tap it to zoom in."
    >
      {LEGEND_ITEMS.map(({ type, label }) => (
        <View key={type} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: placeTypeColors[type] },
            ]}
          />
          <Text style={styles.legendLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );

  const timesBar = times ? (
    <TouchableOpacity
      style={styles.timesBar}
      onPress={() => router.push("/prayer")}
      accessibilityRole="button"
      accessibilityLabel="Open prayer times"
      activeOpacity={0.7}
    >
      {(
        [
          ["Fajr", times.Fajr],
          ["Dhuhr", times.Dhuhr],
          ["Asr", times.Asr],
          ["Maghrib", times.Maghrib],
          ["Isha", times.Isha],
        ] as const
      ).map(([label, value]) => (
        <View key={label} style={styles.timeItem}>
          <Text style={styles.timeLabel}>{label}</Text>
          <Text style={styles.timeValue}>{value}</Text>
        </View>
      ))}
      <Text style={styles.timesChevron}>{"\u203A"}</Text>
    </TouchableOpacity>
  ) : null;

  const list = (
    <FlatList
      style={styles.listContainer}
      data={listResults}
      keyExtractor={keyExtractor}
      // Render tuning: draw a screenful quickly, keep a modest window
      // mounted instead of the whole list.
      initialNumToRender={8}
      maxToRenderPerBatch={10}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.list,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
      renderItem={renderItem}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No places match</Text>
          <Text style={styles.emptyText}>
            Try removing a filter {"\u2014"} or this is a gap in the data
            worth fixing.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowNewPlaceForm(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a missing place"
          >
            <Text style={styles.emptyButtonLabel}>Add a missing place</Text>
          </TouchableOpacity>
        </View>
      }
      // The form itself lives in a top-anchored SuggestionSheet overlay
      // (rendered at the screen root) — inline in the footer, the keyboard
      // covered it as you typed.
      ListFooterComponent={
        listResults.length > 0 ? (
          // The empty state has its own "Add a missing place" CTA.
          <View style={styles.listFooter}>
            <View style={styles.listFooterRow}>
              <Text style={styles.listFooterText}>Missing a place? </Text>
              <TouchableOpacity
                onPress={() => setShowNewPlaceForm(true)}
                accessibilityRole="button"
                accessibilityLabel="Suggest a missing place"
              >
                <Text style={styles.listFooterLink}>Suggest it</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null
      }
    />
  );

  return (
    <View style={styles.screen}>
      {Platform.OS !== "web" ? (
        <>
          {/* Map-first: the map fills the screen; the list floats above it. */}
          <View style={StyleSheet.absoluteFill}>
            <PlacesMap
              results={results}
              userLocation={location}
              focus={searchOrigin}
              recenterNonce={recenterNonce}
              onSelect={openPlace}
            />
          </View>
          <View style={styles.overlayTop} pointerEvents="box-none">
            {searchRow}
            {searchNoteRow}
            {mapLegend}
            {usingFallback ? (
              <Text style={styles.fallbackNote}>
                Using central London {"\u2014"} enable location for accurate
                results.
              </Text>
            ) : null}
          </View>
          <BottomSheet
            aboveSheet={
              <TouchableOpacity
                style={styles.recenterButton}
                onPress={recenter}
                accessibilityRole="button"
                accessibilityLabel="Back to my location"
              >
                {/* Blue on purpose — it points at the blue you-are-here dot. */}
                <Text style={styles.recenterGlyph}>{"◎"}</Text>
              </TouchableOpacity>
            }
          >
            {timesBar}
            {list}
          </BottomSheet>
        </>
      ) : (
        <View style={styles.container}>
          {searchRow}
          {timesBar}
          {usingFallback ? (
            <Text style={styles.fallbackNoteWeb}>
              Showing distances and prayer times for central London {"\u2014"}
              enable location for accurate results.
            </Text>
          ) : null}
          {list}
        </View>
      )}
      <FilterSheet
        visible={showFilters}
        active={activeFilters}
        corroboratedOnly={settings.corroboratedOnly}
        onToggle={toggleFilter}
        onToggleCorroborated={toggleCorroborated}
        onClear={clearFilters}
        onClose={() => setShowFilters(false)}
      />
      <SuggestionSheet
        visible={showNewPlaceForm}
        title="Add a missing place"
        placeholder="Name, address, type, facilities, and a link if you have one..."
        onSend={submitNewPlaceSuggestion}
        onClose={() => setShowNewPlaceForm(false)}
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
  // Keeps content phone-width on desktop browsers instead of stretching
  // edge-to-edge (the app is mobile-first; web gets a centered column).
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    ...Platform.select({
      web: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.border,
      },
    }),
  },
  overlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.m,
    gap: spacing.s,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.s,
    ...Platform.select({
      web: { padding: spacing.m },
    }),
  },
  searchInputWrap: {
    flex: 1,
    justifyContent: "center",
  },
  searchInput: {
    minHeight: 44,
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.l,
    paddingRight: spacing.xl + spacing.m, // room for the ✕ so text never runs under it
    fontSize: 15,
    color: colors.text,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  clearButton: {
    position: "absolute",
    right: spacing.m,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  clearGlyph: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  filterButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.l,
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  filterButtonActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  filterButtonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  filterButtonLabelActive: {
    color: colors.accent,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.s,
  },
  searchNote: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.m,
    overflow: "hidden",
  },
  legend: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.m,
    backgroundColor: colors.canvas,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.canvas,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  fallbackNote: {
    alignSelf: "flex-start",
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.m,
    overflow: "hidden",
  },
  fallbackNoteWeb: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
  },
  timesBar: {
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.m,
  },
  timeItem: {
    // Equal-width slots so times distribute evenly on any screen width.
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  timeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  timesChevron: {
    fontSize: 18,
    color: colors.textSecondary,
    alignSelf: "center",
  },
  recenterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    // Below the sheet's elevation (12) so the sheet slides over it when
    // dragged to full — see BottomSheet's aboveSheet contract.
    elevation: 4,
  },
  recenterGlyph: {
    fontSize: 24,
    lineHeight: 28,
    color: colors.accent,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    padding: spacing.l,
    gap: spacing.m,
  },
  empty: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.s,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: spacing.s,
  },
  emptyButtonLabel: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: "600",
  },
  listFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.m,
    width: "100%",
  },
  listFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  listFooterText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  listFooterLink: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: "600",
  },
});
