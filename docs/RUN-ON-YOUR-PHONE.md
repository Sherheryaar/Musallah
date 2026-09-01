# Getting Masjid Locator onto your phone

Two ways to do this. Read the first section to pick, then follow one path.

## Which one do you want?

**You said: "so I don't have to run a tunnel, but I can just open the app whenever I want."**

That is the **preview APK** (Path A). It is a real, self-contained app — you tap
the icon and it opens, no laptop, no Metro, no tunnel, no expiry.

Expo's dev client (Path B) does **not** do that. A development build still needs
`npx expo start` running on your machine to serve the JavaScript; open it with
the laptop off and you get a connection error. It is a developer tool for fast
reloading, not a way to carry the app around.

So: **Path A for trialling the app. Path B only if you want live-reload in a
standalone binary.** For day-to-day iteration Expo Go over USB (`adb reverse
tcp:8081 tcp:8081`, then `npx expo start`) runs everything in this project,
map included, and needs neither a tunnel nor a build.

---

# Path A — Preview APK (recommended)

Produces `masjid-locator.apk`, installable and permanent.

## What you need first

- A free Expo account — https://expo.dev/signup
- Your phone set to allow installing APKs (Android asks when you first try)
- A Google Maps Android API key (see step 4 — the map is grey without it)

## 1. Log in to EAS

```bash
npx eas-cli login
```

## 2. Link the project

This repo has no EAS project ID yet, so run this once. It adds
`extra.eas.projectId` to `app.json` — commit that change.

```bash
npx eas-cli init
```

## 3. Give the build your Supabase details

`.env` is gitignored and **is not uploaded to EAS**, so the cloud builder can't
see it. Without these the app still runs, but only on the places bundled into
the app at build time — no live updates, no new submissions.

Copy the two values out of your local `.env`, then:

```bash
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value <the-url> --environment preview --visibility plaintext
```

```bash
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <the-anon-key> --environment preview --visibility plaintext
```

Plaintext is correct here — the anon key ships inside the app bundle by design,
and RLS is what actually protects the database. The service key must never go
anywhere near this.

## 4. Give the build the Maps key

Without this you get a **blank grey rectangle** where the map should be.
Everything else — list, search, distances, prayer times, place details — works
fine, so you can skip this and still trial most of the app.

If you don't have a key yet:

1. https://console.cloud.google.com → create a project
2. **APIs & Services → Library →** enable **Maps SDK for Android**
3. **Credentials → Create credentials → API key**
4. Restrict it: **Application restrictions → Android apps**, package name
   `com.sheheryaarbaber.masjidlocator` (see step 5 for the fingerprint)

Then:

```bash
npx eas-cli env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <the-key> --environment preview --visibility secret
```

[app.config.js](../app.config.js) picks it up automatically at build time.

## 5. The bit that catches everyone

If you restricted the key by Android app, Google needs the **SHA-1 of the
certificate EAS signs with** — not your local debug keystore. Get it:

```bash
npx eas-cli credentials
```

Choose Android → production keystore → it prints the SHA-1 fingerprint. Paste
that into the key's Android restrictions in Google Cloud Console alongside the
package name.

**Symptom if you skip this:** the app runs perfectly and only the map is grey.
It looks like a code bug. It isn't.

## 6. Build it

```bash
npx eas-cli build --profile preview --platform android
```

The `preview` profile in [eas.json](../eas.json) is already set to
`"buildType": "apk"` — that's the sideloadable format. Don't use `production`;
it makes an `.aab` for the Play Store, which a phone cannot install directly.

Takes roughly 10–20 minutes on the free tier (there's a queue). You can close
the terminal — it builds in the cloud.

## 7. Install it

When it finishes you get a URL and a QR code. On your phone:

- Open the link, download the `.apk`
- Android will warn about installing from an unknown source — allow it for your
  browser, then install
- The app appears in your launcher like any other

## Updating it later

Rebuild and reinstall (repeat step 6). If reinstalling gets tedious, EAS Update
can push JavaScript-only changes over the air to an installed build — worth
setting up once you're iterating on the UI.

---

# Path B — Development build (live reload on device)

Only if you want code changes to appear on the phone as you type. Still needs
your laptop running.

```bash
npx eas-cli build --profile development --platform android
```

Install that APK, then whenever you want to work:

```bash
npx expo start --dev-client
```

Phone and laptop on the same Wi-Fi means no tunnel needed — the tunnel is only
for when they're on different networks. If your Wi-Fi blocks device-to-device
traffic (common on university and office networks), use `--tunnel`.

---

## Notes

- **iOS** needs none of the Maps setup — it uses Apple Maps. But installing on a
  physical iPhone needs an Apple Developer account (£79/year), so Android is the
  cheap way to trial.
- **Building locally** instead of on EAS isn't practical here: `eas build
  --local` doesn't run on Windows, and `npx expo run:android` needs the full
  Android SDK and JDK installed.
- **Working in a git worktree?** `.env` is gitignored, so a fresh worktree won't
  have it — copy it across from the main checkout or the app will find no
  Supabase config.
