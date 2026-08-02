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

/**
 * HARD upper bound on singles + clusters, guaranteed by buildPinGroups.
 * PlacesMap mounts exactly this many Marker components once and reuses
 * them forever (moving/hiding instead of adding/removing), because the
 * add/remove path of react-native-maps 1.20 crashes iOS under the new
 * architecture (expo/expo#40856, react-native-maps#5217).
 */
export const MAX_MARKERS = 280;

// Target grid density: roughly this many cells across the viewport.
const CELLS_ACROSS = 12;

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

/** One pass of world-grid grouping at a given cell size. */
function groupIntoCells(
  inView: readonly PinCandidate[],
  cellLat: number,
  cellLng: number,
): PinGroups {
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

/** One marker slot's occupant: a pin, a cluster bubble, or nothing. */
export type Slot =
  | { kind: "pin"; candidate: PinCandidate }
  | { kind: "cluster"; cluster: PinCluster }
  | null;

/** Stable identity for a slot occupant, across region changes. */
function slotKey(slot: NonNullable<Slot>): string {
  return slot.kind === "pin" ? `p:${slot.candidate.place.id}` : `c:${slot.cluster.key}`;
}

/**
 * Decide WHICH marker slot each pin/cluster occupies, keeping a place in the
 * same slot for as long as it stays on screen.
 *
 * WHY THIS EXISTS: the marker pool is fixed (see MAX_MARKERS) and every slot
 * is a long-lived native marker keyed by its index. Filling slots in list
 * order looked fine but meant one place entering or leaving the viewport
 * shifted every later place down a slot. Tapping a marker nudges the map to
 * fit the callout, which fires a region change, which re-filled the slots —
 * so the callout you had just opened kept its position but silently re-
 * labelled itself with a neighbouring masjid's name, and its tap target
 * became that neighbour too.
 *
 * Assignment is idempotent: feeding the returned map back in with the same
 * groups reproduces the same slots exactly.
 */
export function assignSlots(
  groups: PinGroups,
  previous: ReadonlyMap<string, number> = new Map(),
  maxMarkers: number = MAX_MARKERS,
): { slots: Slot[]; assignment: Map<string, number> } {
  const wanted: NonNullable<Slot>[] = [
    ...groups.clusters.map((cluster) => ({ kind: "cluster" as const, cluster })),
    ...groups.singles.map((candidate) => ({ kind: "pin" as const, candidate })),
  ].slice(0, maxMarkers);

  const slots: Slot[] = new Array(maxMarkers).fill(null);
  const assignment = new Map<string, number>();

  // Keep whatever was already on screen exactly where it was...
  const unplaced: NonNullable<Slot>[] = [];
  for (const slot of wanted) {
    const key = slotKey(slot);
    const index = previous.get(key);
    if (index !== undefined && index < maxMarkers && slots[index] === null) {
      slots[index] = slot;
      assignment.set(key, index);
    } else {
      unplaced.push(slot);
    }
  }

  // ...then drop newcomers into whatever slots that left free.
  let next = 0;
  for (const slot of unplaced) {
    while (next < maxMarkers && slots[next] !== null) next++;
    if (next >= maxMarkers) break;
    slots[next] = slot;
    assignment.set(slotKey(slot), next);
  }

  return { slots, assignment };
}

/**
 * Group the in-view places for rendering. The result NEVER exceeds
 * `maxMarkers` total markers (singles + clusters):
 *
 * - The region is padded so pins just off-screen don't pop during pans.
 * - Under budget: everything is an individual pin.
 * - Over budget: bucket by world-grid cell; lone places stay pins, shared
 *   cells become clusters centred on their members' mean position. If the
 *   grid still yields too many markers, cells double in size until it
 *   fits — a hard guarantee, so the marker pool can be a fixed size.
 *   `results` arrives sorted nearest-first, so singles stay nearest-first.
 */
export function buildPinGroups(
  results: readonly PinCandidate[],
  region: MapRegion,
  maxMarkers: number = MAX_MARKERS,
): PinGroups {
  // iOS occasionally reports zero/negative deltas mid-gesture; clamp so the
  // grid math can't divide by zero.
  const latDelta = Math.max(region.latitudeDelta, 0.005);
  const lngDelta = Math.max(region.longitudeDelta, 0.005);
  const latPad = latDelta * 0.6;
  const lngPad = lngDelta * 0.6;
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
  if (inView.length <= maxMarkers) return { singles: inView, clusters: [] };

  // World-anchored cells: size depends only on (quantised) zoom, indices
  // only on absolute coordinates — never on where the viewport sits.
  let cellLat = quantise(latDelta / CELLS_ACROSS);
  let cellLng = quantise(lngDelta / CELLS_ACROSS);
  for (;;) {
    const groups = groupIntoCells(inView, cellLat, cellLng);
    if (groups.singles.length + groups.clusters.length <= maxMarkers) {
      return groups;
    }
    cellLat *= 2;
    cellLng *= 2;
  }
}
