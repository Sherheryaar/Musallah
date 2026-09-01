// Clock and date strings, in the device's local time zone.
//
// Every screen that shows a time or counts down to one reads from here, so
// the same instant can never be spelled two ways ("1 h 3 min" on one screen
// and "1 hr 2 mins" on another looks like two different clocks).

/** "05:15" — 24-hour, zero-padded. */
export function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

/** "2026-01-05" — the device's local calendar date, not UTC's. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * A countdown as "45 mins", "1 hr", or "1 hr 2 mins".
 *
 * Abbreviated rather than spelled out: the times bar fits this on a single
 * caption line beside the prayer's name, and that line has nowhere to grow
 * at large font scales.
 *
 * Rounds UP to whole minutes and never drops below "1 min" — a prayer twenty
 * seconds away is still to come, and "0 mins" reads as "you missed it".
 * Seconds are deliberately absent: neither screen is a stopwatch, and a
 * ticking second count would force both to re-render every second.
 */
export function formatCountdown(msLeft: number): string {
  const mins = Math.max(1, Math.ceil(msLeft / 60_000));
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const h = `${hours} hr${hours === 1 ? "" : "s"}`;
  return rest === 0 ? h : `${h} ${rest} min${rest === 1 ? "" : "s"}`;
}
