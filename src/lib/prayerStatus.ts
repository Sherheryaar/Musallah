import type { PrayerScheduleEntry } from "./prayerTimes";

export type PrayerStatus = {
  /**
   * The obligatory prayer whose window is open RIGHT NOW, or null when none
   * is. The prayer screen highlights this row, so it must never name a
   * prayer you can no longer pray.
   */
  currentKey: PrayerScheduleEntry["key"] | null;
  /** What to say about "now", directly above the countdown. */
  nowLabel: string;
  /** The prayer being counted down to — typed, so a row can match on it. */
  nextKey: PrayerScheduleEntry["key"];
  nextLabel: string;
  msUntilNext: number;
};

/**
 * "What am I in now, and what's next" for one day's schedule.
 *
 * Lives here rather than inside the screen so the Fajr rule below can be
 * tested at specific clock times, which is the only way to catch it: the bug
 * it fixes was invisible in every test that ran at midday.
 */
export function getPrayerStatus(
  today: PrayerScheduleEntry[],
  tomorrowFajr: Date | null,
  now: Date,
): PrayerStatus | null {
  // Sunrise is not a prayer, but it IS the boundary that closes Fajr, so it
  // is pulled out rather than simply discarded.
  const prayers = today.filter((entry) => entry.key !== "sunrise");
  if (prayers.length === 0) return null;
  const sunrise = today.find((entry) => entry.key === "sunrise") ?? null;

  const next = prayers.find((entry) => entry.time.getTime() > now.getTime());

  if (!next) {
    // After Isha: the next prayer is tomorrow's Fajr.
    if (!tomorrowFajr) return null;
    return {
      currentKey: "isha",
      nowLabel: "Now · Isha",
      nextKey: "fajr",
      nextLabel: "Fajr",
      msUntilNext: tomorrowFajr.getTime() - now.getTime(),
    };
  }

  const previous = prayers[prayers.indexOf(next) - 1] ?? null;

  // Fajr is the ONE prayer whose window closes BEFORE the next prayer
  // begins: it ends at sunrise, not at Dhuhr. Nothing obligatory is in
  // progress between sunrise and Dhuhr, so say what happened and highlight
  // nothing. What is voluntarily prayed in that gap (Duha, the makruh
  // stretch after sunrise) is deliberately NOT asserted: that is a fiqh
  // question with more than one answer.
  if (
    previous?.key === "fajr" &&
    sunrise &&
    now.getTime() >= sunrise.time.getTime()
  ) {
    return {
      currentKey: null,
      nowLabel: `Fajr ended · ${sunrise.display}`,
      nextKey: next.key,
      nextLabel: next.label,
      msUntilNext: next.time.getTime() - now.getTime(),
    };
  }

  // Before Fajr the "current" prayer is still last night's Isha.
  const current = previous ?? { key: "isha" as const, label: "Isha" };
  return {
    currentKey: current.key,
    nowLabel: `Now · ${current.label}`,
    nextKey: next.key,
    nextLabel: next.label,
    msUntilNext: next.time.getTime() - now.getTime(),
  };
}
