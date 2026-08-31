// One icon vocabulary for the whole app (MaterialCommunityIcons ships
// inside the expo package — no extra dependency). Keeping the mappings
// here means the list card, detail page, and filters can never drift
// into using different symbols for the same concept.
//
// The IconName type is checked against the real glyph map, so a typo'd
// icon name is a compile error, not a "?" box at runtime.

// Deep import, not the "@expo/vector-icons" barrel: the barrel drags all
// 21 icon families (and their fonts) into Metro's module graph; this pulls
// exactly the one family the app uses.
import type MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { FacilityKey, PlaceType } from "@/data/places";

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const FACILITY_ICONS: Record<FacilityKey, IconName> = {
  sistersSpace: "human-female",
  wudu: "water",
  disabledAccess: "wheelchair-accessibility",
  parking: "parking",
  jumuah: "account-group",
  janazah: "flower",
};

export const PLACE_TYPE_ICONS: Record<PlaceType, IconName> = {
  masjid: "mosque",
  musalla: "rug",
  multi_faith_room: "door",
};
