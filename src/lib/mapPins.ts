// Decides what the map renders for the visible region. Rendering all
// 2,000+ markers makes the native map stutter, but hiding far-away places
// made zoomed-out views look empty. So: when the viewport holds more than
// the render budget, places are grouped into count-bucketed CLUSTER bubbles
// (tap to zoom in); under budget they render as individual pins. Every
// place in view is always represented one way or the other.
//
// The clustering grid is WORLD-ANCHORED, not viewport-anchored: cell size
// comes from the (quantised) zoom level and cells align to absolute
// lat/lng. Panning therefore keeps every cluster's identity — markers
// don't churn, which both looks calmer and avoids the iOS annotation-
// thrash that crashed the map when clusters re-keyed on every gesture.

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
  /** Which pre-rendered bubble image to use, e.g. "7" or "100+". */
  bucket: string;
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

// Target grid density: roughly this many cells across the viewport.
const CELLS_ACROSS = 14;

// Never zoom deeper than this when tapping a cluster; below it the cell is
// small enough that its places resolve to individual pins anyway.
const MIN_TAP_ZOOM_DELTA = 0.02;

/**
 * Bucket a cluster's count onto the fixed set of pre-rendered bubble
 * images (see scripts/gen-cluster-assets.js): 2-9 exact, then ranges.
 */
export function clusterBucket(count: number): string {
  if (count <= 9) return String(count);
  for (const t of [500, 200, 100, 50, 30, 20, 10]) {
    if (count >= t) return `${t}+`;
  }
  return "9"; // unreachable, keeps TypeScript happy
}

/** Snap a raw cell size to the nearest power of two (world-stable ladder). */
function quantise(raw: number): number {
  return 2 ** Math.round(Math.log2(raw));
}

/**
 * Group the in-view places for rendering.
 *
 * - The region is padded so pins just off-screen don't pop during pans.
 * - Under budget: everything is an individual pin.
 * - Over budget: bucket by world-grid cell; lone places stay pins, shared
 *   cells become clusters centred on their members' mean position.
 *   `results` arrives sorted nearest-first, so singles stay nearest-first.
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

  // World-anchored cells: size depends only on (quantised) zoom, indices
  // only on absolute coordinates — never on where the viewport sits.
  const cellLat = quantise(region.latitudeDelta / CELLS_ACROSS);
  const cellLng = quantise(region.longitudeDelta / CELLS_ACROSS);
  const cells = new Map<string, PinCandidate[]>();
  for (const candidate of inView) {
    const cy = Math.floor(candidate.place.lat / cellLat);
    const cx = Math.floor(candidate.place.lng / cellLng);
    const key = `${cellLat}:${cy}:${cx}`;
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
      key,
      lat: sumLat / bucket.length,
      lng: sumLng / bucket.length,
      count: bucket.length,
      bucket: clusterBucket(bucket.length),
      latitudeDelta: Math.max(cellLat * 1.4, MIN_TAP_ZOOM_DELTA),
      longitudeDelta: Math.max(cellLng * 1.4, MIN_TAP_ZOOM_DELTA),
    });
  }
  return { singles, clusters };
}
