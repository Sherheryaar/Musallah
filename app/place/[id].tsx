import React from "react";
import {
  Linking,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  FACILITY_LABELS,
  FacilityKey,
  PLACES,
  PLACE_TYPE_LABELS,
} from "@/data/places";
import { colors, spacing, radius } from "@/lib/theme";

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const place = PLACES.find((p) => p.id === id);

  if (!place) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Place not found.</Text>
      </View>
    );
  }

  const openDirections = () => {
    const query = encodeURIComponent(place.name + ", " + place.address);
    const webUrl = "https://www.google.com/maps/search/?api=1&query=" + query;
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

  const facilityKeys = Object.keys(FACILITY_LABELS) as FacilityKey[];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: spacing.xxl + insets.bottom },
      ]}
    >
      <Stack.Screen options={ { title: PLACE_TYPE_LABELS[place.type] } } />

      <Text style={styles.name}>{place.name}</Text>
      <Text style={styles.address}>{place.address}</Text>

      <TouchableOpacity
        style={styles.directionsButton}
        onPress={openDirections}
        accessibilityRole="button"
        accessibilityLabel="Get directions"
      >
        <Text style={styles.directionsLabel}>Get directions</Text>
      </TouchableOpacity>

      {place.jumuahTimes?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jumu'ah</Text>
          <Text style={styles.sectionBody}>
            {place.jumuahTimes.join("  ·  ")}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Facilities</Text>
        <View style={styles.facilityList}>
          {facilityKeys.map((key) => {
            const available = place.facilities[key];
            return (
              <View key={key} style={styles.facilityRow}>
                <Text
                  style={[
                    styles.facilityMark,
                    available ? styles.markYes : styles.markNo,
                  ]}
                >
                  {available ? "\u2713" : "\u2717"}
                </Text>
                <Text style={styles.facilityLabel}>
                  {FACILITY_LABELS[key]}
                </Text>
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
          {place.lastVerified
            ? "Last verified " + place.lastVerified
            : "Not yet verified"}
          {place.source ? " · " + place.source : ""}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
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
  name: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 30,
  },
  address: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  directionsButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.m,
    paddingVertical: spacing.m,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  directionsLabel: {
    color: colors.canvas,
    fontSize: 16,
    fontWeight: "600",
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
  facilityList: {
    gap: spacing.s,
  },
  facilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.m,
  },
  facilityMark: {
    fontSize: 16,
    fontWeight: "700",
    width: 20,
    textAlign: "center",
  },
  markYes: {
    color: colors.positive,
  },
  markNo: {
    color: colors.textSecondary,
  },
  facilityLabel: {
    fontSize: 16,
    color: colors.text,
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
});