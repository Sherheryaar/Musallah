import { Linking } from "react-native";

import { Place } from "@/data/places";
import { buildTimesContributionMessage } from "@/lib/jamaatContribution";
import { supabase } from "@/lib/supabase";

const FEEDBACK_EMAIL = "sheheryaarb@hotmail.com";

/**
 * Hard cap on suggestion length, enforced three times over: maxLength on
 * the TextInput, this slice before insert, and a CHECK constraint on the
 * table (scripts/schema.sql) — the anon key is public, so the database
 * must not accept unbounded payloads from anyone who extracts it.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * How a suggestion was (or wasn't) delivered:
 * - "stored": saved to the Supabase `submissions` table.
 * - "email":  database unreachable; the user's email app was opened with a
 *             pre-filled draft instead.
 * - "failed": nothing worked (offline and no email app) -- the UI must tell
 *             the user so the suggestion isn't silently lost.
 */
export type SubmissionResult = "stored" | "email" | "failed";

/**
 * A hung request (flaky network, captive portal) must not leave the send
 * button stuck on its spinner forever — this is what actually bounds
 * `storeSubmission`, so a caller's `finally` always runs within this long.
 */
const SUBMIT_TIMEOUT_MS = 8000;

/**
 * `.trim()` strips whitespace but not zero-width FORMAT characters (Unicode
 * Cf, e.g. U+200B) — without this, a message made only of those reads as
 * non-empty here even though it's visually blank, and gets submitted.
 */
function cleanMessage(message: string): string {
  return message.replace(/\p{Cf}/gu, "").trim();
}

async function openFeedbackEmail(
  subject: string,
  body: string,
): Promise<boolean> {
  const url =
    "mailto:" +
    FEEDBACK_EMAIL +
    "?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body);
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // No email client available (common on tablets/emulators).
    return false;
  }
}

async function storeSubmission(
  kind: "edit" | "new_place",
  placeId: string | null,
  message: string,
): Promise<boolean> {
  if (!supabase) return false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const { error } = await supabase
      .from("submissions")
      .insert({
        kind,
        place_id: placeId,
        message,
      })
      .abortSignal(controller.signal);
    return !error;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function submitEditSuggestion(
  place: Place,
  message: string,
): Promise<SubmissionResult> {
  const trimmed = cleanMessage(message).slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return "failed";

  if (await storeSubmission("edit", place.id, trimmed)) return "stored";

  const body =
    "Place: " +
    place.name +
    "\n" +
    "ID: " +
    place.id +
    "\n" +
    "What needs correcting (times, facilities, address...)?\n" +
    "\n" +
    trimmed;
  return (await openFeedbackEmail("Edit suggestion: " + place.name, body))
    ? "email"
    : "failed";
}

export async function submitNewPlaceSuggestion(
  message: string,
): Promise<SubmissionResult> {
  const trimmed = cleanMessage(message).slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return "failed";

  if (await storeSubmission("new_place", null, trimmed)) return "stored";

  return (await openFeedbackEmail("New place suggestion", trimmed))
    ? "email"
    : "failed";
}

/**
 * One-tap jamaat check-in ("still right" / "out of date"). The message is
 * pre-built by src/lib/jamaatContribution.ts and rides the same `edit`
 * submission kind the free-text flow uses — the marker prefix is what
 * distinguishes it at triage.
 *
 * Deliberately NO email fallback: this is a zero-effort tap, and bouncing
 * the user into a mail client to "finish" it would cost more than the
 * signal is worth. Offline, it simply reports failure and the UI says so.
 */
export async function submitJamaatCheck(
  place: Place,
  message: string,
): Promise<SubmissionResult> {
  const trimmed = cleanMessage(message).slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return "failed";
  return (await storeSubmission("edit", place.id, trimmed))
    ? "stored"
    : "failed";
}

/**
 * Typed-in jamaat times for a place that has none (or whose times need
 * replacing). Same shape as submitEditSuggestion — including the email
 * fallback, because here the user HAS typed something worth saving — but
 * marked so triage can pull every timetable contribution in one search.
 */
export async function submitJamaatTimes(
  place: Place,
  message: string,
): Promise<SubmissionResult> {
  const trimmed = cleanMessage(message).slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return "failed";
  const marked = buildTimesContributionMessage(trimmed).slice(
    0,
    MAX_MESSAGE_LENGTH,
  );

  if (await storeSubmission("edit", place.id, marked)) return "stored";

  const body =
    "Place: " + place.name + "\n" + "ID: " + place.id + "\n\n" + marked;
  return (await openFeedbackEmail("Jamaat times: " + place.name, body))
    ? "email"
    : "failed";
}
