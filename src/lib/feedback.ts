import { Linking } from "react-native";

import { Place } from "@/data/places";
import { supabase } from "@/lib/supabase";

const FEEDBACK_EMAIL = "sheheryaarb@hotmail.com";

function openFeedbackEmail(subject: string, body: string): void {
  const url =
    "mailto:" +
    FEEDBACK_EMAIL +
    "?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body);
  Linking.openURL(url).catch(() => {});
}

/** Returns true when stored in Supabase, false when falling back to email. */
export async function submitEditSuggestion(
  place: Place,
  message: string,
): Promise<boolean> {
  const trimmed = message.trim();
  if (!trimmed) return false;

  if (supabase) {
    try {
      const { error } = await supabase.from("submissions").insert({
        kind: "edit",
        place_id: place.id,
        message: trimmed,
      });
      if (!error) return true;
    } catch {
      // Fall through to email.
    }
  }

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
  openFeedbackEmail("Edit suggestion: " + place.name, body);
  return false;
}

/** Returns true when stored in Supabase, false when falling back to email. */
export async function submitNewPlaceSuggestion(message: string): Promise<boolean> {
  const trimmed = message.trim();
  if (!trimmed) return false;

  if (supabase) {
    try {
      const { error } = await supabase.from("submissions").insert({
        kind: "new_place",
        place_id: null,
        message: trimmed,
      });
      if (!error) return true;
    } catch {
      // Fall through to email.
    }
  }

  openFeedbackEmail("New place suggestion", trimmed);
  return false;
}
