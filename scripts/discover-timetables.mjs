#!/usr/bin/env node
// Sweeps every place's own website looking for a timetable this pipeline can
// already read, and reports what it finds.
//
//   node scripts/discover-timetables.mjs [--limit N] [--out DIR] [--fresh]
//
// WHY A DISCOVERY PASS RATHER THAN HAND-PICKING: 373 places have a website.
// Opening each one by hand does not scale, and writing a bespoke parser per
// mosque scales even worse. So this looks for the shapes the existing
// parsers handle:
//
//   masjidbox      — a masjidbox.net/<slug> link (parsed by the masjidbox source)
//   mawaqit-embed  — a mawaqit.net/<slug> link (already covered, or registrable)
//   dated-table    — an HTML table with dated rows and per-prayer jamā'ah
//                    column headings (parsed by the dated-table source)
//
// CRUCIALLY it does not just fingerprint: for dated-table candidates it
// PARSES TODAY'S ROW and only reports success if real times come out. A
// candidate that "looks parseable" but yields nothing is reported separately,
// never registered.
//
// Nothing is written to the registry automatically — the report lists ready-
// to-paste entries for a human to approve, because a mis-registered source
// would put another mosque's prayer times in front of a user.
//
// Politeness: one request per site, 1.5 s apart, honours robots-style
// refusals by simply recording the failure and moving on. Results are
// checkpointed, so the sweep can be stopped and resumed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  htmlTableRows,
  parseDatedJamaatTable,
} from "./lib/timetable.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;
const OUT_DIR = flag("--out") ?? root;
const FRESH = args.includes("--fresh");

const THROTTLE_MS = 1500;
const TIMEOUT_MS = 15_000;
const CHECKPOINT_EVERY = 20;
const UA = {
  "User-Agent":
    "Mozilla/5.0 (compatible; MasjidLocatorBot/0.1; UK masjid directory; +https://github.com/Sherheryaar/Musallah)",
  Accept: "text/html",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDate = new Date().toISOString().slice(0, 10);

const places = JSON.parse(
  readFileSync(join(root, "src", "data", "places.json"), "utf8"),
);
const registry = JSON.parse(
  readFileSync(join(root, "scripts", "timetable-links.json"), "utf8"),
);
const alreadyRegistered = new Set(registry.map((l) => l.placeId));

// Candidates: has a website, not already covered by a source.
const candidates = places.filter(
  (p) => p.website && !alreadyRegistered.has(p.id),
);

const checkpointPath = join(OUT_DIR, "timetable-discovery.json");
/** placeId -> finding */
const findings = new Map();
if (!FRESH && existsSync(checkpointPath)) {
  try {
    for (const f of JSON.parse(readFileSync(checkpointPath, "utf8")).findings) {
      findings.set(f.placeId, f);
    }
    console.log(`Resuming: ${findings.size} site(s) already probed.`);
  } catch {
    console.log("Checkpoint unreadable — starting fresh.");
  }
}

const saveCheckpoint = () => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    checkpointPath,
    JSON.stringify({ probedOn: isoDate, findings: [...findings.values()] }, null, 1),
  );
};

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/html|text/i.test(type)) return { error: `content-type ${type}` };
    return { text: await res.text(), finalUrl: res.url };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Pages worth a second look for a dated table, in priority order. */
function timetableLinks(html, baseUrl) {
  const urls = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    const href = m[1];
    if (!/prayer|salah|salat|namaz|timetable|times|calendar/i.test(href)) continue;
    if (/\.(pdf|jpg|png|docx?)$/i.test(href)) continue;
    try {
      urls.add(new URL(href, baseUrl).toString());
    } catch {
      // Unparseable href — ignore.
    }
  }
  return [...urls].slice(0, 3);
}

// Asset/CDN path segments that appear after the host but are never a mosque
// slug. Without this the first regex hit on a page can be
// "cdn.masjidbox.com/content/..." — which would silently lose the real slug.
const NOT_A_SLUG =
  /^(content|public|assets|static|images|img|css|js|fonts|embed|api|widget|prayer-times|en|ar)$/i;

function fingerprint(html) {
  const platforms = [];
  const masjidboxSlugs = [
    ...html.matchAll(/masjidbox\.(?:net|com)\/([a-z0-9][a-z0-9-]{2,79})/gi),
  ]
    .map((m) => m[1])
    .filter((slug) => !NOT_A_SLUG.test(slug));
  if (masjidboxSlugs.length) {
    platforms.push({ platform: "masjidbox", slug: masjidboxSlugs[0] });
  }
  const mawaqitSlugs = [
    ...html.matchAll(/mawaqit\.net\/(?:[a-z]{2}\/)?([a-z0-9][a-z0-9-]{2,79})/gi),
  ]
    .map((m) => m[1])
    .filter((slug) => !NOT_A_SLUG.test(slug));
  if (mawaqitSlugs.length) {
    platforms.push({ platform: "mawaqit-embed", slug: mawaqitSlugs[0] });
  }
  return platforms;
}

/** Does this HTML contain a dated jamā'ah table we can read TODAY? */
function tryDatedTable(html) {
  const rows = htmlTableRows(html);
  if (rows.length === 0) return null;
  const jamaat = parseDatedJamaatTable(rows, isoDate);
  if (jamaat) return { jamaat, prayers: Object.keys(jamaat).length };
  // Distinguish "has a dated table but not for today / not named columns"
  // from "no table at all" — the first is worth a human look.
  const looksDated = rows.some((r) => /^\d{2}\/\d{2}\/\d{4}$/.test(r[0] ?? ""));
  return looksDated ? { jamaat: null, prayers: 0, datedButUnparsed: true } : null;
}

const queue = candidates.filter((p) => !findings.has(p.id)).slice(0, LIMIT);
console.log(
  `${candidates.length} place(s) with a website and no source yet; probing ${queue.length}.`,
);

let done = 0;
process.on("SIGINT", () => {
  saveCheckpoint();
  console.log("\nInterrupted — checkpoint saved. Re-run to continue.");
  process.exit(130);
});

for (const place of queue) {
  const finding = { placeId: place.id, placeName: place.name, website: place.website };
  const home = await getText(place.website);
  if (home.error) {
    finding.error = home.error;
  } else {
    const platforms = fingerprint(home.text);
    if (platforms.length) finding.platforms = platforms;

    // Home page first, then up to 3 likely timetable pages.
    let hit = tryDatedTable(home.text);
    let hitUrl = place.website;
    if (!hit?.jamaat) {
      for (const url of timetableLinks(home.text, home.finalUrl ?? place.website)) {
        await sleep(THROTTLE_MS);
        const page = await getText(url);
        if (page.error) continue;
        const sub = tryDatedTable(page.text);
        if (sub?.jamaat) {
          hit = sub;
          hitUrl = url;
          break;
        }
        if (sub?.datedButUnparsed && !hit) {
          hit = sub;
          hitUrl = url;
        }
        // A platform link can also live on the timetable page.
        const subPlatforms = fingerprint(page.text);
        if (subPlatforms.length && !finding.platforms) {
          finding.platforms = subPlatforms;
        }
      }
    }
    if (hit?.jamaat) {
      finding.datedTable = { url: hitUrl, prayers: hit.prayers, jamaat: hit.jamaat };
    } else if (hit?.datedButUnparsed) {
      finding.datedTableUnparsed = { url: hitUrl };
    }
  }
  findings.set(place.id, finding);
  done++;
  if (done % CHECKPOINT_EVERY === 0) {
    saveCheckpoint();
    const ready = [...findings.values()].filter((f) => f.datedTable).length;
    const platform = [...findings.values()].filter((f) => f.platforms).length;
    console.log(
      `  ${done}/${queue.length} probed · ${ready} parseable table(s) · ${platform} platform hit(s)`,
    );
  }
  await sleep(THROTTLE_MS);
}
saveCheckpoint();

// --- report -----------------------------------------------------------------
const all = [...findings.values()];
const ready = all.filter((f) => f.datedTable);
const masjidboxHits = all.filter((f) =>
  f.platforms?.some((p) => p.platform === "masjidbox"),
);
const mawaqitHits = all.filter((f) =>
  f.platforms?.some((p) => p.platform === "mawaqit-embed"),
);
const unparsed = all.filter((f) => f.datedTableUnparsed);
const errors = all.filter((f) => f.error);

const entry = (f, source, extra) =>
  JSON.stringify({
    placeId: f.placeId,
    source,
    placeName: f.placeName,
    ...extra,
  });

const report = `# Timetable discovery

Probed ${all.length} of ${candidates.length} places that have a website and no
timetable source yet, on ${isoDate}, with scripts/discover-timetables.mjs.

**Nothing here is registered yet.** Each block below is a ready-to-paste
entry for scripts/timetable-links.json — check the mosque is the right one
before adding it, because a mis-registered source would show another
mosque's prayer times.

- ${ready.length} site(s) publish a dated table this pipeline PARSED TODAY (times shown)
- ${masjidboxHits.length} site(s) embed Masjidbox
- ${mawaqitHits.length} site(s) embed Mawaqit
- ${unparsed.length} site(s) have a dated table we could NOT parse (needs a look)
- ${errors.length} site(s) unreachable (offline, blocked, or not HTML)

## Parsed a real timetable today (${ready.length})

${
  ready
    .map(
      (f) =>
        `### ${f.placeName}\n- \`${f.placeId}\`\n- ${f.datedTable.url}\n- today: ${Object.entries(f.datedTable.jamaat)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}\n\n\`\`\`json\n${entry(f, "dated-table", {
          url: f.datedTable.url,
          credit: `${new URL(f.datedTable.url).hostname} (published timetable)`,
        })}\n\`\`\``,
    )
    .join("\n\n") || "_none_"
}

## Masjidbox sites (${masjidboxHits.length})

${
  masjidboxHits
    .map((f) => {
      const slug = f.platforms.find((p) => p.platform === "masjidbox").slug;
      return `### ${f.placeName}\n- \`${f.placeId}\` — slug \`${slug}\`\n\n\`\`\`json\n${entry(f, "masjidbox", { url: `https://masjidbox.net/${slug}` })}\n\`\`\``;
    })
    .join("\n\n") || "_none_"
}

## Mawaqit embeds (${mawaqitHits.length})

These mosques use Mawaqit but were not matched by the coordinate harvest —
worth adding to the Mawaqit registry entries by hand.

${
  mawaqitHits
    .map(
      (f) =>
        `- ${f.placeName} (\`${f.placeId}\`) — slug \`${f.platforms.find((p) => p.platform === "mawaqit-embed").slug}\``,
    )
    .join("\n") || "_none_"
}

## Dated table found but not parsed (${unparsed.length})

The page has date-keyed rows but no per-prayer jamā'ah column headings the
parser recognises. Each is a candidate for a small parser improvement —
check whether the heading wording is just unusual.

${unparsed.map((f) => `- ${f.placeName} — ${f.datedTableUnparsed.url}`).join("\n") || "_none_"}

## Unreachable (${errors.length})

${
  Object.entries(
    errors.reduce((acc, f) => {
      acc[f.error] = (acc[f.error] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([err, n]) => `- ${err} — ${n}`)
    .join("\n") || "_none_"
}
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "timetable-discovery-report.md"), report);
console.log(`
Probed ${all.length} site(s): ${ready.length} parseable table(s), ${masjidboxHits.length} masjidbox, ${mawaqitHits.length} mawaqit, ${unparsed.length} unparsed, ${errors.length} unreachable.
Report: ${join(OUT_DIR, "timetable-discovery-report.md")}`);
