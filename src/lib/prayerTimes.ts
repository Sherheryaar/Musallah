// Calculated prayer times from the AlAdhan API (free, no key needed).
// These are the *fallback* times — real jamaat times come later (plan §3.2).

export type PrayerTimes = {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
};

const PRAYER_KEYS: Array<keyof PrayerTimes> = [
  "Fajr",
  "Sunrise",
  "Dhuhr",
  "Asr",
  "Maghrib",
  "Isha",
];

/**
 * Fetch today's calculated times for a location.
 * method=3 is Muslim World League; school=0 is standard Asr (1 = Hanafi).
 * TODO: make these user-configurable, and consider the London Unified
 * Prayer Timetable as the London-preferred option (plan §3.3).
 */
export async function fetchPrayerTimes(
  lat: number,
  lng: number,
  options: { method?: number; school?: 0 | 1 } = {},
): Promise<PrayerTimes | null> {
  const { method = 3, school = 0 } = options;
  // Abort slow requests so the UI never hangs on a bad connection.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const timings = json?.data?.timings;
    if (!timings) return null;
    const result = {} as PrayerTimes;
    for (const key of PRAYER_KEYS) {
      // API returns e.g. "13:05 (BST)" — keep just HH:MM, and fail
      // closed (hide the bar) if the response shape ever changes.
      const match = /^\d{1,2}:\d{2}/.exec(String(timings[key] ?? ""));
      if (!match) return null;
      result[key] = match[0];
    }
    return result;
  } catch {
    // Offline or API down — the app should still work without times.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}