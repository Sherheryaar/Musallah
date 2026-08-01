// Decides what the map renders for the visible region. Rendering all
// 2,000+ markers makes the native map stutter, but hiding far-away places
// made zoomed-out views look empty. So: when the viewport holds more than
// the render budget, places are grouped into numbered CLUSTER bubbles on a
// grid (tap to zoom in); under budget they render as individual pins. Every
// place in view is always represented one way or the other.

import type { Place } from "@/data/places";

export type PinCandidate = { place: Place; km: number };

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type PinCluster = {
  key: string;
  lat: number;
  lng: number;
  count: number;
  /** Region to fly to when the cluster is tapped (its cell, padded). */
  latitudeDelta: number;
  longitudeDelta: number;
};

export type PinGroups = {
  /** Render as individual pins, nearest-first. */
  singles: PinCandidate[];
  /** Render as numbered bubbles. */
  clusters: PinCluster[];
};

/** Render budget: ~300 image markers stay smooth on low-end phones. */
export const MAX_PINS = 300;

// Clustering grid. 16x16 = 256 cells, so even a fully-clustered screen
// renders at most 256 markers — under the budget.
const GRID = 16;

// Never zoom deeper than this when tapping a cluster; below it the cell is
// small enough that its places resolve to individual pins anyway.
const MIN_TAP_ZOOM_DELTA = 0.02;

/**
 * Group the in-view places for rendering.
 *
 * - The region is padded so pins just off-screen don't pop during pans.
 * - Under budget: everything is an individual pin.
 * - Over budget: bucket by grid cell; lone places stay pins, shared cells
 *   become clusters centred on their members' mean position. `results`
 *   arrives sorted nearest-first, so single picks stay nearest-first.
 */
export function buildPinGroups(
  results: readonly PinCandidate[],
  region: MapRegion,
  maxPins: number = MAX_PINS,
): PinGroups {
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
  if (inView.length <= maxPins) return { singles: inView, clusters: [] };

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

  const singles: PinCandidate[] = [];
  const clusters: PinCluster[] = [];
  for (const [key, bucket] of cells) {
    if (bucket.length === 1) {
      singles.push(bucket[0]);
      continue;
    }
    let sumLat = 0;
    let sumLng = 0;
    for (const { place } of bucket) {
      sumLat += place.lat;
      sumLng += place.lng;
    }
    clusters.push({
      key: `cell-${key}`,
      lat: sumLat / bucket.length,
      lng: sumLng / bucket.length,
      count: bucket.length,
      latitudeDelta: Math.max(cellLat * 1.4, MIN_TAP_ZOOM_DELTA),
      longitudeDelta: Math.max(cellLng * 1.4, MIN_TAP_ZOOM_DELTA),
    });
  }
  return { singles, clusters };
}
