// The device's location, for the three screens that need it.
//
// Home, prayer and qibla each used to carry their own copy of the same
// sequence — read or request the permission, take a recent cached fix,
// otherwise wait for a fresh one, otherwise fall back to central London —
// and they had drifted (different cache ages, different retry handling).
// One hook, three call sites, one behaviour.
//
// Privacy: the fix never leaves the device. Nothing here is persisted.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";

import { FALLBACK_LOCATION } from "./geo";

export type Coords = { lat: number; lng: number };
export type LocationPermission = "unknown" | "granted" | "denied";

type Options = {
  /**
   * Ask the OS for permission. iOS shows exactly ONE prompt for the life of
   * the install, so only the home screen (after onboarding has explained
   * why) and the qibla screen (which cannot work without it) may prompt;
   * everything else passes false and reads whatever answer already exists.
   */
  prompt: boolean;
  /** Keep updating as the user moves (~250 m / 30 s). */
  watch?: boolean;
  /** Do nothing until true — the home screen waits for onboarding. */
  enabled?: boolean;
};

type State = {
  /** null until the first read resolves; then a real fix or the fallback. */
  coords: Coords | null;
  /** True when `coords` is central London rather than the device. */
  usingFallback: boolean;
  permission: LocationPermission;
};

const PENDING: State = { coords: null, usingFallback: false, permission: "unknown" };

/** A fix from the last five minutes is instant and good enough for prayer times. */
const CACHED_FIX_MAX_AGE_MS = 5 * 60 * 1000;

export function useDeviceLocation({
  prompt,
  watch = false,
  enabled = true,
}: Options): State & { retry: () => void } {
  const [state, setState] = useState<State>(PENDING);
  // Bumped to re-run the read — by the qibla screen's "Allow location"
  // button, and by the foreground check below.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;

    (async () => {
      let granted = false;
      try {
        const { status } = prompt
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        granted = status === "granted";
        if (granted) {
          const pos =
            (await Location.getLastKnownPositionAsync({
              maxAge: CACHED_FIX_MAX_AGE_MS,
            })) ??
            (await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }));
          if (cancelled) return;
          setState({
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            usingFallback: false,
            permission: "granted",
          });
          if (watch) {
            watcher = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 30 * 1000,
                distanceInterval: 250,
              },
              (p) => {
                if (cancelled) return;
                setState((s) => ({
                  ...s,
                  coords: { lat: p.coords.latitude, lng: p.coords.longitude },
                }));
              },
            );
            // The effect may have been torn down while that await was in
            // flight, when `watcher` was still null for the cleanup below.
            if (cancelled) watcher.remove();
          }
          return;
        }
      } catch {
        // Denied, no GPS, timed out: the fallback below is still far more
        // useful than an error screen. `granted` tells the caller which.
      }
      if (cancelled) return;
      setState({
        coords: FALLBACK_LOCATION,
        usingFallback: true,
        permission: granted ? "granted" : "denied",
      });
    })();

    return () => {
      cancelled = true;
      watcher?.remove();
    };
  }, [enabled, prompt, watch, attempt]);

  // Granting in system Settings does NOT restart the app on Android, so a
  // denied screen would otherwise sit on the fallback until it was left and
  // reopened. On return, READ the permission (never prompt — Android would
  // re-ask on every foreground) and re-run only if it is now granted.
  const permissionRef = useRef(state.permission);
  useEffect(() => {
    permissionRef.current = state.permission;
  }, [state.permission]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || permissionRef.current !== "denied") return;
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status === "granted") setAttempt((n) => n + 1);
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  return { ...state, retry };
}
