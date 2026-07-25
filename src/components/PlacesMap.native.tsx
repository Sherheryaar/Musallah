import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { PLACE_TYPE_LABELS, Place } from "@/data/places";
import { colors } from "@/lib/theme";

const FALLBACK_REGION = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// One colour per place type -- small, calm dots instead of the default
// oversized red pins.
const PIN_COLORS: Record<Place["type"], string> = {
  masjid: colors.accent,
  musalla: colors.positive,
  multi_faith_room: colors.attention,
};

type Props = {
  results: Array<{ place: Place; km: number }>;
  userLocation: { lat: number; lng: number } | null;
  /** When set (area search), the map animates to this point. */
  focus?: { lat: number; lng: number } | null;
  onSelect: (id: string) => void;
};

export default function PlacesMap({
  results,
  userLocation,
  focus,
  onSelect,
}: Props) {
  const mapRef = useRef<MapView>(null);

  const initialRegion = useMemo(() => {
    const centre = userLocation
      ? { lat: userLocation.lat, lng: userLocation.lng }
      : results[0]
        ? { lat: results[0].place.lat, lng: results[0].place.lng }
        : { lat: FALLBACK_REGION.latitude, lng: FALLBACK_REGION.longitude };

    return {
      latitude: centre.lat,
      longitude: centre.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [userLocation, results]);

  // Fly to the searched area when one is chosen.
  useEffect(() => {
    if (focus) {
      mapRef.current?.animateToRegion(
        {
          latitude: focus.lat,
          longitude: focus.lng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        400,
      );
    }
  }, [focus]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initialRegion}
      showsUserLocation={userLocation !== null}
    >
      {results.map(({ place }) => (
        <Marker
          key={place.id}
          coordinate={{ latitude: place.lat, longitude: place.lng }}
          title={place.name}
          description={PLACE_TYPE_LABELS[place.type]}
          onCalloutPress={() => onSelect(place.id)}
          anchor={{ x: 0.5, y: 0.5 }}
          // Static markers: stop re-rasterizing every frame (big Android win
          // once there are more than a handful of pins).
          tracksViewChanges={false}
        >
          <View
            style={[styles.pin, { backgroundColor: PIN_COLORS[place.type] }]}
          />
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
