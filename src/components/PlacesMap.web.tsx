import React from "react";

import { Place } from "@/data/places";

type Props = {
  results: Array<{ place: Place; km: number }>;
  userLocation: { lat: number; lng: number } | null;
  /** When set (area search), the map animates to this point. Unused on web. */
  focus?: { lat: number; lng: number } | null;
  /** Increment to fly the map back to the user's location. Unused on web. */
  recenterNonce?: number;
  onSelect: (id: string) => void;
};

/** Web stub — map view is native-only; never rendered on web. */
export default function PlacesMap(_props: Props) {
  return null;
}
