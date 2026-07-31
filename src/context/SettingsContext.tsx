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
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  // Set once the user changes anything. Guards against the (rare but real)
  // race where disk hydration lands *after* a first-launch tap and silently
  // reverts the user's choice.
  const userEdited = useRef(false);
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
        if (!userEdited.current) {
          const fromDisk = stored;
          setSettings((prev) => ({ ...prev, ...fromDisk }));
        }
      } catch {
        // Corrupt/missing settings must never break launch -- keep defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<PrayerSettings>) => {
    userEdited.current = true;
    persisted.current = { ...persisted.current, ...patch };
    // Fire-and-forget persistence -- never block the UI on a disk write.
    void AsyncStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(persisted.current),
    ).catch(() => {});
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings }),
    [settings, updateSettings],
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
