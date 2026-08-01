// Planning which prayer notifications to schedule.
//
// Constraint that shapes everything here: iOS allows at most 64 pending
// local notifications per app, and prayer times shift daily so calendar
// repeats can't be used. The plan therefore schedules a rolling window of
// upcoming prayers (5/day fits ~12 days in the budget) and the app tops the
// window back up whenever it is opened. If someone doesn't open the app for
// the whole window, notifications stop until they next open it — that
// trade-off is inherent to on-device scheduling with no server, and it
// matches the app's no-tracking promise.
//
// Pure functions: the expo-notifications calls live in the context; this
// module just decides WHAT to schedule and is fully testable.

import { computePrayerSchedule, type CalcOptions } from "./prayerTimes";

export const PRAYER_KEYS = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export type NotificationPrefs = {
  enabled: boolean;
  /** Which prayers to announce. */
  prayers: Record<PrayerKey, boolean>;
  /** Minutes BEFORE the prayer time to fire (0 = at the adhan time). */
  minutesBefore: number;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false, // opt-in, never opt-out
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  minutesBefore: 0,
};

export type PlannedNotification = {
  /** Stable identity, e.g. "prayer-2026-08-01-fajr". */
  id: string;
  prayer: PrayerKey;
  /** When the notification should fire. */
  fireAt: Date;
  /** The actual prayer time (differs from fireAt when minutesBefore > 0). */
  prayerAt: Date;
  title: string;
  body: string;
};

/** iOS's hard ceiling on pending local notifications. */
export const IOS_PENDING_LIMIT = 64;
/** Leave headroom under the cap for any future non-prayer notifications. */
export const MAX_PLANNED = 60;

/** Days of coverage to aim for; the cap may trim the tail. */
export const WINDOW_DAYS = 14;

/**
 * Plan the next `MAX_PLANNED` notifications from `now`, for the user's
 * location and calculation settings. Deterministic given its inputs.
 */
export function planNotifications(
  lat: number,
  lng: number,
  options: CalcOptions,
  prefs: NotificationPrefs,
  now: Date,
): PlannedNotification[] {
  if (!prefs.enabled) return [];
  const wanted = new Set(PRAYER_KEYS.filter((k) => prefs.prayers[k]));
  if (wanted.size === 0) return [];

  const planned: PlannedNotification[] = [];
  const offsetMs = Math.max(0, prefs.minutesBefore) * 60_000;

  for (let dayOffset = 0; dayOffset <= WINDOW_DAYS; dayOffset++) {
    const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const schedule = computePrayerSchedule(lat, lng, options, day);
    if (!schedule) continue; // polar edge case: skip the day
    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    for (const entry of schedule) {
      if (entry.key === "sunrise" || !wanted.has(entry.key)) continue;
      const fireAt = new Date(entry.time.getTime() - offsetMs);
      if (fireAt.getTime() <= now.getTime()) continue; // already passed
      planned.push({
        id: `prayer-${dateKey}-${entry.key}`,
        prayer: entry.key,
        fireAt,
        prayerAt: entry.time,
        title:
          prefs.minutesBefore > 0
            ? `${entry.label} in ${prefs.minutesBefore} min`
            : `${entry.label} time`,
        body:
          prefs.minutesBefore > 0
            ? `${entry.label} begins at ${entry.display}.`
            : `It's time for ${entry.label} (${entry.display}).`,
      });
      if (planned.length >= MAX_PLANNED) return planned;
    }
  }
  return planned;
}

/**
 * How stale the stored plan is allowed to get before rescheduling. Half the
 * window balances battery/API churn against coverage: reopening the app any
 * time in the first week keeps notifications seamless.
 */
export const RESCHEDULE_AFTER_MS = (WINDOW_DAYS / 2) * 24 * 60 * 60 * 1000;

/**
 * Should the plan be rebuilt? True when preferences changed, the user moved
 * meaningfully (prayer times shift ~1 min per 25 km east-west), or the plan
 * is older than half the window.
 */
export function needsReschedule(state: {
  lastScheduledAt: number | null;
  lastLat: number | null;
  lastLng: number | null;
  lastPrefsFingerprint: string | null;
  now: Date;
  lat: number;
  lng: number;
  prefsFingerprint: string;
}): boolean {
  if (state.lastScheduledAt === null) return true;
  if (state.lastPrefsFingerprint !== state.prefsFingerprint) return true;
  if (state.now.getTime() - state.lastScheduledAt > RESCHEDULE_AFTER_MS) {
    return true;
  }
  if (state.lastLat === null || state.lastLng === null) return true;
  const moved =
    Math.abs(state.lat - state.lastLat) > 0.25 ||
    Math.abs(state.lng - state.lastLng) > 0.25;
  return moved;
}

/** Stable fingerprint of the preference + calculation inputs. */
export function prefsFingerprint(
  prefs: NotificationPrefs,
  options: CalcOptions,
): string {
  return JSON.stringify([
    prefs.enabled,
    PRAYER_KEYS.map((k) => prefs.prayers[k]),
    prefs.minutesBefore,
    options.method,
    options.madhab,
    options.shafaq,
  ]);
}
