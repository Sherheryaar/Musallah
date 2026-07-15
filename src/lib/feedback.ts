import { Linking } from "react-native";

import { Place } from "@/data/places";

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

export function suggestEdit(place: Place): void {
  const body =
    "Place: " +
    place.name +
    "\n" +
    "ID: " +
    place.id +
    "\n" +
    "What needs correcting (times, facilities, address...)?\n" +
    "\n";
  openFeedbackEmail("Edit suggestion: " + place.name, body);
}

export function suggestNewPlace(): void {
  const body =
    "Name:\n" +
    "\n" +
    "Address:\n" +
    "\n" +
    "Type (masjid / prayer room / multi-faith room):\n" +
    "\n" +
    "Facilities you know (sisters' space, wudu, disabled access, parking, jumu'ah, janazah):\n" +
    "\n" +
    "Link if you have one (website, Facebook, Instagram, Google Maps):\n" +
    "\n";
  openFeedbackEmail("New place suggestion", body);
}
