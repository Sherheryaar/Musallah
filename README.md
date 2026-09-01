# Masjid & Prayer Space Locator

An Expo (React Native + TypeScript) app for iOS and Android: find the nearest masjid or prayer space, check facilities, and see accurate prayer times — no account, no tracking. Covers 2,200+ places across the UK & Ireland (data from [MuslimsInBritain.org](https://muslimsinbritain.org), with permission).

## What's in the app

- **Map-first home screen**: every matching place pinned on a map, with a draggable bottom sheet listing the nearest places.
- **Area search**: type "Stratford" and press search — distances re-anchor to that area (on-device geocoding). Ambiguous names resolve to the hit nearest you, and hits outside the UK & Ireland are rejected. Typing also live-filters by name/address.
- **Facility filters**: sisters' space, wudu, disabled access, parking, jumu'ah, janazah — persisted across launches.
- **Place detail page**: get directions, call/website/social links, jumu'ah times, jamaat times next to calculated start times, facility checklist, verification status + source, and "suggest an edit".
- **Prayer times calculated on-device** (`src/lib/prayerCalc.ts` — no API): Moonsighting Committee (UK-appropriate) or Muslim World League, Asr at 1 or 2 mithl, and a Shafaq (Isha twilight) choice for the Moonsighting method. A dedicated prayer screen shows the full schedule with current/next prayer countdown, previous/next day navigation and the Hijri date.
- **Live data only, by design**: places load from Supabase (realtime updates + refresh when the app foregrounds) and are held in memory for the session — never cached to disk and never bundled into the app itself, so the manually-curated place list can't be lifted wholesale from an app-bundle extraction or a device backup. Offline (or before the first successful load), a dedicated screen says so and offers a retry, which also happens automatically every 10s while it's showing and whenever the app returns to the foreground. Prayer times and the Qibla screen don't need this data and work fully offline regardless.
- **Suggestions**: "suggest an edit" and "add a missing place" write to the Supabase `submissions` table; if that fails, a pre-filled email is opened instead, and the form says which one happened.
- **Community jamaat times**: on a place with jamaat times on record, "Are these times still right?" offers one-tap **Still right** / **Out of date** answers (at most once per place per month per device); on the 90%+ of places without times, "Know the jamaat times here? Add them" opens a form whose topic chips capture the source of the times (website, noticeboard, regular attendee...). Everything arrives in `submissions` with a scannable `[Jamaat ...]` marker — see [docs/jamaat-triage.md](docs/jamaat-triage.md) for the triage queries and how to apply times.
- **Privacy by design**: location never leaves the device; no accounts, no analytics. Suggestions are the only data ever sent.

## Run it on your phone (no Mac / app store needed)

1. Install [Node.js LTS](https://nodejs.org) on your computer.
2. Install the **Expo Go** app on your phone (App Store / Play Store).
3. In this folder, run:

    npm install
    npx expo start

4. Scan the QR code in the terminal with your phone (Camera app on iPhone, Expo Go on Android). The app opens in Expo Go.

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

Without them the app has no place data to show at all — see "Live data only" above, and the offline screen is exactly what an unconfigured install sees. The anon key is shipped inside the app bundle by design, so the Supabase project **must** have Row Level Security enabled: public read on `places`, insert-only on `submissions`.

A fresh Supabase project needs two tables and three policies, all created in the SQL editor: `places` (read by the app, written only by the pipeline's service key) with an `anon` **select** policy and no insert/update/delete policy; `submissions` (`kind`, `place_id`, `message`) with an `anon` **insert-only** policy and a `CHECK (length(message) <= 2000)` on `message`; and `places` added to the `supabase_realtime` publication so the app's live updates work. RLS must be enabled on both tables — without it the anon key in the bundle could write anything.

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
        PlacesMap.tsx        Map (react-native-maps)
        BottomSheet.tsx      Draggable sheet over the map
        FilterSheet.tsx      Facility filter modal
        PlaceCard.tsx        List row
        SuggestionForm.tsx   Suggest an edit / add a place
        OfflineScreen.tsx    Shown when there's no connection and no data yet
      context/
        PlacesContext.tsx    Data: Supabase only, in memory for the session
        SettingsContext.tsx  Preferences, persisted to AsyncStorage
      data/
        places.ts            Place schema + labels (no bundled data)
        places.json          Pipeline artifact only -- never imported by the app
        placesRepo.ts        Supabase fetch + row validation, no on-device cache
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
      sync-places.mjs        Snapshot the Supabase `places` table into src/data/places.json
      refresh-times.mjs      Daily jamaat/jumu'ah refresh (see Data pipeline below)
      gen-pin-assets.js      Regenerate map pin PNGs in assets/pins/
      gen-cluster-assets.js  Regenerate cluster bubble PNGs
      gen-app-icons.js       Regenerate the app, adaptive and notification icons

## Data pipeline

The Supabase `places` table is the source of truth, and the ONLY place the shipped app ever reads it from (see "Live data only" above). `src/data/places.json` is a pipeline artifact, not something the app ships with — it exists so the dataset is reviewable in a diff and the harvest/verify scripts have a snapshot to match against. Sync it from Supabase with:

    npm run sync:places

This fetches every row over the public read policy (anon key from `.env`), validates each one with the same rules the app enforces at runtime, and rewrites `src/data/places.json`. Re-run it before any harvest (a stale snapshot silently weakens matching), and commit the result for the record — nothing reads it at runtime, so there's no rush.

### Automatic prayer-time refresh (multi-source)

Jamaat and Jumu'ah times come from **each mosque's own published timetable**, refreshed **twice daily** by a scheduled GitHub Actions workflow (`.github/workflows/refresh-times.yml`). Daily rather than weekly because jamaat times track the sun — East London Mosque's Fajr jamā'ah moves about two minutes a day, so a weekly snapshot would be a quarter of an hour wrong by Sunday.

**No provider is privileged.** [Mawaqit](https://mawaqit.net) covers only a small fraction of the dataset and *none* of London's largest mosques are on it, so each place is registered to whichever system its own mosque publishes through. Current per-source counts are whatever `scripts/timetable-links.json` says — the prose here deliberately carries none.

| File | Role |
|---|---|
| `scripts/timetable-links.json` | the registry: which place uses which source |
| `scripts/timetable-sources.mjs` | one entry per provider |
| `scripts/lib/timetable.mjs` | pure parsing/normalising helpers — unit-tested |
| `scripts/refresh-times.mjs` | the orchestrator: fetch, diff, write |
| `scripts/discover-timetables.mjs` | sweeps mosque websites for timetables we can already read |
| `scripts/harvest-mawaqit.mjs` / `scripts/gen-mawaqit-links.mjs` | matches Mawaqit's directory against our places, then registers confident matches |
| `scripts/harvest-sirat.mjs` / `scripts/gen-sirat-links.mjs` | same, for the Sirat.uk directory |

Providers currently supported:

- **`mawaqit`** — Mawaqit's public search API. Reads each mosque's `iqama` entries, which are either clock times or `+N` offsets from the adhan (resolved against that mosque's own times).
- **`masjidbox`** — a `masjidbox.com/prayer-times/<slug>` or `masjidbox.net/<slug>` page; the embedded state carries a month of labelled iqamah times, with the rendered grid as a fallback.
- **`dated-table`** — the generic one: *any* mosque publishing a yearly or monthly HTML calendar (one row per date, columns named per prayer). East London Mosque is the first entry of this kind, not a special case. Registering another mosque is a registry row with a URL — **no new code**.
- **`daily-iqamah`** — the other generic shape: a page showing today only, one row per prayer with an Iqamah/Jamā'ah column. The parser insists today's date appears on the page before reading anything.
- **`sirat`** — [Sirat.uk](https://sirat.uk/mosques/developers)'s keyless UK mosque-times API (ODC-By 1.0 licensed). Unlike the others, this is a third-party directory rather than a platform mosques publish to directly, so it is used ONLY to fill places that had no other source at all, matched by `scripts/harvest-sirat.mjs` on distance plus name-token or full-postcode agreement (see `scripts/lib/identity.mjs` for why the postcode). It never overrides a place already registered to a mosque-published source.

`scripts/discover-timetables.mjs` finds candidates for `masjidbox`/`dated-table` automatically: it probes each place's own website, fingerprints known platforms, and — for dated tables — actually parses today's row, reporting only what really yields times. It writes ready-to-paste registry entries for a human to approve; nothing is auto-registered, because a mis-registered source would show another mosque's prayer times.

`scripts/harvest-mawaqit.mjs` and `scripts/harvest-sirat.mjs` do the equivalent for those two directories by matching coordinates and names instead of probing a website, and write a report (which matches, how far apart, whether the names agree) to review BEFORE running `scripts/gen-mawaqit-links.mjs` / `scripts/gen-sirat-links.mjs`, which write only the name-agreeing matches into the registry. Proximity-only and ambiguous matches are left out of both the report's "ready" bucket and the generated registry — read the report and add those by hand only after confirming each is the right mosque.

Adding a provider means adding a source entry plus registry rows; the orchestrator needs no changes. Every source must be credited in the app's About screen.

**App size is unaffected by any of this.** The pipeline lives in `scripts/`, which Metro never bundles, and — unlike before this app moved to live-data-only — none of its output reaches the app bundle either: jamaat/Jumu'ah times, like every other field, are read live from Supabase at runtime, never shipped as a static asset.

Safety rules, each because the failure it prevents is worse than a stale time:

- identity is the id/uuid captured at link time, never proximity;
- a closed mosque, an unreadable page, or a changed layout is **reported**, never guessed at and never silently cleared (ELM's columns are located by header name, so a reordered table errors instead of putting Maghrib's time in Isha's slot);
- a source that stops publishing keeps whatever we already had;
- only rows whose times actually changed are written, and each carries its source name and the date recorded, which the app displays.

Dry-run locally (reads only, no service key needed): `npm run refresh:times` — add `--source mawaqit` / `--source eastlondonmosque` and `--limit N` to narrow it.

The workflow needs four repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (writes — RLS blocks public writes by design; this key must exist **only** as a CI secret, never in the repo or the app), and `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the sync step. It can also be run on demand from the Actions tab ("Run workflow"). The pipeline snapshot `src/data/places.json` is re-synced and committed on **Mondays** (and on manual runs) rather than daily — committing a 1 MB file every day would bury the history for no benefit, since the app reads live from Supabase and only the harvest scripts read the snapshot.

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

**iOS** — Apple allows no APK equivalent. Installing on someone's iPhone requires the [Apple Developer Program](https://developer.apple.com/programs/) (£79/year), then either **TestFlight** (`eas build -p ios`, `eas submit -p ios`, invite testers by email — best experience) or ad-hoc builds registered to specific device UDIDs (`eas device:create`). Until then, iPhone testers can use Expo Go.

The `preview` profile builds an installable APK; `production` builds the store formats (AAB / signed IPA) with auto-incrementing build numbers.

## Notes

- Facilities come from the source directory and are not all field-verified — the `confidence` tier and the "hide unconfirmed places" filter exist for exactly that reason.
- Jamaat times change seasonally; the detail page shows the source and date they were recorded so stale data is visible.
- Prayer times are calculated, not scraped — a masjid's own timetable always wins where they differ.
