import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CalcOptions } from "@/lib/prayerCalc";
import {
  DEFAULT_SETTINGS,
  LEGACY_SETTINGS_STORAGE_KEY,
  migrateV1Settings,
  sanitizeSettings,
  SETTINGS_STORAGE_KEY,
  type PrayerSettings,
} from "./settingsStorage";

export { DEFAULT_SETTINGS, type PrayerSettings } from "./settingsStorage";

type SettingsContextValue = {
  settings: PrayerSettings;
  updateSettings: (patch: Partial<PrayerSettings>) => void;
  /**
   * Just the three settings the prayer-time maths depends on, as one stable
   * object. Screens key their schedule memos on THIS rather than on
   * `settings`, so toggling a facility filter never recomputes a prayer time.
   */
  calcOptions: CalcOptions;
};

const calcOptionsOf = (s: PrayerSettings): CalcOptions => ({
  method: s.method,
  madhab: s.madhab,
  shafaq: s.shafaq,
});

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  calcOptions: calcOptionsOf(DEFAULT_SETTINGS),
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  // Which fields the user has explicitly changed THIS session. Guards
  // against the (rare but real) race where disk hydration lands *after* a
  // first-launch tap and would otherwise revert the user's choice -- but
  // per-field, not all-or-nothing: touching one setting (e.g. a facility
  // filter) must not discard every OTHER saved preference (e.g. madhab)
  // that hydration was about to restore.
  const touchedKeys = useRef<Set<keyof PrayerSettings>>(new Set());
  // Only the fields the user has explicitly set — this, not the full
  // settings object, is what gets written to disk. Writing everything froze
  // then-current defaults into storage, so a later default change (shafi →
  // hanafi Asr) never reached anyone who had touched any other setting.
  const persisted = useRef<Partial<PrayerSettings>>({});

  // Hydrate once from disk. Defaults render immediately; a saved preference
  // lands a few milliseconds later, well before the user can notice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let stored: Partial<PrayerSettings> | null = null;
        const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          stored = sanitizeSettings(JSON.parse(raw));
        } else {
          const legacy = await AsyncStorage.getItem(
            LEGACY_SETTINGS_STORAGE_KEY,
          );
          if (legacy) {
            stored = migrateV1Settings(JSON.parse(legacy));
            await AsyncStorage.setItem(
              SETTINGS_STORAGE_KEY,
              JSON.stringify(stored),
            );
            await AsyncStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
          }
        }
        if (cancelled || !stored) return;
        // Anything the user set before hydration finished wins over disk.
        persisted.current = { ...stored, ...persisted.current };
        // Apply disk values only for fields the user hasn't touched yet
        // this session -- a tap on one setting must not block every other
        // saved preference from loading.
        const fromDisk = stored;
        setSettings((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(fromDisk) as Array<
            keyof PrayerSettings
          >) {
            if (!touchedKeys.current.has(key)) {
              (next as Record<string, unknown>)[key] = fromDisk[key];
            }
          }
          return next;
        });
      } catch {
        // Corrupt/missing settings must never break launch -- keep defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<PrayerSettings>) => {
    for (const key of Object.keys(patch) as Array<keyof PrayerSettings>) {
      touchedKeys.current.add(key);
    }
    persisted.current = { ...persisted.current, ...patch };
    // Fire-and-forget persistence -- never block the UI on a disk write.
    void AsyncStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(persisted.current),
    ).catch(() => {});
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const calcOptions = useMemo(
    () => calcOptionsOf(settings),
    [settings.method, settings.madhab, settings.shafaq],
  );

  const value = useMemo(
    () => ({ settings, updateSettings, calcOptions }),
    [settings, updateSettings, calcOptions],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
