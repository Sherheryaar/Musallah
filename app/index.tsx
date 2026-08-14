import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import Touchable from "@/components/Touchable";
import { FacilityKey, isCorroborated, Place } from "@/data/places";
import { useFavourites } from "@/context/FavouritesContext";
import { useNotifications } from "@/context/NotificationsContext";
import { usePlaces } from "@/context/PlacesContext";
import { useSettings } from "@/context/SettingsContext";
import BottomSheet from "@/components/BottomSheet";
import FilterSheet from "@/components/FilterSheet";
import OfflineScreen from "@/components/OfflineScreen";
import Onboarding from "@/components/Onboarding";
import PlaceCard from "@/components/PlaceCard";
import PlacesMap from "@/components/PlacesMap";
import PlacesSkeleton from "@/components/PlacesSkeleton";
import SuggestionSheet from "@/components/SuggestionSheet";
import { distanceFrom, distanceKm, formatDistance } from "@/lib/distance";
import { fuzzyMatchesTokens, tokenize } from "@/lib/fuzzy";
import {
  FALLBACK_LOCATION,
  isInCoverage,
  queryMatchesPlaceFields,
} from "@/lib/geo";
import { CalcOptions, computePrayerSchedule } from "@/lib/prayerTimes";
import { submitNewPlaceSuggestion } from "@/lib/feedback";
import { useTheme } from "@/context/ThemeContext";
import { cardEdge, elevation } from "@/lib/elevation";
import { MIN_TARGET } from "@/lib/metrics";
import { createThemedStyles } from "@/lib/themedStyles";
import {
  numeric,
  placeTypeColors,
  radius,
  spacing,
  type,
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

/** One place's precomputed search fields — see getSearchIndex below. */
type SearchEntry = { name: string; address: string; tokens: string[] };

/**
 * The times bar answers the question people actually have — "when is the
 * next prayer?" — with the following ones small beside it and a progress
 * line through the current window. Self-contained and memoized so its
 * 30-second countdown tick re-renders THIS bar, not the map and list.
 */
const NextPrayerBar = React.memo(function NextPrayerBar({
  lat,
  lng,
  options,
  onPress,
}: {
  lat: number;
  lng: number;
  options: CalcOptions;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // A fixed 30s interval ticks at an arbitrary phase, so the displayed
    // minute changed up to 30s late — "1 min" could sit on screen while the
    // prayer time actually passed. Sleeping to the next minute BOUNDARY and
    // rescheduling keeps the label honest and halves the wake-ups.
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      id = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    id = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    // Refresh immediately on foreground — the timer may have been frozen
    // for hours in the background.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, []);

  const info = useMemo(() => {
    // Sunrise isn't a prayer; yesterday/tomorrow bracket the edges (before
    // Fajr the "current window" started at yesterday's Isha; after Isha
    // the next prayer is tomorrow's Fajr).
    const prayersOf = (d: Date) =>
      (computePrayerSchedule(lat, lng, options, d) ?? []).filter(
        (e) => e.key !== "sunrise",
      );
    const all = [
      ...prayersOf(new Date(now - 86_400_000)),
      ...prayersOf(new Date(now)),
      ...prayersOf(new Date(now + 86_400_000)),
    ];
    const idx = all.findIndex((e) => e.time.getTime() > now);
    if (idx < 0) return null; // polar conditions
    const next = all[idx];
    const prev = idx > 0 ? all[idx - 1] : null;
    const minutes = Math.max(
      1,
      Math.ceil((next.time.getTime() - now) / 60_000),
    );
    const progress = prev
      ? Math.min(
          1,
          Math.max(
            0,
            (now - prev.time.getTime()) /
              (next.time.getTime() - prev.time.getTime()),
          ),
        )
      : 0;
    return { next, upcoming: all.slice(idx + 1, idx + 3), minutes, progress };
  }, [lat, lng, options, now]);

  if (!info) return null;

  const countdown =
    info.minutes >= 60
      ? `${Math.floor(info.minutes / 60)} h ${info.minutes % 60} min`
      : `${info.minutes} min`;

  return (
    <Touchable
      style={styles.timesBar}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next prayer: ${info.next.label} at ${info.next.display}, in ${countdown}. Open prayer times.`}
    >
      <View style={styles.timesTopRow}>
        <View style={styles.nextBlock}>
          <Text style={styles.nextLabel}>
            Next {"·"} {info.next.label} in {countdown}
          </Text>
          <Text style={styles.nextTime}>{info.next.display}</Text>
        </View>
        <View style={styles.upcomingRow}>
          {info.upcoming.map((e) => (
            <View key={`${e.key}-${e.time.getTime()}`} style={styles.timeItem}>
              <Text style={styles.timeLabel}>{e.label}</Text>
              <Text style={styles.timeValue}>{e.display}</Text>
            </View>
          ))}
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.textSecondary}
          />
        </View>
      </View>
      <View style={styles.progressTrack}>
        {/* scaleX rather than a percentage width: width is a LAYOUT prop,
            so every tick re-laid-out the fill inside its clipping track.
            A transform costs nothing and is the same pixels. */}
        <View
          style={[styles.progressFill, { transform: [{ scaleX: info.progress }] }]}
        />
      </View>
    </Touchable>
  );
});

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
  const { settings, updateSettings } = useSettings();
  const { reportLocation } = useNotifications();
  const { ids: favouriteIds, idSet: savedIdSet } = useFavourites();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [usingFallback, setUsingFallback] = useState(false);
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
  // Bumped on every searchArea() call so a slower, out-of-order geocode
  // response can tell it's been superseded and skip applying its result.
  const searchGeneration = useRef(0);
  const [recenterNonce, setRecenterNonce] = useState(0);
  // The location read waits for onboarding to resolve. iOS allows exactly
  // one permission prompt, so it must not fire before the user has been
  // told what it is for.
  const [locationAllowed, setLocationAllowed] = useState(false);
  const allowLocationRead = useCallback(() => setLocationAllowed(true), []);

  // Get location once at launch, then keep it updated as the user moves
  // (re-sorts distances after every ~250 m). No account, no tracking --
  // everything is processed on-device.
  useEffect(() => {
    if (!locationAllowed) return;
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
  }, [locationAllowed]);

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
      const right = hit ? await looksRight(hit) : false;
      if (isStale()) return;
      if (hit && right) {
        // The query stays in the box \u2014 it IS the search state ("Near X"
        // lives in the input, not a separate chip).
        setSearchOrigin({ lat: hit.latitude, lng: hit.longitude, label: text });
      } else {
        setSearchNote(
          `Couldn't find "${text}" \u2014 showing name matches instead.`,
        );
      }
    } catch {
      if (isStale()) return;
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

  // Two-stage memo: distances/sorting only recompute when location or data
  // changes -- NOT on every filter toggle or keystroke.
  // When an area search is active the two anchors differ: places are chosen
  // and ordered around the searched area (km), but each row is labelled
  // with the distance from the user (kmFromUser) — "the masjids in London,
  // and how far each one is from me".
  const byDistance = useMemo<Result[]>(() => {
    const measureFromAnchor = distanceFrom(origin.lat, origin.lng);
    // With no area search the two anchors ARE the same point, which is the
    // normal case — measuring twice then produced two identical numbers for
    // every place in the dataset, on every GPS fix.
    const sameAnchor =
      origin.lat === gpsOrigin.lat && origin.lng === gpsOrigin.lng;
    const measureFromUser = sameAnchor
      ? measureFromAnchor
      : distanceFrom(gpsOrigin.lat, gpsOrigin.lng);
    const measured: Result[] = new Array(places.length);
    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const km = measureFromAnchor(place.lat, place.lng);
      measured[i] = {
        place,
        km,
        kmFromUser: sameAnchor ? km : measureFromUser(place.lat, place.lng),
      };
    }
    return measured.sort((a, b) => a.km - b.km);
  }, [places, origin.lat, origin.lng, gpsOrigin.lat, gpsOrigin.lng]);

  // Pre-lowercased haystack and pre-tokenised name+address per place, so
  // neither the exact-substring pass nor the typo-tolerant one has to
  // re-derive them from thousands of strings on every keystroke.
  //
  // Built LAZILY, on the first keystroke: tokenising the whole dataset costs
  // several thousand regex passes, and it used to run eagerly the moment the
  // data landed — on the critical path of the first paint, for a feature the
  // user may never touch. A ref keyed on the dataset it was built from is the
  // whole cache; nothing re-renders when it fills.
  const searchIndexRef = useRef<{
    source: Place[];
    entries: Map<string, SearchEntry>;
  } | null>(null);
  const getSearchIndex = useCallback(() => {
    const cached = searchIndexRef.current;
    if (cached && cached.source === places) return cached.entries;
    const entries = new Map<string, SearchEntry>();
    for (const place of places) {
      // Name and address stay SEPARATE strings. Concatenating them into one
      // haystack would quietly widen the exact-match pass to queries that
      // straddle the join, which is a different feature from the one the
      // fuzzy tier already provides.
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
  // updates every keystroke (below), but re-filtering 2,000+ places and
  // reclustering the map on EVERY keystroke is wasted work while someone's
  // still mid-word, and was measurably janky on slower devices.
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
    // Tokenised ONCE, not once per place: fuzzyMatches(tokens, query) took the
    // raw query string, so the same few characters were lowercased,
    // NFD-normalised and split by four regexes a few thousand times per
    // keystroke to produce the identical token list every time.
    const queryTokens = tokenize(q);
    const exact: Result[] = [];
    const fuzzy: Result[] = [];
    for (const result of base) {
      const { place } = result;
      // The index is built from the same `places` array this list came from,
      // so a miss shouldn't happen — but if it ever did, the place must still
      // be findable by name. Dropping it would remove a real place from search
      // results with nothing to show that anything went wrong.
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
    // Deliberately not "sort by jumu'ah time" — only 136 of 2,244 rows
    // carry one, so that would collapse to the ordinary distance list while
    // looking like it did something.
    const withTime = capped.filter((r) => r.place.jumuahTimes?.length);
    const withoutTime = capped.filter((r) => !r.place.jumuahTimes?.length);
    return withTime.concat(withoutTime);
  }, [results, effectiveQuery, isFriday, savedIdSet, settings.savedOnly]);

  // Saved places, resolved from ids against the live dataset. Excluded
  // from the nearby list below so the same row never appears twice.
  //
  // Resolved through the id index and measured directly, rather than by
  // scanning the sorted list: at most a hundred saved ids were being found by
  // filtering a few thousand rows, and the filter re-ran on every GPS fix.
  const favourites = useMemo(() => {
    if (favouriteIds.length === 0) return [];
    const measureFromAnchor = distanceFrom(origin.lat, origin.lng);
    const sameAnchor =
      origin.lat === gpsOrigin.lat && origin.lng === gpsOrigin.lng;
    const measureFromUser = sameAnchor
      ? measureFromAnchor
      : distanceFrom(gpsOrigin.lat, gpsOrigin.lng);
    const resolved: Result[] = [];
    // The user's own order, not distance order.
    for (const id of favouriteIds) {
      const place = placesById.get(id);
      // A saved id that is no longer in the dataset simply doesn't render —
      // which is also the right behaviour when a place is removed upstream.
      if (!place) continue;
      const km = measureFromAnchor(place.lat, place.lng);
      resolved.push({
        place,
        km,
        kmFromUser: sameAnchor ? km : measureFromUser(place.lat, place.lng),
      });
    }
    return resolved;
  }, [
    favouriteIds,
    placesById,
    origin.lat,
    origin.lng,
    gpsOrigin.lat,
    gpsOrigin.lng,
  ]);

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

  const filterCount =
    activeFilters.size +
    (settings.corroboratedOnly ? 1 : 0) +
    (settings.savedOnly ? 1 : 0);

  const searchRow = (
    <View style={styles.searchRow}>
      <View style={styles.searchInputWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder={'Try "Stratford" or a masjid name...'}
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
          <Touchable
            style={styles.clearButton}
            onPress={clearSearch}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="close"
              size={14}
              color={colors.textSecondary}
            />
          </Touchable>
        ) : null}
      </View>
      <Touchable
        style={[
          styles.filterButton,
          filterCount > 0 && styles.filterButtonActive,
        ]}
        onPress={() => setShowFilters(true)}
        accessibilityRole="button"
        accessibilityLabel={
          filterCount > 0
            ? `Filters, ${filterCount} on`
            : "Filters"
        }
        accessibilityState={{ expanded: showFilters }}
      >
        <Text
          style={[
            styles.filterButtonLabel,
            filterCount > 0 && styles.filterButtonLabelActive,
          ]}
        >
          {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
        </Text>
      </Touchable>
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
      // Without `accessible`, iOS ignores a container's accessibilityLabel
      // entirely and reads the three loose words instead — so the one place
      // the pin colours are explained in WORDS never reached the people who
      // can only use words. Grouping costs one long focus stop; that is the
      // right trade here.
      accessible
      importantForAccessibility="no-hide-descendants"
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

  const openPrayer = useCallback(() => router.push("/prayer"), [router]);

  const timesBar = (
    <NextPrayerBar
      lat={gpsOrigin.lat}
      lng={gpsOrigin.lng}
      options={calcOptions}
      onPress={openPrayer}
    />
  );

  const fridayBanner =
    isFriday && !fridayNoticeDismissed && listResults.length > 0 ? (
      <View style={styles.fridayBanner}>
        <MaterialCommunityIcons
          name="calendar-star"
          size={18}
          color={colors.accent}
        />
        <Text style={styles.fridayBannerText}>
          It&apos;s Friday {"—"} places with a published Jumu&apos;ah
          time are shown first, and Jumu&apos;ah-only venues are included.
        </Text>
        <Touchable
          onPress={() => setFridayNoticeDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Friday notice"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons
            name="close"
            size={16}
            color={colors.textSecondary}
          />
        </Touchable>
      </View>
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
      ListHeaderComponent={
        <>
          {/* Hidden while the saved-only filter is on: the main list IS the
              saved places then, and this header would duplicate every row. */}
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
          {fridayBanner}
        </>
      }
      // "Nothing here" and "nothing YET" are different states and must not
      // share a component. Places load live on every launch (never bundled,
      // never cached \u2014 see src/data/places.ts), so during the first fetch
      // `listResults` is legitimately empty and the empty state used to fire
      // on 100% of cold starts, inviting the user to report the entire
      // dataset as a gap.
      ListEmptyComponent={
        placesStatus === "loading" ? (
          <PlacesSkeleton />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {settings.savedOnly ? "No saved places" : "No places match"}
            </Text>
            <Text style={styles.emptyText}>
              {settings.savedOnly
                ? "Tap the heart on a place to save it \u2014 or turn off " +
                  "the saved-places filter."
                : "Try removing a filter \u2014 or this is a gap in the " +
                  "data worth fixing."}
            </Text>
            <Touchable
              style={styles.emptyButton}
              onPress={() => setShowNewPlaceForm(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a missing place"
            >
              <Text style={styles.emptyButtonLabel}>Add a missing place</Text>
            </Touchable>
          </View>
        )
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
              <Touchable
                onPress={() => setShowNewPlaceForm(true)}
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
  );

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
          <Touchable
            style={styles.recenterButton}
            onPress={recenter}
            accessibilityRole="button"
            accessibilityLabel="Back to my location"
            // Circular FAB: a borderless ripple is the Material idiom
            // here, and it avoids clipping the view — which on Android
            // would take the elevation shadow with it.
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
        {timesBar}
        {list}
      </BottomSheet>
      <FilterSheet
        visible={showFilters}
        savedOnly={settings.savedOnly}
        onToggleSaved={() => updateSettings({ savedOnly: !settings.savedOnly })}
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

const useStyles = createThemedStyles((colors: ThemeColors, scheme: "light" | "dark") =>
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
    // In `style` rather than as a prop: react-native-web deprecated the prop
    // form. "box-none" is what lets map gestures through the gaps between the
    // search row and the legend while those stay tappable.
    pointerEvents: "box-none",
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.s,
  },
  searchInputWrap: {
    flex: 1,
    justifyContent: "center",
  },
  // A floating pill, the redesign's signature control: no outline, just a
  // soft lift off the map. Dark mode keeps its hairline via cardEdge — an
  // unlit dark pill over dark map tiles has no edge at all.
  searchInput: {
    minHeight: 48,
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    ...cardEdge(scheme, colors),
    paddingLeft: spacing.l + spacing.xs,
    paddingRight: spacing.xl + spacing.m, // room for the ✕ so text never runs under it
    ...type.callout,
    fontWeight: "500",
    color: colors.text,
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
    // Clips the Android ripple to the rounded corners.
    overflow: "hidden",
  },
  filterButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.l,
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    ...cardEdge(scheme, colors),
    // Android only: clip the press ripple to the rounded corners — without
    // this it flashes as a full rectangle behind them. The elevation shadow
    // survives clipping (it draws from the outline); iOS must NOT clip, or
    // clipsToBounds would erase the shadow* props above.
    ...Platform.select({ android: { overflow: "hidden" as const } }),
  },
  // Filters on = the pill fills with the accent. Louder than the old tinted
  // outline on purpose: an active filter silently hides places, which is
  // exactly the state that must never be missable.
  filterButtonActive: {
    backgroundColor: colors.accent,
    // Only meaningful in dark mode, where cardEdge drew a hairline.
    borderColor: colors.accent,
  },
  filterButtonLabel: {
    ...type.subhead,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  filterButtonLabelActive: {
    color: colors.canvas,
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
  legend: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.m,
    backgroundColor: colors.canvas,
    borderRadius: radius.pill,
    ...cardEdge(scheme, colors),
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
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
    ...type.caption,
    fontWeight: "600",
    color: colors.textSecondary,
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
  timesBar: {
    flexShrink: 0,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.m,
    gap: spacing.m,
  },
  timesTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.l,
  },
  nextBlock: {
    gap: 2,
  },
  nextLabel: {
    ...type.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    ...numeric,
  },
  // The headline of the whole sheet: the next prayer's time, in the brand
  // green at title weight. This is the number people open the app for.
  nextTime: {
    ...type.title2,
    fontWeight: "800",
    color: colors.accent,
    ...numeric,
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.l,
  },
  timeItem: {
    alignItems: "center",
    gap: 2,
  },
  timeLabel: {
    ...type.caption,
    color: colors.textSecondary,
  },
  timeValue: {
    ...type.subhead,
    fontWeight: "600",
    color: colors.text,
    ...numeric,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    width: "100%",
    backgroundColor: colors.accent,
    // Grow from the left edge, not the centre. The ARRAY form, not
    // "left center": react-native-web passes the string straight through as
    // a `transform-origin` DOM attribute, which React rejects. Native
    // requires all three values [x, y, z] — two crashes the renderer.
    transformOrigin: ["0%", "50%", 0],
    // No borderRadius: scaling X squashes it to a sub-pixel smear at low
    // progress. The track's own radius + overflow does the rounding.
  },
  recenterButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.canvas,
    // Hairline only in dark, where the shadow below is invisible.
    ...(scheme === "dark"
      ? { borderWidth: 1, borderColor: colors.border }
      : null),
    alignItems: "center",
    justifyContent: "center",
    // `floating` is the level a FAB belongs on, and its Android elevation (6)
    // is still below the sheet's (12), so the sheet keeps sliding over this
    // when dragged to full — see BottomSheet's aboveSheet contract. The old
    // hand-rolled values (iOS 0.15/6/2 against the dial's 0.06/18/8, both at
    // Android elevation 3–4) were exactly the cross-platform drift
    // elevation.ts was written to end.
    ...elevation(scheme, "floating"),
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
    ...type.body,
    fontWeight: "600",
    color: colors.text,
  },
  emptyText: {
    ...type.subhead,
    color: colors.textSecondary,
    textAlign: "center",
  },
  // A real filled pill, not a text link: on an empty screen this button IS
  // the way forward, so it dresses like the primary action it is.
  emptyButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: MIN_TARGET,
    marginTop: spacing.s,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    overflow: "hidden",
  },
  emptyButtonLabel: {
    ...type.subhead,
    color: colors.canvas,
    fontWeight: "700",
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
  savedSection: {
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  savedTitle: {
    ...type.eyebrow,
    color: colors.textSecondary,
  },
  fridayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  fridayBannerText: {
    flex: 1,
    ...type.footnote,
    color: colors.text,
  },
  listFooterLink: {
    ...type.subhead,
    color: colors.accent,
    fontWeight: "600",
  },
}),
);
