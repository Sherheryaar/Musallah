import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { PLACE_TYPE_LABELS, Place } from "@/data/places";
import { useTheme } from "@/context/ThemeContext";
import { formatDistance } from "@/lib/distance";

// Google Maps (Android) needs an explicit style array for dark mode; Apple
// Maps (iOS) follows the userInterfaceStyle prop instead and ignores this.
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8f9bab" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#93817c" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
];

const FALLBACK_REGION = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Small pre-rendered PNG dots, one colour per place type -- generated at
// 1x/2x/3x by scripts/gen-pin-assets.js (colours mirror src/lib/theme.ts).
//
// Why images instead of <View> children: iOS (Apple Maps) snapshots
// view-based marker children and drops them after the first frame, so the
// custom dots flashed once and then disappeared. An image is handed to the
// native annotation directly, which renders reliably on both platforms.
const PIN_IMAGES: Record<Place["type"], number> = {
  masjid: require("../../assets/pins/dot-masjid.png"),
  musalla: require("../../assets/pins/dot-musalla.png"),
  multi_faith_room: require("../../assets/pins/dot-multi-faith.png"),
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
  const { scheme } = useTheme();
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

  // On the first GPS fix after mount, glide from the fallback view to the
  // user. initialRegion is only read once by the native map, so without this
  // the map stayed parked on central London forever when the fix arrived
  // after mount (i.e. on almost every cold start).
  const hadLocationAtMount = useRef(userLocation !== null);
  const centredOnUser = useRef(false);
  useEffect(() => {
    if (
      userLocation &&
      !hadLocationAtMount.current &&
      !centredOnUser.current &&
      !focus
    ) {
      centredOnUser.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        600,
      );
    }
  }, [userLocation, focus]);

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
      userInterfaceStyle={scheme}
      customMapStyle={scheme === "dark" ? DARK_MAP_STYLE : undefined}
    >
      {results.map(({ place, km }) => (
        <Marker
          key={place.id}
          coordinate={{ latitude: place.lat, longitude: place.lng }}
          title={place.name}
          // Type + distance in the callout, so "is it walkable?" is answered
          // without leaving the map.
          description={`${PLACE_TYPE_LABELS[place.type]} · ${formatDistance(km)}`}
          onCalloutPress={() => onSelect(place.id)}
          image={PIN_IMAGES[place.type]}
          // Centre the dot on the coordinate (Android; iOS centres by default).
          anchor={{ x: 0.5, y: 0.5 }}
          // Static markers with no view children: never re-rasterize.
          tracksViewChanges={false}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
