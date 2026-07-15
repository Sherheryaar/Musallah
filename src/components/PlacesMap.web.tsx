import React from "react";

import { Place } from "@/data/places";

type Props = {
  results: Array<{ place: Place; km: number }>;
  userLocation: { lat: number; lng: number } | null;
  onSelect: (id: string) => void;
};

/** Web stub — map view is native-only; never rendered on web. */
export default function PlacesMap(_props: Props) {
  return null;
}
