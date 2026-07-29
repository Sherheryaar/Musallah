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

import { FacilityKey, Place } from "@/data/places";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import BottomSheet from "@/components/BottomSheet";
import FilterSheet from "@/components/FilterSheet";
import PlaceCard from "@/components/PlaceCard";
import PlacesMap from "@/components/PlacesMap";
import SuggestionForm from "@/components/SuggestionForm";
import { distanceKm, formatDistance } from "@/lib/distance";
import { FALLBACK_LOCATION, isInCoverage } from "@/lib/geo";
import { computePrayerTimes, PrayerTimes } from "@/lib/prayerTimes";
import { submitNewPlaceSuggestion } from "@/lib/feedback";
import { colors, radius, spacing } from "@/lib/theme";

// The list shows a handful of nearby, reasonable options -- not the whole
// dataset. The map still shows every matching pin.
const MAX_LIST_RESULTS = 12;
const MAX_LIST_DISTANCE_KM = 30;
const MIN_LIST_RESULTS = 5;

type Result = { place: Place; km: number };
type SearchOrigin = { lat: number; lng: number; label: string };

// Module-level so the reference is stable across renders (helps FlatList).
const keyExtractor = (item: Result) => item.place.id;

/** Local calendar day, e.g. "2026-7-29" — changes exactly at midnight. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function HomeScreen() {
  const router = useRouter();
  // Bottom inset keeps the list clear of the Android gesture/nav bar
  // (the app draws edge-to-edge on Android).
  const insets = useSafeAreaInsets();
  const { places } = usePlaces();
  const { settings, updateSettings } = useSettings();
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
    () => updateSettings({ facilityFilters: [] }),
    [updateSettings],
  );

  // "I'm going here" -- geocode the query and measure distances from there.
  // Hits are only accepted inside the coverage area: the platform geocoder
  // resolves "Stratford" to Stratford-upon-Avon (or Ontario) just as happily
  // as Stratford E15, and anchoring distances there would be silently wrong.
  const searchArea = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    Keyboard.dismiss();
    if (Platform.OS === "web") return; // typing already filters names on web
    setSearchNote(null);
    try {
      const findHit = async (q: string) =>
        (await Location.geocodeAsync(q)).find((m) =>
          isInCoverage(m.latitude, m.longitude),
        ) ?? null;
      const hit =
        (await findHit(text)) ??
        (text.toLowerCase().includes("london")
          ? null
          : await findHit(`${text}, London`));
      if (hit) {
        setSearchOrigin({ lat: hit.latitude, lng: hit.longitude, label: text });
        setQuery("");
      } else {
        setSearchNote(
          `Couldn't find "${text}" in the London area \u2014 showing name matches instead.`,
        );
      }
    } catch {
      setSearchNote(
        "Area search needs a connection \u2014 try a place name instead.",
      );
    }
  }, [query]);

  const clearSearchOrigin = useCallback(() => {
    setSearchOrigin(null);
    setSearchNote(null);
  }, []);

  const gpsOrigin = location ?? FALLBACK_LOCATION;
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
  const byDistance = useMemo<Result[]>(
    () =>
      places
        .map((place) => ({
          place,
          km: distanceKm(origin.lat, origin.lng, place.lat, place.lng),
        }))
        .sort((a, b) => a.km - b.km),
    [places, origin.lat, origin.lng],
  );

  // Filter (must have ALL selected facilities + match the typed query),
  // preserving nearest-first order. Jumu'ah-only venues are hidden by
  // default, but a typed query overrides that: searching a venue by name is
  // a stronger signal of intent than the default suppression.
  const results = useMemo(() => {
    const selected = [...activeFilters]; // spread once, not once per place
    const q = query.trim().toLowerCase();
    return byDistance.filter(
      ({ place }) =>
        selected.every((key) => place.facilities[key]) &&
        (!place.jumuahOnly || activeFilters.has("jumuah") || q.length > 0) &&
        (!q ||
          place.name.toLowerCase().includes(q) ||
          place.address.toLowerCase().includes(q)),
    );
  }, [byDistance, activeFilters, query]);

  // The list only shows the nearest few reasonable options. When the user is
  // typing a name search, show matches regardless of distance.
  const listResults = useMemo(() => {
    if (query.trim()) return results.slice(0, 25);
    const within = results.filter((r) => r.km <= MAX_LIST_DISTANCE_KM);
    const base =
      within.length >= MIN_LIST_RESULTS
        ? within
        : results.slice(0, MIN_LIST_RESULTS);
    return base.slice(0, MAX_LIST_RESULTS);
  }, [results, query]);

  // Stable callbacks keep React.memo'd rows from re-rendering needlessly.
  const openPlace = useCallback(
    (id: string) => router.push(`/place/${id}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Result }) => (
      <PlaceCard
        place={item.place}
        distanceLabel={formatDistance(item.km)}
        onPress={openPlace}
      />
    ),
    [openPlace],
  );

  const searchRow = (
    <View style={styles.searchRow}>
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
      <TouchableOpacity
        style={[
          styles.filterButton,
          activeFilters.size > 0 && styles.filterButtonActive,
        ]}
        onPress={() => setShowFilters(true)}
        accessibilityRole="button"
        accessibilityLabel="Open filters"
      >
        <Text
          style={[
            styles.filterButtonLabel,
            activeFilters.size > 0 && styles.filterButtonLabelActive,
          ]}
        >
          {activeFilters.size > 0
            ? `Filters (${activeFilters.size})`
            : "Filters"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const contextChips =
    searchOrigin || searchNote ? (
      <View style={styles.contextRow}>
        {searchOrigin ? (
          <TouchableOpacity
            style={styles.nearChip}
            onPress={clearSearchOrigin}
            accessibilityRole="button"
            accessibilityLabel={`Stop searching near ${searchOrigin.label}`}
          >
            <Text style={styles.nearChipLabel}>
              {`Near "${searchOrigin.label}"  \u2715`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {searchNote ? <Text style={styles.searchNote}>{searchNote}</Text> : null}
      </View>
    ) : null;

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
            Try removing a filter \u2014 or this is a gap in the data worth
            fixing.
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
      // The form lives ONLY in the footer (which renders below the empty
      // state too). A second copy in ListEmptyComponent used to remount --
      // and wipe -- a half-typed draft whenever a keystroke toggled the list
      // between empty and non-empty.
      ListFooterComponent={
        <View style={styles.listFooter}>
          {showNewPlaceForm ? (
            <SuggestionForm
              placeholder="Name, address, type, facilities, and a link if you have one..."
              onSend={submitNewPlaceSuggestion}
            />
          ) : listResults.length > 0 ? (
            // The empty state has its own "Add a missing place" CTA.
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
          ) : null}
        </View>
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
              onSelect={openPlace}
            />
          </View>
          <View style={styles.overlayTop} pointerEvents="box-none">
            {searchRow}
            {contextChips}
            {usingFallback ? (
              <Text style={styles.fallbackNote}>
                Using central London {"\u2014"} enable location for accurate
                results.
              </Text>
            ) : null}
          </View>
          <BottomSheet>
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
        onToggle={toggleFilter}
        onClear={clearFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  searchInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.canvas,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.l,
    fontSize: 15,
    color: colors.text,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
  nearChip: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  nearChipLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
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
