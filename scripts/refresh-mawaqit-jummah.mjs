#!/usr/bin/env node
// Re-checks every Mawaqit-linked place and updates its Jumu'ah time in
// Supabase when the mosque has changed it (times shift with the seasons —
// UK mosques commonly move Jumu'ah earlier in winter).
//
//   node scripts/refresh-mawaqit-jummah.mjs [--dry-run] [--limit N]
//
// Runs weekly in CI (.github/workflows/refresh-jummah.yml) and can be run
// by hand. Data is mosque-published on mawaqit.net, used with Mawaqit's
// permission and credited in the app's About screen.
//
//   --dry-run   fetch + diff but write nothing (no service key needed)
//   --limit N   only query the first N grid cells (smoke testing)
//
// Environment (process.env first, then .env in the repo root):
//   SUPABASE_URL                or EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY           or EXPO_PUBLIC_SUPABASE_ANON_KEY  (reads)
//   SUPABASE_SERVICE_ROLE_KEY   (writes — RLS allows no public writes, by
//                                design; this key must only ever exist in
//                                CI secrets, NEVER in the repo or the app)
//
// SAFETY RULES (each one exists because the failure it prevents is worse
// than a stale time):
//   * identity is the Mawaqit uuid captured at link time — never proximity
//   * a mosque flagged `closed` is reported, its row left untouched
//   * a mosque that STOPS publishing a time is reported, not cleared —
//     losing a still-correct time helps nobody
//   * only rows whose times actually differ are written

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

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
  process.env.SUPABASE_URL || dotenv.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || dotenv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
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

// --- Mawaqit API (same pacing that completed the original harvest) ----------
const API = "https://mawaqit.net/api/2.0/mosque/search";
const UA = {
  "User-Agent":
    "MasjidLocatorBot/0.1 (UK masjid directory; crediting Mawaqit; low volume)",
  Accept: "application/json",
};
const THROTTLE_MS = 2500;
const MAX_THROTTLE_MS = 30_000;
const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const GIVE_UP_AFTER_CONSECUTIVE_LIMITS = 5;
// Search calls return the mosques nearest a point, so links are deduped
// onto the same ~2 km grid the harvest used: one call covers a neighbourhood.
const GRID_DEG = 0.02;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let throttleMs = THROTTLE_MS;

async function requestOnce(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?lat=${lat}&lon=${lng}`, {
      headers: UA,
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      return {
        rateLimited: true,
        waitMs:
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : null,
      };
    }
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return { mosques: Array.isArray(json) ? json : [] };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function searchNear(lat, lng) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await requestOnce(lat, lng);
    if (!result.rateLimited) {
      if (result.mosques && throttleMs > THROTTLE_MS) {
        throttleMs = Math.max(THROTTLE_MS, Math.round(throttleMs * 0.9));
      }
      return result;
    }
    throttleMs = Math.min(MAX_THROTTLE_MS, Math.round(throttleMs * 1.8));
    const wait = result.waitMs ?? throttleMs * (attempt + 1);
    console.log(
      `    rate limited — waiting ${Math.round(wait / 1000)}s (pace now ${throttleMs}ms)`,
    );
    await sleep(wait);
  }
  return { rateLimited: true, error: "HTTP 429 after retries" };
}

/** "13:30" within the plausible Jumu'ah window, else null. */
function toHHMM(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const total = h * 60 + min;
  if (total < 11 * 60 || total > 16 * 60 + 30) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const timesOf = (mosque) =>
  [mosque.jumua, mosque.jumua2, mosque.jumua3]
    .map(toHHMM)
    .filter((t, i, arr) => t !== null && arr.indexOf(t) === i)
    .sort();

const sameTimes = (a, b) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

// --- load links + current DB state ------------------------------------------
const links = JSON.parse(
  readFileSync(join(root, "scripts", "mawaqit-links.json"), "utf8"),
);

const current = new Map(); // placeId -> sorted jumuah_times
for (let i = 0; i < links.length; i += 50) {
  const ids = links
    .slice(i, i + 50)
    .map((l) => `"${l.placeId}"`)
    .join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/places?select=id,jumuah_times&id=in.(${encodeURIComponent(ids)})`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
  );
  if (!res.ok) {
    console.error(`Supabase read failed: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  for (const row of await res.json()) {
    const times = Array.isArray(row.jumuah_times)
      ? row.jumuah_times.filter((t) => typeof t === "string").sort()
      : [];
    current.set(row.id, times);
  }
}
const missingRows = links.filter((l) => !current.has(l.placeId));
if (missingRows.length) {
  console.warn(
    `${missingRows.length} linked place(s) not found in Supabase (deleted?):`,
  );
  for (const l of missingRows) console.warn(`  - ${l.placeId}`);
}

// --- query Mawaqit, one call per grid cell ----------------------------------
const cells = new Map(); // key -> {lat,lng,links:[]}
for (const link of links) {
  if (!current.has(link.placeId)) continue;
  const key = `${Math.round(link.lat / GRID_DEG)}:${Math.round(link.lng / GRID_DEG)}`;
  if (!cells.has(key)) {
    cells.set(key, {
      lat: Math.round(link.lat / GRID_DEG) * GRID_DEG,
      lng: Math.round(link.lng / GRID_DEG) * GRID_DEG,
      links: [],
    });
  }
  cells.get(key).links.push(link);
}
const queue = [...cells.values()].slice(0, LIMIT);
console.log(
  `${links.length} linked places -> ${cells.size} grid cells; querying ${queue.length}${DRY_RUN ? " (dry run)" : ""}.`,
);

const found = new Map(); // uuid -> mosque
let cellFailures = 0;
let consecutiveLimits = 0;
for (const cell of queue) {
  const { mosques, error, rateLimited } = await searchNear(cell.lat, cell.lng);
  if (error) {
    cellFailures++;
    console.log(`  cell ${cell.lat.toFixed(2)},${cell.lng.toFixed(2)}: ${error}`);
    consecutiveLimits = rateLimited ? consecutiveLimits + 1 : 0;
    if (consecutiveLimits >= GIVE_UP_AFTER_CONSECUTIVE_LIMITS) {
      console.log(
        "\nRate limit persists — stopping. Next scheduled run will catch up.",
      );
      break;
    }
  } else {
    consecutiveLimits = 0;
    for (const m of mosques) if (m?.uuid) found.set(m.uuid, m);
  }
  await sleep(throttleMs);
}

// Second pass: a dense cell's search returns only the mosques nearest its
// centre, so a linked mosque near the cell edge can be crowded out. Re-query
// those few at their exact coordinates before declaring them missing.
const firstPassMisses = queue
  .flatMap((cell) => cell.links)
  .filter((link) => !found.get(link.mawaqitUuid));
if (firstPassMisses.length) {
  console.log(
    `${firstPassMisses.length} not in their cell's results — re-querying at exact position.`,
  );
  for (const link of firstPassMisses) {
    const { mosques } = await searchNear(link.lat, link.lng);
    for (const m of mosques ?? []) if (m?.uuid) found.set(m.uuid, m);
    await sleep(throttleMs);
  }
}

// --- diff --------------------------------------------------------------------
const updates = [];   // {link, from, to}
const unchanged = [];
const closed = [];
const wentQuiet = []; // published a time before, none now
const notSeen = [];   // uuid absent even from an exact-position query

for (const cell of queue) {
  for (const link of cell.links) {
    const mosque = found.get(link.mawaqitUuid);
    if (!mosque) {
      notSeen.push(link);
      continue;
    }
    if (mosque.closed === true) {
      closed.push(link);
      continue;
    }
    const fresh = timesOf(mosque);
    const ours = current.get(link.placeId) ?? [];
    if (fresh.length === 0) {
      if (ours.length > 0) wentQuiet.push(link);
      continue;
    }
    if (sameTimes(fresh, ours)) unchanged.push(link);
    else updates.push({ link, from: ours, to: fresh });
  }
}

// --- write -------------------------------------------------------------------
let writeFailures = 0;
for (const { link, from, to } of updates) {
  console.log(
    `  ${link.placeId}: [${from.join(", ")}] -> [${to.join(", ")}]`,
  );
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
      body: JSON.stringify({ jumuah_times: to }),
    },
  );
  if (!res.ok) {
    writeFailures++;
    console.error(
      `  WRITE FAILED ${link.placeId}: HTTP ${res.status} ${await res.text()}`,
    );
  }
}

console.log(`
Summary${DRY_RUN ? " (dry run — nothing written)" : ""}:
  ${unchanged.length} unchanged
  ${updates.length} time change(s)${DRY_RUN ? " detected" : " written"}
  ${wentQuiet.length} mosque(s) stopped publishing a time (kept ours — review)
  ${closed.length} flagged closed on Mawaqit (untouched — review)
  ${notSeen.length} not seen in their cell's results this run
  ${cellFailures} cell query failure(s)
  ${writeFailures} write failure(s)`);
for (const l of wentQuiet) console.log(`  quiet: ${l.placeId}`);
for (const l of closed) console.log(`  closed: ${l.placeId}`);
for (const l of notSeen) console.log(`  not seen: ${l.placeId} (${l.mawaqitSlug})`);

process.exit(writeFailures > 0 ? 1 : 0);
