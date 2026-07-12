# Masjid & Prayer Space Locator — starter template

A deliberately tiny Expo (React Native + TypeScript) starter for iOS, Android **and** web from one codebase. It implements the smallest possible version of the MVP from the project plan:

- **One core screen**: nearest masjids & prayer spaces, sorted by distance, browsable with no account
- **Facility filters**: sisters' space, wudu, disabled access, parking, jumu'ah, janazah
- **Detail page**: address, facilities, jumu'ah times, notes, "last verified" + source, get-directions button
- **Calculated prayer times** for your location via the free AlAdhan API (no key needed)
- **Privacy by design**: location is used on-device only; no accounts, no tracking

Deliberately **not** included yet (add only once the basics feel right): map view, real jamaat times, suggest-an-edit, favourites, notifications, Ramadan mode.

## Run it on your phone (no Mac / app store needed)

1. Install [Node.js LTS](https://nodejs.org) on your computer.
2. Install the **Expo Go** app on your phone (App Store / Play Store).
3. In this folder, run:

    npm install
    npx expo start

4. Scan the QR code in the terminal with your phone (Camera app on iPhone, Expo Go on Android). The app opens in Expo Go.
5. For a browser version, press `w` in the terminal.

Every time you save a file, the app reloads instantly on your phone.

### Troubleshooting the QR code / connection

- **"Project is incompatible with this version of Expo Go"** — the project's Expo SDK must match the Expo Go app from the store. This template targets SDK 54. If Expo Go has moved on, run:

    npx expo install expo@latest
    npx expo install --fix

- **QR scans but nothing loads / times out** — your phone and computer must be on the **same Wi-Fi network** (phone not on mobile data, computer not on a VPN). If that's not possible (e.g. university/hospital/guest Wi-Fi blocks device-to-device traffic), use a tunnel instead:

    npm run tunnel

  (first run will install a small extra package; requires internet)

- **On Android**, scan the QR code from **inside the Expo Go app** (open Expo Go → "Scan QR code"), not just the camera app.

- **Version warnings** when running `npx expo start`:

    npx expo install --fix

## Project structure

    app/                  Screens (file-based routing via expo-router)
	_layout.tsx         Navigation shell + header styling
	index.tsx           Home: prayer times bar, filters, nearest-places list
	place/\[id\].tsx      Detail page for one place
    src/
	components/         PlaceCard (list row), FilterChips (filter bar)
	data/places.ts      SAMPLE seed data + the Place/facilities schema
	lib/distance.ts     Haversine distance + formatting
	lib/prayerTimes.ts  AlAdhan calculated times (fallback times)
	lib/theme.ts        Colours & spacing in one place

## How to experiment (add/remove things)

- **Add or edit places** — everything lives in `src/data/places.ts`. Copy an entry, change the fields, save. This file *is* the database for now; when it feels right, it moves to Supabase/Firebase unchanged (the `Place` type is the schema from the plan's data model).
- **Change the filters** — add/remove a key in `FacilityKey` + `FACILITY_LABELS` in `places.ts`; the chips and detail page update automatically.
- **Change prayer time calculation** — `src/lib/prayerTimes.ts` (`method`, `school` for Hanafi Asr).
- **Restyle** — `src/lib/theme.ts`.

## Sensible next steps (in order)

1. Live with the list for a week; tweak filters/data until the "10-second rule" holds.
2. Replace sample facility data with your first verified patch (your borough).
3. Add the map view (`react-native-maps` or MapLibre) behind a list/map toggle.
4. Add "suggest an edit" (a simple form posting to a Google Form or Supabase table starts the flywheel).
5. Move data out of `places.ts` into Supabase, keeping the same `Place` shape.

## Notes

- All facility data in `src/data/places.ts` is **sample/placeholder** — verify before real users see it.
- AlAdhan API: https://aladhan.com/prayer-times-api — free, no key. Cache later if usage grows.
- Jamaat times, scrapers, MAWAQIT etc. are Phase 3 in the project plan — resist the urge!