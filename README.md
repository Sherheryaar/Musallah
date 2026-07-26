# Masjid & Prayer Space Locator

An Expo (React Native + TypeScript) app for iOS, Android **and** web from one codebase: find the nearest masjid or prayer space in London, check facilities, and see accurate prayer times — no account, no tracking.

## What's in the app

- **Map-first home screen** (iOS/Android): every matching place pinned on a map, with a draggable bottom sheet listing the nearest places. Web falls back to a list-only layout.
- **Area search**: type "Stratford" and press search — distances re-anchor to that area (on-device geocoding). Typing also live-filters by name/address, which is what web uses (no geocoder there).
- **Facility filters**: sisters' space, wudu, disabled access, parking, jumu'ah, janazah — persisted across launches.
- **Place detail page**: get directions, call/website/social links, jumu'ah times, jamaat times next to calculated start times, facility checklist, verification status + source, and "suggest an edit".
- **Prayer times calculated on-device** (`src/lib/prayerCalc.ts` — no API): Moonsighting Committee (UK-appropriate) or Muslim World League, Asr at 1 or 2 mithl. A dedicated prayer screen shows the full schedule with current/next prayer countdown, previous/next day navigation and the Hijri date.
- **Live data with offline fallback**: places load from Supabase (realtime updates + refresh when the app foregrounds), are cached on-device, and fall back to the bundled dataset in `src/data/places.json` when offline or unconfigured.
- **Suggestions**: "suggest an edit" and "add a missing place" write to the Supabase `submissions` table; if that fails, a pre-filled email is opened instead, and the form says which one happened.
- **Privacy by design**: location never leaves the device; no accounts, no analytics. Suggestions are the only data ever sent.

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

- **"Project is incompatible with this version of Expo Go"** — the project's Expo SDK must match the Expo Go app from the store. This project targets SDK 54. If Expo Go has moved on, run:

    npx expo install expo@latest
    npx expo install --fix

- **QR scans but nothing loads / times out** — your phone and computer must be on the **same Wi-Fi network** (phone not on mobile data, computer not on a VPN). If that's not possible (e.g. university/hospital/guest Wi-Fi blocks device-to-device traffic), use a tunnel instead:

    npm run tunnel

- **On Android**, scan the QR code from **inside the Expo Go app** (open Expo Go → "Scan QR code"), not just the camera app.

- **Version warnings** when running `npx expo start`:

    npx expo install --fix

## Configuration

Supabase credentials live in `.env` (gitignored):

    EXPO_PUBLIC_SUPABASE_URL=...
    EXPO_PUBLIC_SUPABASE_ANON_KEY=...

Without them the app still runs fully, using the bundled dataset. The anon key is shipped inside the app bundle by design, so the Supabase project **must** have Row Level Security enabled: public read on `places`, insert-only on `submissions`.

## Project structure

    app/                     Screens (file-based routing via expo-router)
      _layout.tsx            Navigation shell + header styling
      index.tsx              Home: map, search, filters, bottom sheet, times bar
      place/[id].tsx         Detail page for one place
      prayer.tsx             Full prayer schedule + countdown + Hijri date
      settings.tsx           Calculation method, Asr mithl, privacy notes
    src/
      components/
        PlacesMap.native.tsx / .tsx   Map (react-native-maps) + web fallback
        BottomSheet.tsx      Draggable sheet over the map
        FilterSheet.tsx      Facility filter modal
        PlaceCard.tsx        List row
        SuggestionForm.tsx   Suggest an edit / add a place
      context/
        PlacesContext.tsx    Data: Supabase -> cache -> bundled fallback
        SettingsContext.tsx  Preferences, persisted to AsyncStorage
      data/
        places.ts            Place schema + labels; bundled data re-export
        places.json          Bundled offline dataset (generated -- see below)
        placesRepo.ts        Supabase fetch, row validation, on-device cache
      lib/
        prayerCalc.ts        On-device solar prayer-time calculation
        prayerTimes.ts       Display helpers over prayerCalc
        hijri.ts             Tabular Hijri date conversion
        distance.ts          Haversine distance + formatting
        feedback.ts          Submissions: Supabase with email fallback
        supabase.ts          Shared client (null when unconfigured)
        theme.ts             Colours, spacing, radii
    scripts/
      csv-to-places.mjs      Rebuild src/data/places.json from a CSV export
      gen-pin-assets.js      Regenerate map pin PNGs in assets/pins/
      seed-places.sql        Seed/reset the Supabase `places` table

## Data pipeline

The Supabase `places` table is the source of truth (`scripts/seed-places.sql` seeds it). The bundled offline dataset is generated from it:

1. Supabase Dashboard → Table Editor → `places` → Export data → CSV
2. Save it as `data/places.csv`
3. Run:

    npm run build:places

This validates the rows and rewrites `src/data/places.json`. Commit both files together.

## Notes

- Current place data is a **small seed set** — verify facilities (especially sisters' space and access) before real users rely on them.
- Jamaat times change seasonally; the detail page shows the source and date they were recorded so stale data is visible.
- Prayer times are calculated, not scraped — a masjid's own timetable always wins where they differ.
