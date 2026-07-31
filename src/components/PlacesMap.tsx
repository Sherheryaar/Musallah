import React from "react";

import { Place } from "@/data/places";

type Props = {
  results: Array<{ place: Place; km: number }>;
  userLocation: { lat: number; lng: number } | null;
  /** When set (area search), the map animates to this point. */
  focus?: { lat: number; lng: number } | null;
  /** Increment to fly the map back to the user's location. */
  recenterNonce?: number;
  onSelect: (id: string) => void;
};

/**
 * TypeScript / Metro fallback — native and web builds resolve to
 * PlacesMap.native.tsx and PlacesMap.web.tsx instead.
 */
export default function PlacesMap(_props: Props) {
  return null;
}
