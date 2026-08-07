#!/usr/bin/env node
// Refreshes JAMAAT and JUMU'AH times in Supabase from each mosque's own
// published timetable.
//
//   node scripts/refresh-times.mjs [--dry-run] [--source NAME] [--limit N]
//
// Runs daily in CI (.github/workflows/refresh-jummah.yml). Replaces the
// earlier Jumu'ah-only script.
//
// WHY DAILY: jamaat times move with the sun. ELM's Fajr jamā'ah shifts about
// two minutes a day; a weekly snapshot would be a quarter of an hour wrong
// by Sunday. Jumu'ah is stable for months, so it is simply re-checked at the
// same time.
//
// WHY MULTI-SOURCE: no provider covers the dataset (see
// scripts/timetable-sources.mjs). Each place is registered to whichever
// system its own mosque publishes through, in scripts/timetable-links.json.
//
// Environment (process.env first, then .env in the repo root):
//   SUPABASE_URL              or EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY         or EXPO_PUBLIC_SUPABASE_ANON_KEY   (reads)
//   SUPABASE_SERVICE_ROLE_KEY (writes — RLS allows no public writes, by
//                              design; CI secret only, never in the repo)
//
// SAFETY RULES, each because the failure it prevents is worse than a stale
// time:
//   * identity is the id/uuid captured at link time, never proximity
//   * a closed mosque, an unreadable page, or a layout change is REPORTED —
//     never guessed at, never silently cleared
//   * a source that stops publishing keeps whatever we already had
//   * only rows whose times actually changed are written
//   * every written row carries the source name and today's date, so the
//     app can show "published by X, recorded today"

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { JAMAAT_KEYS, sameJamaat } from "./lib/timetable.mjs";
import { SOURCES } from "./timetable-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY_SOURCE = flag("--source");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;

// --- environment ------------------------------------------------------------
const dotenv = {};
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) dotenv[m[1]] = m[2].trim();
  }
}
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  dotenv.SUPABASE_URL ||
  dotenv.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  dotenv.SUPABASE_ANON_KEY ||
  dotenv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing Supabase URL / anon key (env or .env).");
  process.exit(1);
}
if (!DRY_RUN && !SERVICE_KEY) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is required to write (or pass --dry-run).",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

// --- registry ---------------------------------------------------------------
const links = JSON.parse(
  readFileSync(join(root, "scripts", "timetable-links.json"), "utf8"),
).filter((l) => !ONLY_SOURCE || l.source === ONLY_SOURCE);

const unknown = links.filter((l) => !SOURCES[l.source]);
if (unknown.length) {
  console.error(
    `Unknown source(s) in registry: ${[...new Set(unknown.map((l) => l.source))].join(", ")}`,
  );
  process.exit(1);
}

// --- current state ----------------------------------------------------------
const current = new Map(); // placeId -> { jamaat, jumuah }
for (let i = 0; i < links.length; i += 50) {
  const ids = links
    .slice(i, i + 50)
    .map((l) => `"${l.placeId}"`)
    .join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/places?select=id,jamaat,jumuah_times&id=in.(${encodeURIComponent(ids)})`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
  );
  if (!res.ok) {
    console.error(`Supabase read failed: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  for (const row of await res.json()) {
    current.set(row.id, {
      jamaat: row.jamaat ?? null,
      jumuah: Array.isArray(row.jumuah_times)
        ? row.jumuah_times.filter((t) => typeof t === "string").sort()
        : [],
    });
  }
}
const orphans = links.filter((l) => !current.has(l.placeId));
if (orphans.length) {
  console.warn(`${orphans.length} registered place(s) not in Supabase:`);
  for (const l of orphans) console.warn(`  - ${l.placeId}`);
}

// --- fetch, per source ------------------------------------------------------
const fetched = new Map(); // placeId -> { jamaat?, jumuah?, closed?, skipped? }
const problems = [];

for (const [sourceId, source] of Object.entries(SOURCES)) {
  const mine = links.filter(
    (l) => l.source === sourceId && current.has(l.placeId),
  );
  if (mine.length === 0) continue;

  const batches = source.plan(mine).slice(0, LIMIT);
  console.log(
    `${source.label}: ${mine.length} place(s) in ${batches.length} request(s).`,
  );

  let consecutiveLimits = 0;
  for (const batch of batches) {
    const { results, error, rateLimited } = await batch.run();
    if (error || rateLimited) {
      problems.push(
        `${source.label} ${batch.key}: ${error ?? "rate limited"}`,
      );
      consecutiveLimits = rateLimited ? consecutiveLimits + 1 : 0;
      if (consecutiveLimits >= 5) {
        problems.push(
          `${source.label}: rate limit persists — stopped early, tomorrow's run catches up`,
        );
        break;
      }
    } else {
      consecutiveLimits = 0;
      for (const [placeId, value] of results) fetched.set(placeId, value);
    }
    await sleep(source.throttleMs);
  }
}

// --- diff -------------------------------------------------------------------
const updates = []; // { link, patch, summary }
const stats = {
  unchanged: 0,
  closed: 0,
  notSeen: 0,
  partial: 0,
};

for (const link of links) {
  if (!current.has(link.placeId)) continue;
  const got = fetched.get(link.placeId);
  if (!got) {
    stats.notSeen++;
    continue;
  }
  if (got.closed) {
    stats.closed++;
    problems.push(`${link.placeId}: flagged CLOSED by ${link.source} (untouched)`);
    continue;
  }
  if (got.skipped?.length) stats.partial++;

  const have = current.get(link.placeId);
  const patch = {};
  const summary = [];

  if (got.jamaat) {
    // A source that returns SOME but not all prayers today (one time
    // failed to parse, `skipped` above) must not erase the others: the
    // write below replaces the whole jsonb column, so start from what we
    // already had and only override the keys the source actually gave us.
    // This is what "a source going quiet on a prayer keeps the old value"
    // (see file header) actually requires -- comparing against `got.jamaat`
    // alone was letting a partial fetch delete previously-good times.
    const merged = {};
    for (const key of JAMAAT_KEYS) {
      merged[key] = got.jamaat[key] ?? have.jamaat?.[key];
    }
    // Generic sources (a mosque's own dated table) carry their credit on the
    // registry row, since it names that mosque's site.
    const next = {
      ...merged,
      source: link.credit ?? SOURCES[link.source].credit,
      recordedOn: today,
    };
    // Compare only the times: source/recordedOn always differ by date.
    if (!sameJamaat(have.jamaat, merged)) {
      patch.jamaat = next;
      summary.push("jamaat");
    } else if (have.jamaat?.recordedOn !== today) {
      // Same times, but stamp today's date so the app can say how fresh
      // they are without implying a change happened.
      patch.jamaat = next;
    }
  }

  if (got.jumuah?.length) {
    const sorted = [...got.jumuah].sort();
    if (
      sorted.length !== have.jumuah.length ||
      sorted.some((t, i) => t !== have.jumuah[i])
    ) {
      patch.jumuah_times = sorted;
      summary.push(`jumuah ${have.jumuah.join(",") || "—"} -> ${sorted.join(",")}`);
    }
  }

  if (Object.keys(patch).length === 0) {
    stats.unchanged++;
    continue;
  }
  updates.push({ link, patch, summary });
}

// --- write ------------------------------------------------------------------
let written = 0;
let writeFailures = 0;
for (const { link, patch, summary } of updates) {
  if (summary.length > 0) {
    console.log(`  ${link.placeId}: ${summary.join("; ")}`);
  }
  if (DRY_RUN) continue;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/places?id=eq.${encodeURIComponent(link.placeId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );
  if (res.ok) {
    written++;
  } else {
    writeFailures++;
    console.error(
      `  WRITE FAILED ${link.placeId}: HTTP ${res.status} ${await res.text()}`,
    );
  }
}

console.log(`
Summary${DRY_RUN ? " (dry run — nothing written)" : ""}:
  ${links.length} registered place(s) across ${new Set(links.map((l) => l.source)).size} source(s)
  ${updates.length} row(s) with changes${DRY_RUN ? "" : `, ${written} written`}
  ${stats.unchanged} already current
  ${stats.partial} place(s) where some prayers could not be resolved
  ${stats.closed} flagged closed (untouched)
  ${stats.notSeen} not returned by their source this run
  ${problems.length} problem(s)${writeFailures ? `, ${writeFailures} write failure(s)` : ""}`);
for (const p of problems.slice(0, 40)) console.log(`  ! ${p}`);
if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);

process.exit(writeFailures > 0 ? 1 : 0);
