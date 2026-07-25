import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CalculationMethodKey, Madhab } from "@/lib/prayerCalc";
import type { FacilityKey } from "@/data/places";

const STORAGE_KEY = "settings:v1";

const FACILITY_KEYS: FacilityKey[] = [
  "sistersSpace",
  "wudu",
  "disabledAccess",
  "parking",
  "jumuah",
  "janazah",
];

export type PrayerSettings = {
  /** Fajr/Isha rule set. Moonsighting Committee is recommended for the UK. */
  method: CalculationMethodKey;
  /** Asr juristic method: "shafi" = 1 mithl, "hanafi" = 2 mithl. */
  madhab: Madhab;
  /**
   * Facility filters chosen on the home screen (sisters' space, wudu, ...).
   * Persisted so a choice made on first launch sticks on every later launch.
   */
  facilityFilters: FacilityKey[];
};

export const DEFAULT_SETTINGS: PrayerSettings = {
  method: "moonsighting",
  madhab: "shafi",
  facilityFilters: [],
};

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

  // Hydrate once from disk. Defaults render immediately; a saved preference
  // lands a few milliseconds later, well before the user can notice.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as Partial<PrayerSettings>;
        setSettings((prev) => ({
          ...prev,
          ...(parsed.method === "moonsighting" || parsed.method === "mwl"
            ? { method: parsed.method }
            : null),
          ...(parsed.madhab === "shafi" || parsed.madhab === "hanafi"
            ? { madhab: parsed.madhab }
            : null),
          ...(Array.isArray(parsed.facilityFilters)
            ? {
                facilityFilters: parsed.facilityFilters.filter(
                  (key): key is FacilityKey =>
                    (FACILITY_KEYS as string[]).includes(key as string),
                ),
              }
            : null),
        }));
      })
      .catch(() => {
        // Corrupt/missing settings must never break launch -- keep defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<PrayerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Fire-and-forget persistence -- never block the UI on a disk write.
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
        () => {},
      );
      return next;
    });
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
