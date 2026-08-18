// How long until the next prayer, in words. The home screen's times bar and
// the prayer screen's hero both count down to the same moment, so they read
// from this one function — a gap spelled two ways ("1 h 3 min" here, "1 hr 2
// mins" there) looks like two different clocks.

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
