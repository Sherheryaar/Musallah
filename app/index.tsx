import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, FlatList, Keyboard, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import BottomSheet from "@/components/BottomSheet";
import FilterSheet from "@/components/FilterSheet";
import EmptyState from "@/components/home/EmptyState";
import FridayBanner from "@/components/home/FridayBanner";
import MapLegend from "@/components/home/MapLegend";
import NextPrayerBar from "@/components/home/NextPrayerBar";
import QuickFilterStrip, {
  type QuickFilterKey,
} from "@/components/home/QuickFilterStrip";
import SearchBar from "@/components/home/SearchBar";
import OfflineScreen from "@/components/OfflineScreen";
import Onboarding from "@/components/Onboarding";
import PlaceCard from "@/components/PlaceCard";
import PlacesMap from "@/components/PlacesMap";
import PlacesSkeleton from "@/components/PlacesSkeleton";
import SuggestionSheet from "@/components/SuggestionSheet";
import Touchable from "@/components/Touchable";
import { useFavourites } from "@/context/FavouritesContext";
import { useNotifications } from "@/context/NotificationsContext";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { FacilityKey, isCorroborated, Place } from "@/data/places";
import { distanceFrom, distanceKm, formatDistance } from "@/lib/distance";
import { floatingEdge } from "@/lib/elevation";
import { submitNewPlaceSuggestion } from "@/lib/feedback";
import { fuzzyMatchesTokens, tokenize } from "@/lib/fuzzy";
import {
  FALLBACK_LOCATION,
  isInCoverage,
  queryMatchesPlaceFields,
} from "@/lib/geo";
import { hapticSelection } from "@/lib/haptics";
import { createThemedStyles } from "@/lib/themedStyles";
import { radius, spacing, type, type ThemeColors } from "@/lib/theme";
import { useDeviceLocation } from "@/lib/useDeviceLocation";

// The list shows a handful of nearby, reasonable options -- not the whole
// dataset. The map receives ALL filtered results and picks what to render
// per viewport itself (see src/lib/mapPins.ts), so panning to another city
// shows that city's pins.
const MAX_LIST_RESULTS = 12;
const MAX_LIST_DISTANCE_KM = 30;
const MIN_LIST_RESULTS = 5;

// km: distance from the active anchor (searched area or user) — used for
// selection and ordering. kmFromUser: distance from the user's own location
// — what the row LABEL shows, because that's the journey they'd make.
type Result = { place: Place; km: number; kmFromUser: number };
type SearchOrigin = { lat: number; lng: number; label: string };

// Module-level so the reference is stable across renders (helps FlatList).
const keyExtractor = (item: Result) => item.place.id;

/** One place's precomputed search fields — see getSearchIndex below. */
type SearchEntry = { name: string; address: string; tokens: string[] };

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  // Bottom inset keeps the list clear of the Android gesture/nav bar
  // (the app draws edge-to-edge on Android).
  const insets = useSafeAreaInsets();
  const {
    places,
    byId: placesById,
    status: placesStatus,
    refresh: refreshPlaces,
  } = usePlaces();
  const { settings, updateSettings, calcOptions } = useSettings();
  const { reportLocation } = useNotifications();
  const { ids: favouriteIds, idSet: savedIdSet } = useFavourites();
  const [showNewPlaceForm, setShowNewPlaceForm] = useState(false);
  const [fridayNoticeDismissed, setFridayNoticeDismissed] = useState(false);
  // Re-checked when the app is foregrounded rather than on a timer: the
  // realistic case is the app being reopened on Friday, not left running
  // across midnight into it.
  const [isFriday, setIsFriday] = useState(() => new Date().getDay() === 5);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setIsFriday(new Date().getDay() === 5);
    });
    return () => sub.remove();
  }, []);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOrigin, setSearchOrigin] = useState<SearchOrigin | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  // Bumped whenever the search state changes — a new searchArea() call or a
  // clearSearch() — so a slower, out-of-order geocode response can tell it's
  // been superseded and skip applying its result.
  const searchGeneration = useRef(0);
  const [recenterNonce, setRecenterNonce] = useState(0);
  // The location read waits for onboarding to resolve. iOS allows exactly
  // one permission prompt, so it must not fire before the user has been
  // told what it is for.
  const [locationAllowed, setLocationAllowed] = useState(false);
  const allowLocationRead = useCallback(() => setLocationAllowed(true), []);
  // Once at launch, then updated as the user moves (re-sorts distances after
  // every ~250 m). Everything is processed on-device.
  const { coords: location, usingFallback } = useDeviceLocation({
    prompt: true,
    watch: true,
    enabled: locationAllowed,
  });

  // Facility filters live in Settings storage, so a choice like "sisters'
  // space" made on first launch is remembered on every later launch.
  const activeFilters = useMemo(
    () => new Set(settings.facilityFilters),
    [settings.facilityFilters],
  );

  const toggleFilter = useCallback(
    (key: FacilityKey) => {
      const next = new Set(settings.facilityFilters);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      updateSettings({ facilityFilters: [...next] });
    },
    [settings.facilityFilters, updateSettings],
  );

  const clearFilters = useCallback(
    () =>
      updateSettings({
        facilityFilters: [],
        corroboratedOnly: false,
        savedOnly: false,
      }),
    [updateSettings],
  );

  const toggleCorroborated = useCallback(
    () => updateSettings({ corroboratedOnly: !settings.corroboratedOnly }),
    [settings.corroboratedOnly, updateSettings],
  );

  const toggleSaved = useCallback(
    () => updateSettings({ savedOnly: !settings.savedOnly }),
    [settings.savedOnly, updateSettings],
  );

  const toggleQuickFilter = useCallback(
    (key: QuickFilterKey) => {
      hapticSelection(settings.hapticFeedback);
      if (key === "saved") toggleSaved();
      else toggleFilter(key);
    },
    [settings.hapticFeedback, toggleSaved, toggleFilter],
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
    // A slower search started earlier must never overwrite a newer one's
    // result: bump a generation counter, and only apply this run's outcome
    // if nothing newer started while it was awaiting the geocoder.
    const generation = ++searchGeneration.current;
    const isStale = () => searchGeneration.current !== generation;
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
      const looksRight = async (hit: { latitude: number; longitude: number }) => {
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
      const right = hit ? await looksRight(hit) : false;
      if (isStale()) return;
      if (hit && right) {
        // The query stays in the box — it IS the search state ("Near X"
        // lives in the input, not a separate chip).
        setSearchOrigin({ lat: hit.latitude, lng: hit.longitude, label: text });
      } else {
        setSearchNote(`Couldn't find "${text}" — showing name matches instead.`);
      }
    } catch {
      if (isStale()) return;
      setSearchNote("Area search needs a connection — try a place name instead.");
    }
  }, [query, gpsOrigin.lat, gpsOrigin.lng]);

  const clearSearch = useCallback(() => {
    // Clearing is itself a newer search state, so it must supersede any
    // geocode still awaiting the network — otherwise that response passes its
    // own staleness check, re-anchors every distance to the abandoned area,
    // flies the map back to it, and puts the ✕ beside an empty box.
    searchGeneration.current++;
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

  // One measuring function for the whole screen. When an area search is
  // active the two anchors differ: places are chosen and ordered around the
  // searched area (km), but each row is labelled with the distance from the
  // user (kmFromUser) — "the masjids in London, and how far each one is from
  // me". With no search they are the same point, so it measures once.
  const measure = useMemo(() => {
    const fromAnchor = distanceFrom(origin.lat, origin.lng);
    const sameAnchor =
      origin.lat === gpsOrigin.lat && origin.lng === gpsOrigin.lng;
    const fromUser = sameAnchor
      ? fromAnchor
      : distanceFrom(gpsOrigin.lat, gpsOrigin.lng);
    return (place: Place): Result => {
      const km = fromAnchor(place.lat, place.lng);
      return {
        place,
        km,
        kmFromUser: sameAnchor ? km : fromUser(place.lat, place.lng),
      };
    };
  }, [origin.lat, origin.lng, gpsOrigin.lat, gpsOrigin.lng]);

  // Distances/sorting only recompute when location or data changes -- NOT
  // on every filter toggle or keystroke.
  const byDistance = useMemo<Result[]>(
    () => places.map(measure).sort((a, b) => a.km - b.km),
    [places, measure],
  );

  // Pre-lowercased haystack and pre-tokenised name+address per place, so
  // neither the exact-substring pass nor the typo-tolerant one has to
  // re-derive them from thousands of strings on every keystroke. Built
  // LAZILY, on the first keystroke: tokenising the whole dataset costs
  // several thousand regex passes, which must not sit on the critical path
  // of the first paint for a feature the user may never touch.
  const searchIndexRef = useRef<{
    source: Place[];
    entries: Map<string, SearchEntry>;
  } | null>(null);
  const getSearchIndex = useCallback(() => {
    const cached = searchIndexRef.current;
    if (cached && cached.source === places) return cached.entries;
    const entries = new Map<string, SearchEntry>();
    for (const place of places) {
      // Name and address stay SEPARATE strings: one concatenated haystack
      // would quietly widen the exact-match pass to queries that straddle
      // the join, which the fuzzy tier already provides.
      entries.set(place.id, {
        name: place.name.toLowerCase(),
        address: place.address.toLowerCase(),
        tokens: tokenize(`${place.name} ${place.address}`),
      });
    }
    searchIndexRef.current = { source: places, entries };
    return entries;
  }, [places]);

  // Debounced text actually used to filter/recluster: the box itself
  // updates every keystroke, but re-filtering 2,000+ places and reclustering
  // the map on EVERY keystroke was measurably janky on slower devices.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(handle);
  }, [query]);

  // The search box doubles as the area anchor and the live name filter.
  // While its text is exactly the anchored area ("Stratford"), it's an
  // AREA, not a name filter — filtering names by it too would hide every
  // place not literally called Stratford. The moment the user edits the
  // text, it's a name query again.
  const effectiveQuery =
    searchOrigin &&
    debouncedQuery.trim().toLowerCase() ===
      searchOrigin.label.trim().toLowerCase()
      ? ""
      : debouncedQuery.trim();

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
        (!settings.savedOnly || savedIdSet.has(place.id)) &&
        (!place.jumuahOnly ||
          activeFilters.has("jumuah") ||
          q.length > 0 ||
          // Everything passing the saved-only filter was saved on purpose —
          // suppressing a deliberately saved jumu'ah-only venue would make
          // the filter look like it lost a place.
          settings.savedOnly ||
          // Friday: the one day these venues ARE the answer. Hired halls
          // and university rooms hold jumu'ah and nothing else, so the
          // default suppression hid exactly what the user came for, at the
          // highest-intent moment of the week.
          isFriday),
    );
    if (!q) return base;
    const index = getSearchIndex();
    // Tokenised ONCE, not once per place.
    const queryTokens = tokenize(q);
    const exact: Result[] = [];
    const fuzzy: Result[] = [];
    for (const result of base) {
      const { place } = result;
      // The index is built from the same `places` array this list came from,
      // so a miss shouldn't happen — but if it ever did, the place must still
      // be findable by name.
      const entry = index.get(place.id);
      const name = entry?.name ?? place.name.toLowerCase();
      const address = entry?.address ?? place.address.toLowerCase();
      if (name.includes(q) || address.includes(q)) {
        exact.push(result);
      } else if (fuzzyMatchesTokens(entry?.tokens ?? [], queryTokens)) {
        fuzzy.push(result);
      }
    }
    return exact.concat(fuzzy);
  }, [
    byDistance,
    activeFilters,
    effectiveQuery,
    getSearchIndex,
    settings.corroboratedOnly,
    settings.savedOnly,
    savedIdSet,
    isFriday,
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
    const capped = base
      // With the saved-only filter on, saved places ARE the list — the
      // usual "already shown in the Saved section" exclusion would empty it.
      .filter((r) => settings.savedOnly || !savedIdSet.has(r.place.id))
      .slice(0, MAX_LIST_RESULTS);
    if (!isFriday) return capped;
    // Promotion, not re-sorting: keep the nearest-first order and simply
    // float the places that PUBLISH a jumu'ah time above those that don't.
    // Deliberately not "sort by jumu'ah time" — few rows carry one, so that
    // would collapse to the ordinary distance list while looking like it
    // did something.
    const withTime = capped.filter((r) => r.place.jumuahTimes?.length);
    const withoutTime = capped.filter((r) => !r.place.jumuahTimes?.length);
    return withTime.concat(withoutTime);
  }, [results, effectiveQuery, isFriday, savedIdSet, settings.savedOnly]);

  // Saved places, in the user's own order, resolved through the id index (not
  // by scanning the sorted list). A saved id no longer in the dataset simply
  // doesn't render, which is also right when a place is removed upstream.
  const favourites = useMemo<Result[]>(
    () =>
      favouriteIds.flatMap((id) => {
        const place = placesById.get(id);
        return place ? [measure(place)] : [];
      }),
    [favouriteIds, placesById, measure],
  );

  // Stable callbacks keep React.memo'd rows from re-rendering needlessly.
  const openPlace = useCallback(
    (id: string) => router.push(`/place/${id}`),
    [router],
  );
  const openPrayer = useCallback(() => router.push("/prayer"), [router]);
  const openNewPlaceForm = useCallback(() => setShowNewPlaceForm(true), []);

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

  const filterCount =
    activeFilters.size +
    (settings.corroboratedOnly ? 1 : 0) +
    (settings.savedOnly ? 1 : 0);

  // Nothing loaded yet AND the most recent fetch failed: there's no
  // bundled/cached dataset to fall back to (by design — see
  // src/data/places.ts), so show the offline screen instead of an empty
  // map. This must come after every hook above, never before.
  if (placesStatus === "offline") {
    return <OfflineScreen onRetry={refreshPlaces} />;
  }

  return (
    <View style={styles.screen}>
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
      <View style={styles.overlayTop}>
        <SearchBar
          query={query}
          onChangeQuery={setQuery}
          onSubmit={searchArea}
          canClear={query.length > 0 || searchOrigin !== null}
          onClear={clearSearch}
          filterCount={filterCount}
          filtersOpen={showFilters}
          onOpenFilters={() => setShowFilters(true)}
        />
        {searchNote ? (
          <View style={styles.contextRow}>
            <Text style={styles.searchNote}>{searchNote}</Text>
          </View>
        ) : null}
        <MapLegend />
        {usingFallback ? (
          <Text style={styles.fallbackNote}>
            Using central London — enable location for accurate results.
          </Text>
        ) : null}
      </View>
      <BottomSheet
        aboveSheet={
          <Touchable
            style={styles.recenterButton}
            onPress={recenter}
            accessibilityRole="button"
            accessibilityLabel="Back to my location"
            // Circular FAB: a borderless ripple is the Material idiom here,
            // and it avoids clipping the view — which on Android would take
            // the elevation shadow with it.
            borderless
            rippleRadius={26}
            scaleTo={0.92}
          >
            {/* Blue on purpose — it points at the blue you-are-here dot. */}
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={24}
              color={colors.youAreHere}
            />
          </Touchable>
        }
      >
        <NextPrayerBar
          lat={gpsOrigin.lat}
          lng={gpsOrigin.lng}
          options={calcOptions}
          onPress={openPrayer}
        />
        <QuickFilterStrip
          active={activeFilters}
          savedOnly={settings.savedOnly}
          onToggle={toggleQuickFilter}
        />
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
          ListHeaderComponent={
            <>
              {/* Hidden while the saved-only filter is on: the main list IS
                  the saved places then, and this would duplicate every row. */}
              {favourites.length > 0 && !effectiveQuery && !settings.savedOnly ? (
                <View style={styles.savedSection}>
                  <Text style={styles.savedTitle}>Saved</Text>
                  {favourites.map((item) => (
                    <PlaceCard
                      key={item.place.id}
                      place={item.place}
                      distanceLabel={formatDistance(item.kmFromUser)}
                      onPress={openPlace}
                    />
                  ))}
                </View>
              ) : null}
              {isFriday && !fridayNoticeDismissed && listResults.length > 0 ? (
                <FridayBanner onDismiss={() => setFridayNoticeDismissed(true)} />
              ) : null}
            </>
          }
          // "Nothing here" and "nothing YET" are different states: during the
          // first fetch the list is legitimately empty.
          ListEmptyComponent={
            placesStatus === "loading" ? (
              <PlacesSkeleton />
            ) : (
              <EmptyState
                savedOnly={settings.savedOnly}
                filterCount={filterCount}
                onAddPlace={openNewPlaceForm}
              />
            )
          }
          // The form itself lives in a top-anchored SuggestionSheet overlay
          // (rendered at the screen root) — inline in the footer, the
          // keyboard covered it as you typed.
          ListFooterComponent={
            listResults.length > 0 ? (
              // The empty state has its own "Add a missing place" CTA.
              <View style={styles.listFooter}>
                <View style={styles.listFooterRow}>
                  <Text style={styles.listFooterText}>Missing a place? </Text>
                  <Touchable
                    onPress={openNewPlaceForm}
                    accessibilityRole="button"
                    accessibilityLabel="Suggest a missing place"
                    hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
                  >
                    <Text style={styles.listFooterLink}>Suggest it</Text>
                  </Touchable>
                </View>
              </View>
            ) : null
          }
        />
      </BottomSheet>
      <FilterSheet
        visible={showFilters}
        savedOnly={settings.savedOnly}
        onToggleSaved={toggleSaved}
        active={activeFilters}
        corroboratedOnly={settings.corroboratedOnly}
        onToggle={toggleFilter}
        onToggleCorroborated={toggleCorroborated}
        onClear={clearFilters}
        onClose={() => setShowFilters(false)}
      />
      <Onboarding onDone={allowLocationRead} />
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

const useStyles = createThemedStyles((colors: ThemeColors, scheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    overlayTop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      padding: spacing.m,
      gap: spacing.s,
      // "box-none" is what lets map gestures through the gaps between the
      // search row and the legend while those stay tappable.
      pointerEvents: "box-none",
    },
    contextRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.s,
    },
    searchNote: {
      flexShrink: 1,
      ...type.footnote,
      color: colors.textSecondary,
      backgroundColor: colors.canvas,
      paddingHorizontal: spacing.m,
      paddingVertical: spacing.s,
      borderRadius: radius.m,
      overflow: "hidden",
    },
    fallbackNote: {
      alignSelf: "flex-start",
      ...type.footnote,
      color: colors.textSecondary,
      backgroundColor: colors.canvas,
      paddingHorizontal: spacing.m,
      paddingVertical: spacing.s,
      borderRadius: radius.m,
      overflow: "hidden",
    },
    recenterButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.canvas,
      alignItems: "center",
      justifyContent: "center",
      // Floating (Android elevation 6) sits below the sheet's 12, so the
      // sheet keeps sliding over this when dragged to full — BottomSheet's
      // aboveSheet contract.
      ...floatingEdge(scheme, colors),
    },
    listContainer: {
      flex: 1,
    },
    list: {
      padding: spacing.l,
      gap: spacing.m,
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
      ...type.subhead,
      color: colors.textSecondary,
    },
    listFooterLink: {
      ...type.subhead,
      color: colors.accent,
      fontWeight: "600",
    },
    savedSection: {
      gap: spacing.m,
      marginBottom: spacing.l,
    },
    savedTitle: {
      ...type.eyebrow,
      color: colors.textSecondary,
    },
  }),
);
