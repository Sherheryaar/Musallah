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

type ScheduleState = {
  lastScheduledAt: number | null;
  lastLat: number | null;
  lastLng: number | null;
  lastPrefsFingerprint: string | null;
};

const EMPTY_STATE: ScheduleState = {
  lastScheduledAt: null,
  lastLat: null,
  lastLng: null,
  lastPrefsFingerprint: null,
};

type NotificationsContextValue = {
  prefs: NotificationPrefs;
  /** null = not asked yet; false = denied at the OS level. */
  permissionGranted: boolean | null;
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

function getNotifier(): Promise<NotificationsModule> {
  if (!notifierPromise) {
    notifierPromise = import("expo-notifications").then((N) => {
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
  const { settings } = useSettings();
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );
  const location = useRef<{ lat: number; lng: number } | null>(null);
  const scheduleState = useRef<ScheduleState>(EMPTY_STATE);
  const hydrated = useRef(false);
  // Serialises reschedules: a second trigger while one is in flight waits.
  const rescheduling = useRef<Promise<void> | null>(null);

  const calcOptions = useMemo(
    () => ({
      method: settings.method,
      madhab: settings.madhab,
      shafaq: settings.shafaq,
    }),
    [settings.method, settings.madhab, settings.shafaq],
  );

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
        hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPrefs = useCallback((next: NotificationPrefs) => {
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /** Rebuild the OS notification queue from the current plan. */
  const reschedule = useCallback(
    async (reason: "change" | "topup") => {
      if (Platform.OS === "web") return; // no local notifications on web
      const run = async () => {
        // A user who has NEVER enabled notifications must never cause the
        // module to load (see getNotifier — the import itself is noisy in
        // Expo Go on Android).
        if (!prefs.enabled && scheduleState.current.lastScheduledAt === null) {
          return;
        }
        const coords = location.current;
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
              },
            });
          }
        }
        scheduleState.current = {
          lastScheduledAt: Date.now(),
          lastLat: coords.lat,
          lastLng: coords.lng,
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
    [prefs, calcOptions],
  );

  // Top up the rolling window on foreground and on relevant changes.
  useEffect(() => {
    if (!hydrated.current) return;
    void reschedule("topup");
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reschedule("topup");
    });
    return () => sub.remove();
  }, [reschedule]);

  const updatePrefs = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        persistPrefs(next);
        return next;
      });
    },
    [persistPrefs],
  );

  // Prefs/settings changed -> rebuild the queue (reschedule identity
  // changes with them, so this effect covers both).
  useEffect(() => {
    if (!hydrated.current) return;
    void reschedule("change");
  }, [reschedule]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") return false;
    const N = await getNotifier();
    const current = await N.getPermissionsAsync();
    let granted =
      current.granted ||
      current.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
    if (!granted && current.canAskAgain) {
      const asked = await N.requestPermissionsAsync();
      granted = asked.granted;
    }
    setPermissionGranted(granted);
    if (granted) {
      if (Platform.OS === "android") {
        // Android 8+ requires a channel; also gives the sound/importance.
        await N.setNotificationChannelAsync("prayer-times", {
          name: "Prayer times",
          importance: N.AndroidImportance.HIGH,
          sound: "default",
        });
      }
      updatePrefs({ enabled: true });
    }
    return granted;
  }, [updatePrefs]);

  const disable = useCallback(() => {
    updatePrefs({ enabled: false });
    if (Platform.OS !== "web") {
      void getNotifier()
        .then((N) => N.cancelAllScheduledNotificationsAsync())
        .catch(() => {});
    }
  }, [updatePrefs]);

  // Dev-only verification: fire a sample a few seconds out, so delivery can
  // be checked in Expo Go without waiting for the next prayer.
  const sendTest = useCallback(async () => {
    if (Platform.OS === "web") return;
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
      },
    });
  }, []);

  const reportLocation = useCallback(
    (lat: number, lng: number) => {
      location.current = { lat, lng };
      void reschedule("topup");
    },
    [reschedule],
  );

  const value = useMemo(
    () => ({
      prefs,
      permissionGranted,
      updatePrefs,
      enable,
      disable,
      reportLocation,
      sendTest,
    }),
    [
      prefs,
      permissionGranted,
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
