import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { PLACE_TYPE_LABELS, Place } from "@/data/places";

const FALLBACK_REGION = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

type Props = {
  results: Array<{ place: Place; km: number }>;
  userLocation: { lat: number; lng: number } | null;
  onSelect: (id: string) => void;
};

export default function PlacesMap({ results, userLocation, onSelect }: Props) {
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

  return (
    <MapView
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
