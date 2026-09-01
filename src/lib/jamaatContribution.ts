// The jamaat-times contribution loop.
//
// Only 136 of the 2,244 places carry jamaat times — the app's weakest data,
// and the one thing regular attendees look up daily. The fix has to come
// from the people standing in the building, so contributing must cost
// almost nothing:
//
//   - A place WITH times shows one-tap "Still right" / "Out of date"
//     controls. A tap sends a structured confirmation through the existing
//     `submissions` pipe — no typing, no form.
//   - A place WITHOUT times invites "Add them", which opens the existing
//     suggestion sheet with provenance topics ("Masjid website",
//     "Noticeboard photo", "I pray here") so triage knows how much to
//     trust each contribution without anyone writing a sentence about it.
//
// Everything rides the submissions table exactly as it is (kind='edit',
// message ≤ 2000 chars, insert-only under RLS): the structure lives in the
// MESSAGE, in a stable machine-scannable prefix, so the triage side can
// grep for `[Jamaat confirmed]` / `[Jamaat times]` and act in bulk.
//
// This module is the pure part — message formats and the re-ask policy —
// so both are unit-tested without touching React or the network.

import { PRAYER_KEYS, type JamaatTimes, type Place } from "@/data/places";
import { isoDate } from "./time";

/**
 * How long one user's "still right" tap silences the question on their own
 * device. A month matches how often timetables actually move (most masjids
 * shift jamaat times a handful of times a year, around the clock changes
 * and Ramadan), and it keeps one enthusiastic user from filing a daily
 * stream of identical confirmations.
 */
export const CONFIRM_COOLDOWN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Should the confirm controls be offered, given the last recorded tap?
 * `lastConfirmedIso` is whatever AsyncStorage returned — null when the user
 * has never confirmed this place, and untrusted text in every case (storage
 * can be stale, hand-edited, or from an old app version). Anything
 * unparseable counts as "never confirmed": the wrong failure mode is
 * silently never asking again.
 */
export function shouldOfferConfirmation(
  lastConfirmedIso: string | null,
  now: Date,
): boolean {
  if (!lastConfirmedIso) return true;
  const last = Date.parse(lastConfirmedIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= CONFIRM_COOLDOWN_DAYS * DAY_MS;
}

/** "fajr 05:15, dhuhr 13:30" — only the prayers the record actually has. */
function timesShown(jamaat: JamaatTimes): string {
  return PRAYER_KEYS.filter((key) => jamaat[key])
    .map((key) => `${key} ${jamaat[key]}`)
    .join(", ");
}

/**
 * The one-tap confirmation, as a structured submission message.
 *
 * It restates the times the user was LOOKING AT when they tapped — a
 * confirmation is only evidence about what was shown, and if the dataset
 * changes between the tap and triage reading it, "confirmed whatever is
 * current" would be misinformation with a timestamp.
 */
export function buildConfirmationMessage(
  jamaat: JamaatTimes,
  now: Date,
): string {
  return (
    `[Jamaat confirmed] A user checked the jamaat times shown in the app ` +
    `on ${isoDate(now)} and marked them still correct. ` +
    `Times shown: ${timesShown(jamaat)}. ` +
    `(App data recorded ${jamaat.recordedOn}; source: ${jamaat.source}.)`
  );
}

/**
 * "Out of date", also one tap. Deliberately a separate marker from the
 * free-text edit flow: a pile of these against one place is a strong
 * refresh signal even if nobody ever types the new times.
 */
export function buildOutdatedMessage(jamaat: JamaatTimes, now: Date): string {
  return (
    `[Jamaat outdated] A user checked the jamaat times shown in the app ` +
    `on ${isoDate(now)} and marked them OUT OF DATE. ` +
    `Times shown: ${timesShown(jamaat)}. ` +
    `(App data recorded ${jamaat.recordedOn}; source: ${jamaat.source}.)`
  );
}

/**
 * Free-text contribution of new times, marked for triage. The provenance
 * the user picked arrives inside `message` already (SuggestionForm prefixes
 * selected topics as "[Masjid website] ..."), so the marker goes in front
 * of everything.
 */
export function buildTimesContributionMessage(message: string): string {
  return `[Jamaat times] ${message}`;
}

/**
 * Provenance choices for the "add the times" sheet. These ARE the triage
 * signal: a website or noticeboard reading can be adopted nearly verbatim,
 * while "I pray here" is honest but needs corroboration. Ordered from
 * strongest evidence to weakest so the strongest is the easiest to reach.
 */
export const JAMAAT_SOURCE_TOPICS = [
  "Masjid website or app",
  "Noticeboard at the masjid",
  "I pray here regularly",
  "Asked the masjid directly",
] as const;

/** AsyncStorage key holding the last local confirm date for one place. */
export function confirmStorageKey(placeId: string): string {
  return `jamaatConfirmed:${placeId}`;
}

/**
 * Whether the contribution controls make sense for a place at all.
 * Jumu'ah-only venues have no daily jamaat to record — asking for one
 * would invite well-meaning noise into the dataset.
 */
export function canContributeJamaat(place: Place): boolean {
  return !place.jumuahOnly;
}
