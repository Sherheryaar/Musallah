// Vibration feedback, guarded in the two ways it always needs guarding.
//
// 1. WEB. expo-haptics throws UnavailabilityError on web — it does not
//    silently no-op — so every call site would otherwise need its own
//    Platform check.
// 2. THE USER'S CHOICE. Callers pass the `hapticFeedback` setting through;
//    a phone that buzzes during salah needs an off switch.
//
// Loaded lazily so the native module isn't pulled in on web at all, and
// every call is fire-and-forget: feedback that fails is never worth an
// error path, and haptics can legitimately fail (Android permission,
// low-power mode, no vibrator hardware).

import { Platform } from "react-native";

type HapticsModule = typeof import("expo-haptics");

let modulePromise: Promise<HapticsModule> | null = null;

function load(): Promise<HapticsModule> | null {
  if (Platform.OS === "web") return null;
  if (!modulePromise) modulePromise = import("expo-haptics");
  return modulePromise;
}

/** A confirmation buzz — reserved for genuinely acquiring something. */
export function hapticSuccess(enabled: boolean): void {
  if (!enabled) return;
  void load()
    ?.then((H) => H.notificationAsync(H.NotificationFeedbackType.Success))
    .catch(() => {});
}

/** A light tick — for passing a threshold, not for arriving anywhere. */
export function hapticTick(enabled: boolean): void {
  if (!enabled) return;
  void load()
    ?.then((H) => H.impactAsync(H.ImpactFeedbackStyle.Light))
    .catch(() => {});
}
