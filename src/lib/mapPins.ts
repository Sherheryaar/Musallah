// Chooses which pins to render for the visible map region. Rendering all
// 2,000+ markers makes the native map stutter, but the old approach (the
// 300 nearest the user) made every other city look EMPTY when panning or
// zooming out. Instead: take what's in the viewport, and when that's over
// budget, decimate on a grid so the pins spread evenly across the screen
// rather than clustering in one corner.

import type { Place } from "@/data/places";

export type PinCandidate = { place: Place; km: number };

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Render budget: ~300 image markers stay smooth on low-end phones. */
export const MAX_PINS = 300;

// Grid used for decimation. 16x16 = 256 cells, under MAX_PINS, so at least
// one pin per occupied cell always fits the budget.
const GRID = 16;

/**
 * Pins for the current viewport, nearest-first order preserved.
 *
 * - Everything inside the (padded) region qualifies; padding keeps pins
 *   alive just off-screen so small pans don't pop markers in and out.
 * - Under budget: return them all.
 * - Over budget: bucket by grid cell and round-robin one pin per cell per
 *   pass, so a dense city can't starve the rest of the screen. `results`
 *   arrives sorted nearest-first, so each cell contributes its closest
 *   places first.
 */
export function selectPinsForRegion(
  results: readonly PinCandidate[],
  region: MapRegion,
  maxPins: number = MAX_PINS,
): PinCandidate[] {
  const latPad = region.latitudeDelta * 0.6;
  const lngPad = region.longitudeDelta * 0.6;
  const minLat = region.latitude - latPad;
  const maxLat = region.latitude + latPad;
  const minLng = region.longitude - lngPad;
  const maxLng = region.longitude + lngPad;

  const inView = results.filter(
    ({ place }) =>
      place.lat >= minLat &&
      place.lat <= maxLat &&
      place.lng >= minLng &&
      place.lng <= maxLng,
  );
  if (inView.length <= maxPins) return inView;

  const cellLat = (maxLat - minLat) / GRID;
  const cellLng = (maxLng - minLng) / GRID;
  const cells = new Map<number, PinCandidate[]>();
  for (const candidate of inView) {
    const cx = Math.min(
      GRID - 1,
      Math.floor((candidate.place.lng - minLng) / cellLng),
    );
    const cy = Math.min(
      GRID - 1,
      Math.floor((candidate.place.lat - minLat) / cellLat),
    );
    const key = cy * GRID + cx;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(candidate);
    } else {
      cells.set(key, [candidate]);
    }
  }

  const buckets = [...cells.values()];
  const picked: PinCandidate[] = [];
  for (let depth = 0; picked.length < maxPins; depth++) {
    let added = false;
    for (const bucket of buckets) {
      if (depth < bucket.length) {
        picked.push(bucket[depth]);
        added = true;
        if (picked.length >= maxPins) break;
      }
    }
    if (!added) break;
  }
  return picked;
}
