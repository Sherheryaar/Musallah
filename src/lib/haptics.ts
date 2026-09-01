// Vibration feedback, guarded by THE USER'S CHOICE: callers pass the
// `hapticFeedback` setting through — a phone that buzzes during salah needs
// an off switch.
//
// Loaded lazily, and every call is fire-and-forget: feedback that fails is
// never worth an error path, and haptics can legitimately fail (Android
// permission, low-power mode, no vibrator hardware).

type HapticsModule = typeof import("expo-haptics");

let modulePromise: Promise<HapticsModule> | null = null;

function load(): Promise<HapticsModule> {
  if (!modulePromise) modulePromise = import("expo-haptics");
  return modulePromise;
}

/** A confirmation buzz — reserved for genuinely acquiring something. */
export function hapticSuccess(enabled: boolean): void {
  if (!enabled) return;
  void load()
    .then((H) => H.notificationAsync(H.NotificationFeedbackType.Success))
    .catch(() => {});
}

/** A light tick — for passing a threshold, not for arriving anywhere. */
export function hapticTick(enabled: boolean): void {
  if (!enabled) return;
  void load()
    .then((H) => H.impactAsync(H.ImpactFeedbackStyle.Light))
    .catch(() => {});
}

/** A subtle click — for selecting filter chips, segmented tabs, and options. */
export function hapticSelection(enabled: boolean): void {
  if (!enabled) return;
  void load()
    .then((H) => H.selectionAsync())
    .catch(() => {});
}

/** Heavy impact — for decisive lock-on events (e.g. Qibla alignment). */
export function hapticHeavy(enabled: boolean): void {
  if (!enabled) return;
  void load()
    .then((H) => H.impactAsync(H.ImpactFeedbackStyle.Heavy))
    .catch(() => {});
}
