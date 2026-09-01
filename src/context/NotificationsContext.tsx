import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSettings } from "./SettingsContext";
import {
  DEFAULT_NOTIFICATION_PREFS,
  needsReschedule,
  planNotifications,
  prefsFingerprint,
  type NotificationPrefs,
} from "@/lib/notificationPlan";

// What actually schedules OS notifications. All decisions about WHAT to
// schedule live in src/lib/notificationPlan.ts (pure, tested); this context
// owns permissions, persistence, and the reschedule loop.
//
// Privacy: everything is a LOCAL notification computed on-device from the
// last known location. No server is involved and nothing leaves the phone,
// which is why notifications keep the app's no-tracking promise.

const PREFS_KEY = "notificationPrefs:v1";
const STATE_KEY = "notificationState:v1";

/**
 * How old the last location we scheduled from may be and still be planned
 * from again.
 *
 * `location` below is a ref that starts empty on every launch and is only
 * ever filled by a live GPS fix, so the persisted coordinates are what keeps
 * the rolling window topped up for someone whose fix never arrives — a user
 * who granted location once and later revoked it, or who simply hasn't
 * opened the home screen yet this session. Reuse is right for prayer times
 * (they shift about a minute per 25 km) but not forever: a phone unopened
 * for a month may be on another continent, and times for the wrong city are
 * worse than none.
 *
 * Measured from when the COORDINATES were fixed, not from the last schedule.
 * Scheduling refreshes `lastScheduledAt` — including when it plans from
 * reused coordinates — so bounding on that slid the window forward forever:
 * someone who granted location once in London, moved, and kept opening the
 * app would be given London's times indefinitely, hours out and never
 * expiring. Ageing the fix itself is what makes the bound real; when it
 * lapses, `locationAvailable` goes false and Settings says so out loud.
 */
const LOCATION_REUSE_MS = 30 * 24 * 60 * 60 * 1000;

type ScheduleState = {
  lastScheduledAt: number | null;
  lastLat: number | null;
  lastLng: number | null;
  /**
   * When lastLat/lastLng came off a live GPS fix. Null in state persisted
   * before this field existed, where lastScheduledAt is the closest estimate
   * available.
   */
  lastFixAt: number | null;
  lastPrefsFingerprint: string | null;
};

const EMPTY_STATE: ScheduleState = {
  lastScheduledAt: null,
  lastLat: null,
  lastLng: null,
  lastFixAt: null,
  lastPrefsFingerprint: null,
};

type NotificationsContextValue = {
  prefs: NotificationPrefs;
  /** null = not asked yet; false = denied at the OS level. */
  permissionGranted: boolean | null;
  /**
   * Whether the scheduler has coordinates to plan from — this session's fix,
   * or a persisted one still inside LOCATION_REUSE_MS. False means nothing
   * can be scheduled however the prefs read, which the Settings screen says
   * out loud rather than leaving an enabled toggle looking productive.
   */
  locationAvailable: boolean;
  updatePrefs: (patch: Partial<NotificationPrefs>) => void;
  /** Enable notifications, requesting OS permission if needed. */
  enable: () => Promise<boolean>;
  disable: () => void;
  /** Called by the home screen whenever a fresh location fix lands. */
  reportLocation: (lat: number, lng: number) => void;
  /** Dev-only: fire a sample notification a few seconds from now. */
  sendTest: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue>({
  prefs: DEFAULT_NOTIFICATION_PREFS,
  permissionGranted: null,
  locationAvailable: false,
  updatePrefs: () => {},
  enable: async () => false,
  disable: () => {},
  reportLocation: () => {},
  sendTest: async () => {},
});

// expo-notifications is loaded LAZILY, on the first actual use. Importing
// it at module scope runs a push-token auto-registration side effect
// (DevicePushTokenAutoRegistration.fx) which logs a red error in Expo Go on
// Android — remote push was removed from Go in SDK 53. We only ever use
// LOCAL notifications, so defer the import until the user touches the
// feature; in Expo Go the note appears once at that point instead of on
// every launch, and in dev/production builds it never appears at all.
type NotificationsModule = typeof import("expo-notifications");
let notifierPromise: Promise<NotificationsModule> | null = null;

/** Does this permissions response count as "on" for our purposes? */
function isGranted(
  N: NotificationsModule,
  status: { granted: boolean; ios?: { status?: number } },
): boolean {
  return (
    status.granted ||
    status.ios?.status === N.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Android channel every prayer alert is posted to. Referenced by
 * `channelId` on each trigger below — creating a channel is not enough,
 * and a notification that names no channel goes to expo's generic fallback
 * instead. That fallback is created at HIGH importance with vibration, so
 * alerts were never silently broken; the damage was that Android's
 * per-app settings listed a "Miscellaneous" channel carrying the real
 * alerts next to an inert "Prayer times" channel the user could toggle to
 * no effect.
 */
const ANDROID_CHANNEL_ID = "prayer-times";

function getNotifier(): Promise<NotificationsModule> {
  if (!notifierPromise) {
    notifierPromise = import("expo-notifications").then(async (N) => {
      // Show alerts even when the app is foregrounded — someone waiting
      // for the adhan with the app open still wants the banner.
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      // Asserted here rather than in enable(), and AWAITED: if the channel
      // doesn't exist at the moment a notification is posted, Android logs
      // an error and silently falls back. Re-asserting is safe but note
      // it will NOT raise importance on an existing channel — Android
      // freezes that at creation time.
      if (Platform.OS === "android") {
        await N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: "Prayer times",
          importance: N.AndroidImportance.HIGH,
          sound: "default",
        }).catch(() => {});
      }
      return N;
    });
  }
  return notifierPromise;
}

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { calcOptions } = useSettings();
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );
  const [locationAvailable, setLocationAvailable] = useState(false);
  const location = useRef<{ lat: number; lng: number } | null>(null);
  const scheduleState = useRef<ScheduleState>(EMPTY_STATE);
  // State, not a ref: the effects below must not schedule anything from the
  // defaults before storage has been read, and as state it is an honest
  // dependency that re-runs them once it has.
  const [hydrated, setHydrated] = useState(false);
  // Serialises reschedules: a second trigger while one is in flight waits.
  const rescheduling = useRef<Promise<void> | null>(null);

  // Hydrate prefs + schedule bookkeeping once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawPrefs, rawState] = await Promise.all([
          AsyncStorage.getItem(PREFS_KEY),
          AsyncStorage.getItem(STATE_KEY),
        ]);
        if (cancelled) return;
        if (rawPrefs) {
          const parsed = JSON.parse(rawPrefs) as Partial<NotificationPrefs>;
          setPrefs((prev) => ({
            ...prev,
            ...(typeof parsed.enabled === "boolean"
              ? { enabled: parsed.enabled }
              : null),
            ...(parsed.prayers && typeof parsed.prayers === "object"
              ? { prayers: { ...prev.prayers, ...parsed.prayers } }
              : null),
            ...(typeof parsed.minutesBefore === "number" &&
            parsed.minutesBefore >= 0 &&
            parsed.minutesBefore <= 60
              ? { minutesBefore: parsed.minutesBefore }
              : null),
          }));
        }
        if (rawState) {
          scheduleState.current = { ...EMPTY_STATE, ...JSON.parse(rawState) };
        }
      } catch {
        // Corrupt storage must never break launch.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist whatever the prefs are once storage has been read — including
  // the hydrated copy itself, which harmlessly normalises an old blob.
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefs, hydrated]);

  /**
   * Coordinates to plan from: this session's fix when the home screen has
   * reported one, otherwise the location the last schedule was built from.
   * The central-London fallback the home screen shows places from is
   * deliberately NOT a candidate — it is a browsing convenience, and prayer
   * times for a city the user isn't in would be worse than silence.
   */
  const planCoords = useCallback((): { lat: number; lng: number } | null => {
    if (location.current) return location.current;
    const { lastLat, lastLng, lastScheduledAt, lastFixAt } =
      scheduleState.current;
    if (lastLat === null || lastLng === null) return null;
    const fixedAt = lastFixAt ?? lastScheduledAt;
    if (fixedAt === null) return null;
    if (Date.now() - fixedAt > LOCATION_REUSE_MS) return null;
    return { lat: lastLat, lng: lastLng };
  }, []);

  /** Rebuild the OS notification queue from the current plan. */
  const reschedule = useCallback(
    async (reason: "change" | "topup") => {
      const run = async () => {
        // A user who has NEVER enabled notifications must never cause the
        // module to load (see getNotifier — the import itself is noisy in
        // Expo Go on Android).
        if (!prefs.enabled && scheduleState.current.lastScheduledAt === null) {
          return;
        }
        const coords = planCoords();
        // Publish this before bailing: with no coordinates the toggle can be
        // on and permission granted while nothing whatsoever is scheduled,
        // and Settings needs to be able to say so.
        setLocationAvailable(coords !== null);
        if (!coords) return;
        const fingerprint = prefsFingerprint(prefs, calcOptions);
        if (
          reason === "topup" &&
          !needsReschedule({
            ...scheduleState.current,
            now: new Date(),
            lat: coords.lat,
            lng: coords.lng,
            prefsFingerprint: fingerprint,
          })
        ) {
          return;
        }

        const N = await getNotifier();
        // Replace wholesale: cancelling and re-adding ~60 local
        // notifications is cheap and immune to drift/duplication.
        await N.cancelAllScheduledNotificationsAsync();
        if (prefs.enabled) {
          const plan = planNotifications(
            coords.lat,
            coords.lng,
            calcOptions,
            prefs,
            new Date(),
          );
          for (const item of plan) {
            await N.scheduleNotificationAsync({
              identifier: item.id,
              content: {
                title: item.title,
                body: item.body,
                sound: true,
              },
              trigger: {
                type: N.SchedulableTriggerInputTypes.DATE,
                date: item.fireAt,
                // Ignored on iOS; on Android this is what routes the alert
                // to the app's own channel instead of "Miscellaneous".
                channelId: ANDROID_CHANNEL_ID,
              },
            });
          }
        }
        const previous = scheduleState.current;
        scheduleState.current = {
          lastScheduledAt: Date.now(),
          lastLat: coords.lat,
          lastLng: coords.lng,
          // planCoords prefers the live fix, so this is exactly when these
          // coordinates were measured. Reused coordinates keep their original
          // age — pinned to the best estimate we have for legacy state, so
          // topping up cannot quietly reset the clock on itself.
          lastFixAt: location.current
            ? Date.now()
            : (previous.lastFixAt ?? previous.lastScheduledAt),
          lastPrefsFingerprint: fingerprint,
        };
        void AsyncStorage.setItem(
          STATE_KEY,
          JSON.stringify(scheduleState.current),
        ).catch(() => {});
      };
      // Chain onto any in-flight run so two triggers can't interleave.
      const next = (rescheduling.current ?? Promise.resolve())
        .then(run)
        .catch(() => {});
      rescheduling.current = next;
      await next;
    },
    [prefs, calcOptions, planCoords],
  );

  // Top up the rolling window on foreground and on relevant changes.
  useEffect(() => {
    if (!hydrated) return;
    void reschedule("topup");
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void reschedule("topup");
      // The OS permission can be revoked from the device Settings app while
      // Musallah is backgrounded. Without this, `permissionGranted` keeps
      // whatever value `enable()` last set and the Settings screen keeps
      // showing notifications as on even after the OS silently turned them
      // off. Only re-check once we've actually asked before (permission
      // starts `null`), so a user who's never touched the feature still
      // never triggers the expo-notifications import on every foreground.
      if (permissionGranted !== null) {
        void getNotifier()
          .then((N) => N.getPermissionsAsync().then((status) => [N, status] as const))
          .then(([N, status]) => setPermissionGranted(isGranted(N, status)))
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [reschedule, permissionGranted, hydrated]);

  const updatePrefs = useCallback((patch: Partial<NotificationPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  // Prefs/settings changed -> rebuild the queue (reschedule identity
  // changes with them, so this effect covers both).
  useEffect(() => {
    if (!hydrated) return;
    void reschedule("change");
  }, [reschedule, hydrated]);

  const enable = useCallback(async (): Promise<boolean> => {
    const N = await getNotifier();
    const current = await N.getPermissionsAsync();
    let granted = isGranted(N, current);
    if (!granted && current.canAskAgain) {
      const asked = await N.requestPermissionsAsync();
      granted = asked.granted;
    }
    setPermissionGranted(granted);
    if (granted) {
      // The channel is created in getNotifier(), which has already run by
      // the time `N` exists here — it has to be asserted before any post,
      // not only on the path where the user turns alerts on.
      updatePrefs({ enabled: true });
    }
    return granted;
  }, [updatePrefs]);

  const disable = useCallback(() => {
    updatePrefs({ enabled: false });
    void getNotifier()
      .then((N) => N.cancelAllScheduledNotificationsAsync())
      .catch(() => {});
  }, [updatePrefs]);

  // Dev-only verification: fire a sample a few seconds out, so delivery can
  // be checked in Expo Go without waiting for the next prayer.
  const sendTest = useCallback(async () => {
    const N = await getNotifier();
    await N.scheduleNotificationAsync({
      content: {
        title: "Dhuhr time",
        body: "This is how a prayer alert will look. (Test)",
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  }, []);

  const reportLocation = useCallback(
    (lat: number, lng: number) => {
      location.current = { lat, lng };
      // Set here as well as in reschedule so the notice in Settings never
      // flashes on for the frame between enabling alerts and the queue being
      // rebuilt.
      setLocationAvailable(true);
      void reschedule("topup");
    },
    [reschedule],
  );

  const value = useMemo(
    () => ({
      prefs,
      permissionGranted,
      locationAvailable,
      updatePrefs,
      enable,
      disable,
      reportLocation,
      sendTest,
    }),
    [
      prefs,
      permissionGranted,
      locationAvailable,
      updatePrefs,
      enable,
      disable,
      reportLocation,
      sendTest,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext);
}
