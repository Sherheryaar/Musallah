import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import { FacilityKey } from "@/data/places";
import { usePlaces } from "@/context/PlacesContext";
import { distanceKm, formatDistance } from "@/lib/distance";
import { fetchPrayerTimes, PrayerTimes } from "@/lib/prayerTimes";
import FilterChips from "@/components/FilterChips";
import PlaceCard from "@/components/PlaceCard";
import PlacesMap from "@/components/PlacesMap";
import SuggestionForm from "@/components/SuggestionForm";
import ViewToggle from "@/components/ViewToggle";
import { submitNewPlaceSuggestion } from "@/lib/feedback";
import { colors, spacing } from "@/lib/theme";

// Fallback when location is unavailable: central London (Charing Cross).
const FALLBACK_LOCATION = { lat: 51.5074, lng: -0.1278 };

export default function HomeScreen() {
  const router = useRouter();
  // Bottom inset keeps the list clear of the Android gesture/nav bar
  // (the app draws edge-to-edge on Android).
  const insets = useSafeAreaInsets();
  const { places } = usePlaces();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [usingFallback, setUsingFallback] = useState(false);
  const [times, setTimes] = useState<PrayerTimes | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FacilityKey>>(
    new Set(),
  );
  const [view, setView] = useState<"list" | "map">("list");
  const [showNewPlaceForm, setShowNewPlaceForm] = useState(false);

  // Ask for location once. No account, no tracking — processed on-device.
  useEffect(() => {
    let cancelled = false;
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
        }
      } catch {
        // Keep fallback — the app must still work without location.
      }
      if (cancelled) return;
      setLocation(coords);
      setUsingFallback(fellBack);
      const fetched = await fetchPrayerTimes(coords.lat, coords.lng);
      if (!cancelled) setTimes(fetched);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFilter = (key: FacilityKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Filter (must have ALL selected facilities), then sort nearest-first.
  const results = useMemo(() => {
    const origin = location ?? FALLBACK_LOCATION;
    return places.filter((place) =>
      [...activeFilters].every((key) => place.facilities[key]),
    )
      .map((place) => ({
        place,
        km: distanceKm(origin.lat, origin.lng, place.lat, place.lng),
      }))
      .sort((a, b) => a.km - b.km);
  }, [location, activeFilters, places]);

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
      {times ? (
        <View style={styles.timesBar}>
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
        </View>
      ) : null}

      <FilterChips active={activeFilters} onToggle={toggleFilter} />

      {Platform.OS !== "web" ? (
        <View style={styles.toggleRow}>
          <ViewToggle value={view} onChange={setView} />
        </View>
      ) : null}

      {usingFallback ? (
        <Text style={styles.fallbackNote}>
          Showing distances and prayer times for central London — enable
          location for accurate results.
        </Text>
      ) : null}

      {Platform.OS !== "web" && view === "map" ? (
        <View style={styles.mapContainer}>
          <PlacesMap
            results={results}
            userLocation={location}
            onSelect={(id: string) => router.push(`/place/${id}`)}
          />
        </View>
      ) : (
      <FlatList
        style={styles.listContainer}
        data={results}
        keyExtractor={(item) => item.place.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: spacing.xxl + insets.bottom },
        ]}
        renderItem={({ item }) => (
          <PlaceCard
            place={item.place}
            distanceLabel={formatDistance(item.km)}
            onPress={() => router.push(`/place/${item.place.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No places match</Text>
            <Text style={styles.emptyText}>
              Try removing a filter — or this is a gap in the data worth
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
            {showNewPlaceForm ? (
              <SuggestionForm
                placeholder="Name, address, type, facilities, and a link if you have one..."
                onSend={submitNewPlaceSuggestion}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.listFooter}>
            {showNewPlaceForm && results.length > 0 ? (
              <SuggestionForm
                placeholder="Name, address, type, facilities, and a link if you have one..."
                onSend={submitNewPlaceSuggestion}
              />
            ) : (
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
            )}
          </View>
        }
      />
      )}
      </View>
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
    // On web, hairline edges visually anchor the centered column.
    ...Platform.select({
      web: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.border,
      },
    }),
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
  toggleRow: {
    flexShrink: 0,
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
  },
  fallbackNote: {
    flexShrink: 0,
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
  },
  mapContainer: {
    flex: 1,
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