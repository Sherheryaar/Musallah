# Masjid & Prayer Space Locator

An Expo (React Native + TypeScript) app for iOS, Android **and** web from one codebase: find the nearest masjid or prayer space, check facilities, and see accurate prayer times — no account, no tracking. Covers 2,200+ places across the UK & Ireland (data from [MuslimsInBritain.org](https://muslimsinbritain.org), with permission).

## What's in the app

- **Map-first home screen** (iOS/Android): every matching place pinned on a map, with a draggable bottom sheet listing the nearest places. Web falls back to a list-only layout.
- **Area search**: type "Stratford" and press search — distances re-anchor to that area (on-device geocoding). Ambiguous names resolve to the hit nearest you, and hits outside the UK & Ireland are rejected. Typing also live-filters by name/address, which is what web uses (no geocoder there).
- **Facility filters**: sisters' space, wudu, disabled access, parking, jumu'ah, janazah — persisted across launches.
- **Place detail page**: get directions, call/website/social links, jumu'ah times, jamaat times next to calculated start times, facility checklist, verification status + source, and "suggest an edit".
- **Prayer times calculated on-device** (`src/lib/prayerCalc.ts` — no API): Moonsighting Committee (UK-appropriate) or Muslim World League, Asr at 1 or 2 mithl, and a Shafaq (Isha twilight) choice for the Moonsighting method. A dedicated prayer screen shows the full schedule with current/next prayer countdown, previous/next day navigation and the Hijri date.
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

To set up a fresh Supabase project, run `scripts/schema.sql` in the SQL editor — it creates both tables **with the RLS policies the security model depends on** (plus a length cap on submissions and the realtime publication), then seed data with `scripts/seed-places.sql`.

## Development

    npm test           # unit tests (prayer calculation goldens, Hijri, distance)
    npm run typecheck  # strict TypeScript, no emit

The prayer-time tests pin golden values that were cross-checked against published ephemeris data and the adhan library's Moonsighting tables — if one fails after a change to `prayerCalc.ts`, the astronomy moved and that must be deliberate.

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
        geo.ts               Fallback location + coverage bounding box
        feedback.ts          Submissions: Supabase with email fallback
        supabase.ts          Shared client (null when unconfigured)
        theme.ts             Colours, spacing, radii
        *.test.ts            Unit tests (vitest)
    scripts/
      schema.sql             Create tables + RLS policies (run first, once)
      csv-to-places.mjs      Rebuild src/data/places.json from a CSV export
      gen-pin-assets.js      Regenerate map pin PNGs in assets/pins/
      seed-places.sql        Seed/reset the Supabase `places` table

## Data pipeline

The Supabase `places` table is the source of truth. The bundled offline dataset (`src/data/places.json`) is synced from it directly:

    npm run sync:places

This fetches every row over the public read policy (anon key from `.env`), validates each one with the same rules the app enforces at runtime, and rewrites `src/data/places.json`. Re-run it whenever the database changes meaningfully, and commit the result — it's what offline and unconfigured installs see.

(`npm run build:places` still exists for the older CSV-export route: dashboard → export `places` as CSV → save as `data/places.csv` → run it.)

### Automatic Jumu'ah time refresh (Mawaqit)

Jumu'ah times for ~130 places come from [Mawaqit](https://mawaqit.net) (mosque-published, used with their permission, credited in the app). Because mosques shift Jumu'ah with the seasons, a scheduled GitHub Actions workflow (`.github/workflows/refresh-jummah.yml`) re-checks every linked mosque **weekly**, updates Supabase where the published time changed, re-runs `sync:places`, and commits the result (which redeploys the web app; native apps get the change live from Supabase).

- The link table is `scripts/mawaqit-links.json` — only name-agreeing matches from the original harvest (`scripts/harvest-mawaqit.mjs`); regenerate with `scripts/gen-mawaqit-links.mjs` after a new harvest.
- Identity is the Mawaqit uuid, never proximity. Closed or silent mosques are reported, not auto-cleared.
- Dry-run locally (reads only, no service key needed): `npm run refresh:jummah`
- The workflow needs four repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (writes — RLS blocks public writes by design; this key must exist **only** as a CI secret, never in the repo or the app), and `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the sync step. It can also be run on demand from the Actions tab ("Run workflow").

## Shareable builds for testers (EAS)

Builds run in Expo's cloud — no Android Studio, no Xcode, no Mac. One-time setup:

1. Create a free account at [expo.dev](https://expo.dev).
2. `npm install -g eas-cli`, then `eas login`.
3. **Android map key** (without it the map is a grey box in standalone builds — Expo Go ships its own key, real builds don't): create a [Google Cloud](https://console.cloud.google.com) project, enable **Maps SDK for Android**, create an API key, then store it where builds can see it:

       eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <the-key> --environment preview
       eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <the-key> --environment production

   (`app.config.js` injects it at build time; the key never lives in the repo.)

**Android APK** — shareable with anyone:

    eas build --platform android --profile preview

First run asks to generate a keystore — say yes (EAS stores it). ~15 minutes later you get a download link; send it to testers, they open it on the phone and install (Android prompts to allow installs from the browser). That's it.

**iOS** — Apple allows no APK equivalent. Installing on someone's iPhone requires the [Apple Developer Program](https://developer.apple.com/programs/) (£79/year), then either **TestFlight** (`eas build -p ios`, `eas submit -p ios`, invite testers by email — best experience) or ad-hoc builds registered to specific device UDIDs (`eas device:create`). Until then, iPhone testers can use Expo Go or the web app.

The `preview` profile builds an installable APK; `production` builds the store formats (AAB / signed IPA) with auto-incrementing build numbers.

## Deploying the web app

The web build is a single-page app, installable as a PWA (manifest + icons in `public/`; `scripts/postbuild-web.mjs` injects the head tags after export, because SPA output ignores `+html.tsx`).

    npm run build:web    # writes the site to dist/

**Netlify** (config already in `netlify.toml`):

1. [app.netlify.com](https://app.netlify.com) → Add new site → Import an existing project → pick this GitHub repo.
2. Build settings are read from `netlify.toml` automatically (command `npx expo export --platform web`, publish directory `dist`).
3. Site settings → Environment variables → add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the same values as your local `.env` — the anon key is public by design).
4. Deploy. Every push to `main` redeploys automatically.

Or without linking the repo: `npm run build:web`, then drag the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop) (env vars come from your local `.env` in that case).

## Notes

- Current place data is a **small seed set** — verify facilities (especially sisters' space and access) before real users rely on them.
- Jamaat times change seasonally; the detail page shows the source and date they were recorded so stale data is visible.
- Prayer times are calculated, not scraped — a masjid's own timetable always wins where they differ.
