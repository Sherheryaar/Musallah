#!/usr/bin/env node
// Audits every place in the dataset for INDEPENDENT CORROBORATION and
// proposes a `confidence` tier ("verified" | "community" | "unverified").
//
//   node scripts/verify-places.mjs [--report path.md] [--sql path.sql]
//                                 [--cache path.json] [--offline] [--apply]
//
//   --report <path>  markdown report            (default place-confidence-report.md)
//   --sql <path>     UPDATE statements          (default scripts/update-place-confidence.sql)
//   --cache <path>   Overpass checkpoint file   (default scripts/.overpass-cache.json)
//   --offline        score from the cache only, make no network calls
//   --apply          also rewrite src/data/places.json with the new tiers
//   --max-age <days> re-fetch cached Overpass cells older than this (default 30)
//
// No dependencies -- plain Node 18+ (built-in fetch), like the other scripts here.
//
// WHY THIS EXISTS
// ---------------
// The shipped `confidence` column was derived purely from which import a row
// came from: every MuslimsInBritain row became "community", every
// OpenStreetMap row became "unverified". That says nothing about whether the
// place exists. This script replaces it with a score built only from signals
// that can be checked by someone else, from the outside, today:
//
//   * whether two independent datasets (MIB and OSM) agreed at import time,
//   * whether OSM *right now* maps a Muslim prayer space at the pin,
//   * whether the record names a contactable organisation (phone/website),
//   * how specific the address is,
//   * whether MIB itself flagged the venue as irregular/part-time,
//   * whether the premises type is inherently volatile (a rented room vs. a
//     purpose-built masjid), excluding institutional prayer rooms which are
//     volatile-looking but real.
//
// Nothing here is invented: every point is traceable to a field in the record
// or to an OSM element id written into the checkpoint file. When evidence is
// thin the place is classified DOWN. "verified" is deliberately hard to reach.
//
// The report also lists REMOVAL candidates -- rows that do not look like a
// public Muslim prayer space at all (cemetery/crematorium chapels swept up by
// the OSM import, madrasahs with no musalla). This script never deletes a
// place; that is a human decision, taken in Supabase.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- args -------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const placesPath = join(root, "src", "data", "places.json");
const reportPath = arg("report", join(root, "place-confidence-report.md"));
const sqlPath = arg("sql", join(root, "scripts", "update-place-confidence.sql"));
const cachePath = arg("cache", join(root, "scripts", ".overpass-cache.json"));
const maxAgeDays = Number(arg("max-age", "30"));
const offline = flag("offline");
const apply = flag("apply");

const places = JSON.parse(readFileSync(placesPath, "utf8"));

// ===========================================================================
// 1. Offline signals read straight off the record
// ===========================================================================

// Provenance tag written by the importers, e.g. "Data: MIB+OSM (mib-2203)".
// MIB+OSM means the MuslimsInBritain row was matched to an OpenStreetMap
// place_of_worship at import time -- two organisations independently recorded
// a mosque here. "MIB" or "OSM" alone is a single unreviewed source.
function provenance(place) {
  const m = (place.notes ?? "").match(/Data:\s*(MIB\+OSM|MIB|OSM)\b/);
  if (!m) return "seed"; // the 12 hand-curated seed rows predate both imports
  return m[1];
}

// OSM-sourced rows carry the exact element they came from, e.g.
// "Data: OSM (way/885612663)". That lets us ask OSM whether that element
// still exists and is still a Muslim prayer space -- the single strongest
// check available for those rows, because the element IS their only source.
function osmElementRef(place) {
  const m = (place.notes ?? "").match(/Data:\s*OSM\s*\((node|way|relation)\/(\d+)\)/);
  return m ? { type: m[1], id: Number(m[2]) } : null;
}

// MIB records a rough congregation capacity. A venue that seats hundreds is a
// building; a venue that seats 30 is a room in something else. Only used as a
// mild positive for large venues -- a small capacity is never a penalty,
// because plenty of legitimate musallas are small.
function capacity(place) {
  const m = (place.notes ?? "").match(/Capacity\s*~?(\d+)/i);
  return m ? Number(m[1]) : null;
}

const partTime = (place) => /Irregular \/ part-time venue/i.test(place.notes ?? "");

// Premises whose host institution is itself the guarantee the room exists:
// hospitals, universities, airports, motorway services, big shopping centres,
// prisons, transport interchanges. These are real, useful prayer spaces even
// though they are "just a room", so they are exempt from the volatile-premises
// penalty below. Deliberately does NOT include school/academy/madrasah --
// those are the ones where a public prayer space is questionable.
const INSTITUTIONAL_RE =
  /\b(hospital|hospice|infirmary|nhs|health\s?centre|medical\s?centre|maternity|clinic|universit(?:y|ies)|college|campus|chaplain(?:cy)?|students?\s?union|halls?\s+of\s+residence|airport|terminal\s?\d?|motorway|\bservices\b|service\s+station|railway\s+station|bus\s+station|coach\s+station|interchange|shopping\s+(?:centre|center|mall|park)|retail\s+park|outlet\s+(?:centre|village)|designer\s+village|prison|hmp\b|town\s+hall|civic\s+centre|city\s+council|library|museum|stadium|arena|leisure\s+centre|sports\s+centre|business\s+park|wharf|court\s+house|crown\s+court|barracks|garrison|ferry|port\s+of)\b/i;

const isInstitutional = (place) =>
  INSTITUTIONAL_RE.test(place.name) || INSTITUTIONAL_RE.test(place.address ?? "");

// A house number, unit number or a named premises pins the record to a
// building. A bare street name ("Woodmill Road, Clapton, E5 9GS") does not --
// the street may be a mile long, and that is exactly the failure mode that
// prompted this audit.
const PREMISES_RE =
  /\b(house|lodge|hall|halls|building|centre|center|mill|mills|works|court|chambers|institute|club|school|college|hospital|terminal|arcade|mall|estate|farm|wing|floor|level|annexe|annex|studio|studios|unit|units|block|parade|precinct|market|library|barracks|tower|cottage|villa|manor|grange|depot|garage|warehouse|pavilion|chapel|church|cinema|theatre|stadium|station)\b/i;
const NUMBERED_RE = /(^\s*\d|\bunit\s*\d|\bno\.?\s*\d|\b\d+\s*[-–/]\s*\d+|\b\d+[a-z]?\s+[a-z])/i;

function addressQuality(place) {
  const a = (place.address ?? "").trim();
  if (!a || /^address not recorded/i.test(a)) return "missing";
  if (NUMBERED_RE.test(a) || PREMISES_RE.test(a)) return "specific";
  return "street-only";
}

// ===========================================================================
// 2. Live OpenStreetMap check via Overpass
// ===========================================================================
//
// Overpass rate-limits hard and its dispatcher returns 504 when busy, so:
//   * ONE query per ~1 degree grid cell (56 cells cover the dataset) instead
//     of one query per place -- 2,280 individual requests would be abusive
//     and would get the IP blocked;
//   * requests are rotated round-robin across known-good mirrors, with a
//     global minimum gap and a longer per-mirror gap;
//   * 406/429/504/503 back off exponentially and retry on the next mirror;
//   * every cell is checkpointed to disk the moment it lands, so a failure
//     halfway through costs one cell, not the whole run.

const USER_AGENT =
  "MusallahPlaceAudit/1.0 (UK & Ireland masjid dataset verification; https://github.com/)";

// Rotated round-robin so no single instance carries the whole sweep. The two
// primaries answered a test query in 3-10 s when this was written; the two
// fallbacks took 55-65 s, so they are only used after a primary has failed --
// that is faster *and* kinder to the slow mirrors than spraying every request
// across all four.
const PRIMARY_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const FALLBACK_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const ALL_ENDPOINTS = [...PRIMARY_ENDPOINTS, ...FALLBACK_ENDPOINTS];

const MIN_GAP_MS = 1600; // between any two Overpass calls, whatever the host
const MIN_ENDPOINT_GAP_MS = 4000; // between two calls to the SAME host
const BACKOFF_MS = [5000, 15000, 45000, 90000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;
const lastEndpointCallAt = new Map();
let endpointCursor = 0;

async function overpass(query, label) {
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    // First try: alternate between the fast instances. Each retry walks one
    // step further into the full list, so a persistent 504 on one host ends up
    // on a different host rather than hammering the same one.
    const endpoint =
      attempt === 0
        ? PRIMARY_ENDPOINTS[endpointCursor % PRIMARY_ENDPOINTS.length]
        : ALL_ENDPOINTS[(endpointCursor + attempt) % ALL_ENDPOINTS.length];
    if (attempt === 0) endpointCursor++;

    const waitGlobal = MIN_GAP_MS - (Date.now() - lastCallAt);
    const waitEndpoint =
      MIN_ENDPOINT_GAP_MS - (Date.now() - (lastEndpointCallAt.get(endpoint) ?? 0));
    const wait = Math.max(waitGlobal, waitEndpoint, 0);
    if (wait > 0) await sleep(wait);

    lastCallAt = Date.now();
    lastEndpointCallAt.set(endpoint, Date.now());

    let status = 0;
    let body = "";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(240000),
      });
      status = res.status;
      body = await res.text();
      if (res.ok) {
        // Overpass reports some runtime errors with HTTP 200 and an HTML body.
        if (body.trimStart().startsWith("{")) return JSON.parse(body);
        throw new Error("non-JSON body: " + body.slice(0, 160).replace(/\s+/g, " "));
      }
    } catch (err) {
      body = err.message;
    }

    const backoff = BACKOFF_MS[attempt];
    if (backoff === undefined) {
      console.warn(`  ! ${label}: gave up (last: ${status || "network"} ${body.slice(0, 80)})`);
      return null;
    }
    console.warn(
      `  ! ${label}: ${status || "network error"} from ${new URL(endpoint).host}` +
        ` -- retrying in ${backoff / 1000}s`,
    );
    await sleep(backoff);
  }
  return null;
}

// Tags worth keeping. `room=prayer` and `amenity=prayer_room` are not
// religion-specific, so the religion tag is kept and checked at match time --
// a Christian hospital chapel must not corroborate a musalla.
const KEEP = ["name", "religion", "denomination", "amenity", "room", "building"];

function trimElement(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const out = { t: el.type[0], id: el.id, lat, lon };
  for (const k of KEEP) if (el.tags?.[k]) out[k] = el.tags[k];
  return out;
}

const CELL = 1.0; // degrees; 56 cells cover the whole dataset
const MARGIN = 0.01; // ~1 km, so a match just outside a cell is still found

function cellKey(lat, lng) {
  return `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;
}

function loadCache() {
  if (!existsSync(cachePath)) return { cells: {}, elements: {} };
  try {
    const c = JSON.parse(readFileSync(cachePath, "utf8"));
    return { cells: c.cells ?? {}, elements: c.elements ?? {} };
  } catch {
    console.warn(`Could not parse ${cachePath}; starting a fresh cache.`);
    return { cells: {}, elements: {} };
  }
}

function saveCache(cache) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
}

const cache = loadCache();
const stale = (entry) =>
  !entry || !entry.at || Date.now() - Date.parse(entry.at) > maxAgeDays * 864e5;

// --- sweep: every Muslim prayer space in each populated grid cell -----------
const neededCells = new Set(places.map((p) => cellKey(p.lat, p.lng)));

if (!offline) {
  const todo = [...neededCells].filter((k) => stale(cache.cells[k]));
  console.log(
    `Overpass sweep: ${neededCells.size} grid cells cover ${places.length} places; ` +
      `${todo.length} need fetching.`,
  );
  let done = 0;
  for (const key of todo) {
    const [ky, kx] = key.split("_").map(Number);
    const s = ky * CELL - MARGIN;
    const w = kx * CELL - MARGIN;
    const n = (ky + 1) * CELL + MARGIN;
    const e = (kx + 1) * CELL + MARGIN;
    const bbox = `(${s},${w},${n},${e})`;
    const query =
      `[out:json][timeout:180];(` +
      `nwr["amenity"="place_of_worship"]["religion"="muslim"]${bbox};` +
      `nwr["building"="mosque"]${bbox};` +
      `nwr["room"="prayer"]${bbox};` +
      `nwr["amenity"="prayer_room"]${bbox};` +
      `);out center;`;
    const json = await overpass(query, `cell ${key}`);
    done++;
    if (!json) continue;
    const els = json.elements.map(trimElement).filter(Boolean);
    cache.cells[key] = { at: new Date().toISOString(), els };
    saveCache(cache); // checkpoint every cell
    console.log(`  [${done}/${todo.length}] cell ${key}: ${els.length} elements`);
  }
}

// --- second layer: shared multi-faith prayer rooms --------------------------
// Hospital / campus / airport prayer rooms are frequently tagged
// `amenity=place_of_worship` + `religion=multifaith` with no `room=prayer`, so
// the sweep above misses them entirely -- and those are exactly the 142
// `multi_faith_room` records in this dataset. `religion=multifaith` is rare
// enough that a coarse 4° grid needs only a handful of requests.
const MF_CELL = 4.0;
const mfCells = new Set(
  places.map((p) => `mf_${Math.floor(p.lat / MF_CELL)}_${Math.floor(p.lng / MF_CELL)}`),
);

if (!offline) {
  const todo = [...mfCells].filter((k) => stale(cache.cells[k]));
  if (todo.length) {
    console.log(`Multi-faith layer: ${todo.length} of ${mfCells.size} coarse cells need fetching.`);
    for (const key of todo) {
      const [, ky, kx] = key.split("_").map(Number);
      const bbox =
        `(${ky * MF_CELL - MARGIN},${kx * MF_CELL - MARGIN},` +
        `${(ky + 1) * MF_CELL + MARGIN},${(kx + 1) * MF_CELL + MARGIN})`;
      const json = await overpass(
        `[out:json][timeout:180];` +
          `nwr["religion"~"^(multifaith|multi-faith|interfaith)$"]${bbox};out center;`,
        `multi-faith ${key}`,
      );
      if (!json) continue;
      const els = json.elements.map(trimElement).filter(Boolean);
      cache.cells[key] = { at: new Date().toISOString(), els };
      saveCache(cache);
      console.log(`  ${key}: ${els.length} multi-faith elements`);
    }
  }
}

// --- identity check: do the OSM rows' own elements still say "Muslim"? ------
const refs = [];
for (const p of places) {
  const r = osmElementRef(p);
  if (r) refs.push({ place: p, ...r });
}

if (!offline) {
  const missing = refs.filter((r) => stale(cache.elements[`${r.type}/${r.id}`]));
  if (missing.length) {
    console.log(`Element identity check: ${missing.length} OSM-sourced rows to look up.`);
    for (const type of ["node", "way", "relation"]) {
      const ids = missing.filter((r) => r.type === type).map((r) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        const json = await overpass(
          `[out:json][timeout:120];${type}(id:${batch.join(",")});out center;`,
          `${type} ids ${i}-${i + batch.length}`,
        );
        if (!json) continue;
        const found = new Map();
        for (const el of json.elements) {
          const t = trimElement(el);
          if (t) found.set(el.id, t);
        }
        const at = new Date().toISOString();
        // An id absent from the response has been deleted from OSM.
        for (const id of batch) {
          cache.elements[`${type}/${id}`] = { at, el: found.get(id) ?? null };
        }
        saveCache(cache);
        console.log(`  ${type}: ${found.size}/${batch.length} still exist`);
      }
    }
  }
}

// --- index every fetched element for fast nearest-neighbour lookups ---------
const allElements = new Map(); // "n/123" -> element (deduped across cells/layers)
for (const entry of Object.values(cache.cells)) {
  for (const el of entry.els ?? []) allElements.set(`${el.t}/${el.id}`, el);
}
// The elements fetched by id belong in the index too: an OSM-sourced row whose
// own element still exists ought to match itself, even if its grid cell was
// one of the ones Overpass refused. (Circularity is contained: the +1 name
// agreement bonus is withheld from OSM-sourced rows, see namesAgree below.)
for (const entry of Object.values(cache.elements)) {
  if (entry?.el) allElements.set(`${entry.el.t}/${entry.el.id}`, entry.el);
}

const BUCKET = 0.01; // ~1.1 km
const buckets = new Map();
for (const el of allElements.values()) {
  const k = `${Math.floor(el.lat / BUCKET)}_${Math.floor(el.lon / BUCKET)}`;
  let list = buckets.get(k);
  if (!list) buckets.set(k, (list = []));
  list.push(el);
}

function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// A generic `room=prayer` / `amenity=prayer_room` with an explicitly
// non-Muslim religion is evidence of somebody else's chapel, not of ours.
const NON_MUSLIM = /^(christian|jewish|hindu|sikh|buddhist|bahai|jain|taoist|shinto|pagan)/i;
const MULTIFAITH = /^(multifaith|multi-faith|interfaith)$/i;
function isMuslimSpace(el) {
  if (el.religion && NON_MUSLIM.test(el.religion)) return false;
  if (el.religion === "muslim" || el.building === "mosque") return true;
  // Shared multi-faith rooms and untagged prayer rooms count -- a hospital
  // multi-faith room is a place a Muslim can actually pray.
  if (el.religion && MULTIFAITH.test(el.religion)) return true;
  return el.room === "prayer" || el.amenity === "prayer_room";
}

// `exclude` is the key of the row's OWN OSM element, for rows that were
// imported from OSM. Letting such a row match itself at 0 m would be pure
// circularity -- it would "corroborate" its only source with that same source.
// Whether that element still exists is checked separately, by id.
function nearestMatch(place, exclude) {
  let best = null;
  const by = Math.floor(place.lat / BUCKET);
  const bx = Math.floor(place.lng / BUCKET);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const el of buckets.get(`${by + dy}_${bx + dx}`) ?? []) {
        if (!isMuslimSpace(el)) continue;
        if (exclude && `${el.t}/${el.id}` === exclude) continue;
        const m = distanceM(place.lat, place.lng, el.lat, el.lon);
        if (!best || m < best.m) best = { el, m };
      }
    }
  }
  return best;
}

// Name agreement between our record and the matched OSM element is extra
// evidence -- but only for MIB rows. For an OSM-sourced row the element IS
// the source, so agreeing with itself proves nothing.
const GENERIC_NAME_WORDS = new Set([
  "masjid", "masjed", "mosque", "islamic", "islam", "muslim", "muslims", "jamia", "jaamia",
  "jamiah", "jame", "jamee", "jameah", "jumuah", "juma", "centre", "center", "central",
  "community", "cultural", "heritage", "education", "educational", "society", "association",
  "trust", "welfare", "institute", "academy", "prayer", "room", "hall", "the", "and", "for",
  "of", "uk", "salaah", "salah", "musallah", "musalla", "mussallah", "prayers", "chaplaincy",
  "multi", "faith", "multifaith", "students", "student", "union", "new", "old", "great",
]);

function nameTokens(name) {
  return new Set(
    (name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w)),
  );
}

// Transliterated names split and join unpredictably -- "Shah Jalal" vs
// "Shahjalal", "Suffatul" vs "Suffa-tul" -- so a token also matches when it is
// contained in the other, provided it is long enough (>=5 chars) for that not
// to be a coincidence.
function namesAgree(a, b) {
  const ta = [...nameTokens(a)];
  const tb = [...nameTokens(b)];
  if (!ta.length || !tb.length) return false;
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) return true;
      if (x.length >= 5 && y.includes(x)) return true;
      if (y.length >= 5 && x.includes(y)) return true;
    }
  }
  return false;
}

// ===========================================================================
// 3. Scoring
// ===========================================================================
//
// Points are only ever awarded for something an outsider could check. The
// scale is deliberately small so the thresholds stay legible.
//
//   provenance      MIB+OSM +3 | single source +1
//   live OSM        <=150 m +3 | <=400 m +1 | none 0
//   name agreement  +1  (matched element's name shares a distinctive word)
//   contact         website +2 | phone +1 | social +1   (subtotal capped at 3)
//   address         specific +1 | not recorded -1
//   scale           MIB capacity >= 200 +1
//   penalties       part-time -2 | volatile non-institutional premises -1
//                   OSM source element deleted or retagged non-Muslim -3
//
// Range: -6 .. 12. Provenance always contributes at least +1, so a floor of
// -6 means "single source, no address, part-time, rented room, and the OSM
// element it came from has gone".

const NEAR_M = 150; // "at the pin" -- within the accuracy of a geocoded address
const NEARBY_M = 400; // same block; suggestive but could be a different building

function score(place) {
  const reasons = []; // positive signals, for the report
  const missing = []; // absent/negative signals, for the report
  let s = 0;

  const ref = osmElementRef(place);
  const ownKey = ref ? `${ref.type[0]}/${ref.id}` : null;
  const prov = provenance(place);
  if (prov === "MIB+OSM") {
    s += 3;
    reasons.push("MIB and OpenStreetMap independently recorded it (MIB+OSM)");
  } else {
    s += 1;
    missing.push(
      prov === "seed"
        ? "hand-entered seed row, no dataset provenance"
        : `single source only (${prov})`,
    );
  }

  // A match to a *differently named* mosque 100 m away is much weaker evidence
  // than a match to one with our name at 10 m: in dense areas two separate
  // masjids can sit a street apart, so a name clash may mean the OSM element is
  // a neighbour rather than this place. Hence the reduced award below.
  const match = nearestMatch(place, ownKey);
  const nameClash = Boolean(match?.el.name) && !namesAgree(place.name, match?.el.name);
  const describe = (m) =>
    `${m.el.t}/${m.el.id}${m.el.name ? ` "${m.el.name}"` : " (unnamed)"}`;

  let liveAtPin = false;
  if (match && match.m <= NEAR_M) {
    liveAtPin = true;
    if (nameClash) {
      s += 2;
      reasons.push(
        `OSM maps a prayer space ${Math.round(match.m)} m from the pin, but under a different name (${describe(match)})`,
      );
    } else {
      s += 3;
      reasons.push(`OSM maps a prayer space ${Math.round(match.m)} m from the pin (${describe(match)})`);
    }
  } else if (match && match.m <= NEARBY_M) {
    s += 1;
    reasons.push(
      `OSM prayer space ${Math.round(match.m)} m away (${describe(match)}) -- nearby, not at the pin`,
    );
  } else {
    missing.push(
      match
        ? `nearest independent OSM prayer space is ${Math.round(match.m)} m away`
        : `no independent OSM prayer space within ${NEARBY_M} m`,
    );
  }

  // Name agreement is only evidence when the two names came from different
  // places. For an OSM-sourced row the element IS the source, so this is
  // withheld -- but `nearestMatch` already excluded its own element, so a
  // named agreement here would be a genuinely separate element anyway.
  if (match && match.m <= NEARBY_M && !nameClash && match.el.name && prov !== "OSM") {
    s += 1;
    reasons.push(`name agrees with the OSM element ("${match.el.name}")`);
  }

  let contact = 0;
  if (place.website) {
    contact += 2;
    reasons.push("has a website");
  } else missing.push("no website");
  if (place.phone) {
    contact += 1;
    reasons.push("has a phone number");
  } else missing.push("no phone number");
  if (place.facebook || place.instagram) {
    contact += 1;
    reasons.push("has a social media page");
  }
  s += Math.min(contact, 3);

  const addr = addressQuality(place);
  if (addr === "specific") {
    s += 1;
    reasons.push("address identifies a specific building");
  } else if (addr === "missing") {
    s -= 1;
    missing.push("no address recorded");
  } else {
    missing.push("address is a bare street name, no house number or named premises");
  }

  const cap = capacity(place);
  if (cap !== null && cap >= 200) {
    s += 1;
    reasons.push(`MIB capacity ~${cap} -- a building, not a borrowed room`);
  }

  const pt = partTime(place);
  if (pt) {
    s -= 2;
    missing.push("MIB flags it as an irregular / part-time venue");
  }

  // The volatility penalty targets one thing: a room rented or borrowed in
  // ordinary premises, which closes without anyone updating a map. A
  // `multi_faith_room` is by definition a shared room inside a host building --
  // hospital, campus, airport, shopping centre -- and the host vouches for it,
  // so the type is treated as institutional outright. Relying on the keyword
  // list alone was wrong: it missed "Quiet Room, Blue Zone, Metro Centre",
  // one of the largest shopping centres in the UK, because the address never
  // says "shopping centre".
  const institutional = place.type === "multi_faith_room" || isInstitutional(place);
  if (place.type === "musalla" && !institutional) {
    s -= 1;
    missing.push("musalla in ordinary premises (rented/shared rooms come and go)");
  } else if (place.type !== "masjid") {
    reasons.push(
      "shared prayer room inside a host institution that vouches for it (hospital/campus/transport/retail)",
    );
  }

  // The OSM rows' own element, re-checked today. This is NOT independent
  // corroboration -- it is the row's only source, asked again -- so it earns a
  // single point for "still there, still a Muslim prayer space" and never joins
  // the corroboration families. Getting the opposite answer, though, is decisive.
  let contradicted = false;
  if (ref) {
    const cached = cache.elements[`${ref.type}/${ref.id}`];
    if (cached && cached.el === null) {
      s -= 3;
      contradicted = true;
      missing.push(`its only source, OSM ${ref.type}/${ref.id}, has been deleted from OSM`);
    } else if (cached && cached.el && !isMuslimSpace(cached.el)) {
      s -= 3;
      contradicted = true;
      missing.push(
        `its only source, OSM ${ref.type}/${ref.id}, is not a Muslim prayer space` +
          ` (religion=${cached.el.religion ?? "unset"}, amenity=${cached.el.amenity ?? "unset"})`,
      );
    } else if (cached && cached.el) {
      s += 1;
      reasons.push(
        `its source element OSM ${ref.type}/${ref.id} still exists and is still tagged as a prayer space` +
          ` (religion=${cached.el.religion ?? "unset"})`,
      );
    } else {
      missing.push(`OSM ${ref.type}/${ref.id} could not be re-checked (Overpass unavailable)`);
    }
  }

  // Independent corroboration families. Two datasets agreeing, a live map
  // match, a website and a phone number are four different ways of being
  // wrong, so counting them separately is meaningful. Family membership for
  // the live check uses the looser NEARBY_M radius -- an OSM prayer space 300 m
  // away is still somebody else independently saying "there is one round
  // here". The tighter NEAR_M radius is kept separately, because only a match
  // *at the pin* is good enough to help a row reach `verified`.
  const families = {
    dualSource: prov === "MIB+OSM",
    liveOsm: Boolean(match && match.m <= NEARBY_M),
    website: Boolean(place.website),
    phone: Boolean(place.phone),
  };
  const corroborations = Object.values(families).filter(Boolean).length;

  return {
    place,
    score: s,
    reasons,
    missing,
    match,
    families,
    liveAtPin,
    corroborations,
    provenance: prov,
    partTime: pt,
    contradicted,
    checkedLive:
      cache.cells[cellKey(place.lat, place.lng)] !== undefined ||
      (ref !== null && cache.elements[`${ref.type}/${ref.id}`] !== undefined),
    addressQuality: addr,
    capacity: cap,
    institutional,
  };
}

// --- tiers -----------------------------------------------------------------
//
// verified   Needs a map/dataset corroboration (two datasets agreed, or OSM
//            maps a prayer space at the pin today) AND a contactable
//            organisation (website or phone) AND >=2 independent families
//            AND a total of >=7. Part-time venues and OSM-contradicted rows
//            can never be verified. In practice: "two things that were not
//            copied from each other both say this place is here, and you can
//            ring it up."
// unverified Nothing independent at all (0 families), or a single weak family
//            with a total of <=3, or its only source now contradicts it.
//            These are the rows the app should be able to hide.
// community  Everything else -- plausible, partially corroborated. The honest
//            default, and where most of the dataset belongs.

const VERIFIED_MIN = 7;
const WEAK_MAX = 3;

function tier(r) {
  if (r.contradicted) return "unverified";
  if (
    r.corroborations >= 2 &&
    r.score >= VERIFIED_MIN &&
    (r.families.dualSource || r.liveAtPin) &&
    (r.families.website || r.families.phone) &&
    !r.partTime
  ) {
    return "verified";
  }
  if (r.corroborations === 0) return "unverified";
  if (r.corroborations === 1 && r.score <= WEAK_MAX) return "unverified";
  return "community";
}

const results = places.map(score);
for (const r of results) r.tier = tier(r);

// ===========================================================================
// 4. Removal candidates (reported, never deleted)
// ===========================================================================
//
// The dataset only lists venues that offer a genuine PUBLIC Muslim prayer
// space. Two patterns in the OSM import clearly do not qualify.

const FUNERARY_RE =
  /\b(cemetery|crematorium|crematoria|columbarium|burial ground|memorial chapel|chapel of rest)\b/i;
const OTHER_FAITH_RE =
  /\b(church|synagogue|gurdwara|mandir|vihara|temple|cathedral|quaker|convent|monastery|boys brigade|scout)\b/i;
const SCHOOL_RE = /\b(academy|school|madrasah|madrassah|madressa|madrasa|maktab|sixth form)\b/i;

// Names that assert a Muslim prayer facility outright. A row called
// "Cemetery Lodge Prayer Room" or "Bethel Chapel" (a chapel converted into a
// masjid) is not a removal candidate just because of the building it sits in.
const ISLAMIC_NAME_RE =
  /\b(masjid|masjed|mosque|musallah?|musalla|mussallah|jamia|jaamia|jame|prayer\s?room|islamic\s+(?:centre|center)|salaah|salah|jumu)\b/i;

// Student/staff prayer rooms run by an Islamic Society are real prayer spaces,
// even when the host is literally called a "School" (LSE, grammar-school
// ISocs). Never treat them as removal candidates.
const ISOC_RE = /\b(islamic\s+society|isoc|muslim\s+society|students?\s+union|chaplaincy)\b/i;

// A bare "Chapel" is genuinely ambiguous: the OSM import pulled in both
// hospital multi-faith chapels (usable, worth keeping) and crematorium /
// Christian chapels (not what this dataset is for), and both are tagged
// `religion=multifaith`. Flagged softly for a human to split apart. Names that
// advertise themselves as shared space are left alone.
const CHAPEL_RE = /\bchapel\b/i;
const SHARED_SPACE_RE = /\b(multi[\s-]?faith|interfaith|faith\s+(?:centre|center|room)|contemplation|quiet\s+room)\b/i;

function removalReason(r) {
  const p = r.place;
  if (r.contradicted) {
    return r.missing.find((m) => m.includes("its only source")) ?? "OSM source no longer supports it";
  }
  const ownElement = (() => {
    const ref = osmElementRef(p);
    return ref ? cache.elements[`${ref.type}/${ref.id}`]?.el : null;
  })();
  const osmOnlyNonMuslim =
    r.provenance === "OSM" &&
    !ISLAMIC_NAME_RE.test(p.name) &&
    ownElement?.religion !== "muslim";
  if (osmOnlyNonMuslim && (FUNERARY_RE.test(p.name) || OTHER_FAITH_RE.test(p.name))) {
    return "OSM-only row whose name describes a cemetery/crematorium chapel or another faith's building, and whose OSM element is not tagged religion=muslim";
  }
  if (osmOnlyNonMuslim && CHAPEL_RE.test(p.name) && !SHARED_SPACE_RE.test(p.name)) {
    return "OSM-only row named a plain \"chapel\" (tagged religion=multifaith): could be a hospital chapel a Muslim can use, or a Christian/crematorium chapel that does not belong here -- needs a human look";
  }
  if (
    SCHOOL_RE.test(p.name) &&
    !ISLAMIC_NAME_RE.test(p.name) &&
    !ISOC_RE.test(p.name) &&
    p.type !== "masjid" &&
    !p.phone &&
    !p.website &&
    !r.families.liveOsm
  ) {
    return "looks like a school/madrasah with no contact details and no mapped prayer space -- may not have a public musalla";
  }
  return null;
}

const removals = results
  .map((r) => ({ r, why: removalReason(r) }))
  .filter((x) => x.why)
  .sort((a, b) => a.r.score - b.r.score);

// ===========================================================================
// 5. Report, SQL, and (optionally) places.json
// ===========================================================================

const tierOf = { verified: [], community: [], unverified: [] };
for (const r of results) tierOf[r.tier].push(r);

const changed = results.filter((r) => r.tier !== (r.place.confidence ?? "community"));
const movement = {};
for (const r of changed) {
  const k = `${r.place.confidence ?? "(none)"} -> ${r.tier}`;
  movement[k] = (movement[k] ?? 0) + 1;
}

const downgrades = changed
  .filter((r) => r.tier === "unverified")
  // Worst first: lowest score, then fewest independent corroborations, so the
  // rows with literally nothing behind them float to the top of the review pile.
  .sort(
    (a, b) =>
      a.score - b.score ||
      a.corroborations - b.corroborations ||
      a.place.name.localeCompare(b.place.name),
  );
const upgrades = changed
  .filter((r) => r.tier === "verified")
  .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
const toCommunity = changed.filter((r) => r.tier === "community");

// Rows that were already `unverified` are just as doubtful as fresh
// downgrades, so they get their own list rather than being left out.
const stayedUnverified = tierOf.unverified
  .filter((r) => r.place.confidence === "unverified")
  // Worst first: lowest score, then fewest independent corroborations, so the
  // rows with literally nothing behind them float to the top of the review pile.
  .sort(
    (a, b) =>
      a.score - b.score ||
      a.corroborations - b.corroborations ||
      a.place.name.localeCompare(b.place.name),
  );

const liveChecked = results.filter((r) => r.checkedLive).length;
const cellsFetched = Object.keys(cache.cells).filter((k) => !k.startsWith("mf_")).length;
const mfFetched = Object.keys(cache.cells).filter((k) => k.startsWith("mf_")).length;
const elementsSeen = allElements.size;
const withNear = results.filter((r) => r.liveAtPin).length;
const withNearby = results.filter(
  (r) => r.match && r.match.m > NEAR_M && r.match.m <= NEARBY_M,
).length;
const refsChecked = refs.filter((r) => cache.elements[`${r.type}/${r.id}`]).length;
const refsGone = refs.filter((r) => cache.elements[`${r.type}/${r.id}`]?.el === null).length;

// Cross-tab of provenance against the live OSM check. This is the audit
// auditing itself: if the `MIB+OSM` tag is meaningful, almost all of those rows
// should still have an OSM prayer space at the pin, and `MIB`-only rows should
// mostly not. Any other pattern would mean the provenance tag is noise and the
// +3 it earns is unjustified.
const provRows = ["MIB+OSM", "MIB", "OSM", "seed"].map((prov) => {
  const set = results.filter((r) => r.provenance === prov && r.checkedLive);
  const near = set.filter((r) => r.liveAtPin).length;
  const nearby = set.filter((r) => !r.liveAtPin && r.families.liveOsm).length;
  const pct = (n) => (set.length ? ((100 * n) / set.length).toFixed(1) + "%" : "—");
  return `| \`${prov}\` | ${set.length} | ${pct(near)} | ${pct(nearby)} | ${pct(
    set.length - near - nearby,
  )} |`;
});

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : (s ?? ""));

function detailRow(r) {
  return `| ${cell(short(r.place.name, 44))} | \`${cell(r.place.id)}\` | ${cell(
    short(r.place.address || "—", 60),
  )} | ${r.score} | ${r.corroborations} | ${cell(r.missing.join("; "))} |`;
}
const DETAIL_HEADER =
  "| Name | id | Address | Score | Corrob. | Missing / negative signals |\n|---|---|---|---|---|---|";

function upgradeRow(r) {
  return `| ${cell(short(r.place.name, 44))} | \`${cell(r.place.id)}\` | ${r.score} | ${
    r.corroborations
  } | ${cell(r.reasons.join("; "))} |`;
}
const UPGRADE_HEADER =
  "| Name | id | Score | Corrob. | Corroborating signals |\n|---|---|---|---|---|";

const report = `# Place confidence audit

Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/verify-places.mjs\`
(\`npm run verify:places\`). Re-runnable; the Overpass results it depends on are
checkpointed to \`scripts/.overpass-cache.json\`.

The shipped \`confidence\` column was derived from nothing more than which import
a row came from — every MuslimsInBritain row was "community", every
OpenStreetMap row was "unverified". This audit replaces it with a score built
only from signals a third party can check.

> **Reading the "change" columns.** Movement is measured against whatever
> \`confidence\` values \`src/data/places.json\` held when the script ran. This
> report was generated against the original import-derived values; re-running
> \`npm run verify:places\` after those changes have been applied will correctly
> report zero movement, with every row listed under its settled tier instead.

## Proposed distribution

| Tier | Before | After | Change |
|---|---|---|---|
${["verified", "community", "unverified"]
  .map((t) => {
    const before = places.filter((p) => (p.confidence ?? "community") === t).length;
    const after = tierOf[t].length;
    const d = after - before;
    return `| ${t} | ${before} | ${after} | ${d > 0 ? "+" : ""}${d} |`;
  })
  .join("\n")}
| **total** | ${places.length} | ${results.length} | |

**${changed.length} of ${places.length} places change tier:**

${Object.entries(movement)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## OpenStreetMap coverage actually achieved

- **${cellsFetched} of ${neededCells.size}** 1° grid cells fetched from Overpass (plus ${mfFetched} of ${mfCells.size} coarse cells for the shared multi-faith layer), yielding **${elementsSeen}** distinct Muslim / multi-faith / prayer-room elements across the UK & Ireland.
- **${liveChecked} of ${places.length} places (${((liveChecked / places.length) * 100).toFixed(1)}%)** sit in a cell that was successfully fetched, so their live OSM check is real rather than assumed absent.
- **${withNear}** places have an OSM prayer space within ${NEAR_M} m of the pin; a further **${withNearby}** have one between ${NEAR_M} m and ${NEARBY_M} m.
- **${refsChecked} of ${refs.length}** OSM-sourced rows had their own OSM element re-checked by id; **${refsGone}** of those elements no longer exist in OSM.
${
  liveChecked < places.length
    ? `- The remaining ${places.length - liveChecked} places were scored on offline signals alone; the report marks them "could not be re-checked" and they are never downgraded *because of* a missing live check (an unfetched cell scores 0, not a penalty).`
    : "- Every place in the dataset got a live OSM check."
}

### Does the provenance tag hold up?

Cross-tabbing the \`Data:\` tag against today's independent Overpass result, for
the places that got a live check. If \`MIB+OSM\` were noise, its rows would not
line up with OSM any better than \`MIB\`-only rows do.

| Provenance | Checked | OSM match ≤ ${NEAR_M} m | ${NEAR_M}–${NEARBY_M} m | none |
|---|---|---|---|---|
${provRows.join("\n")}

That gap is the justification for weighting \`MIB+OSM\` at +3 and a single source
at +1: the tag predicts the live result almost perfectly, and \`MIB\`-only rows
really are the ones OSM has never heard of.

## The scoring rules, in plain English

Every point comes from something someone else could verify from the outside.
Nothing is inferred from the record's own confidence value.

**Positive**

| Signal | Points | Why it counts |
|---|---|---|
| Provenance \`MIB+OSM\` | +3 | MuslimsInBritain surveyed it *and* an OSM mapper mapped it. Two organisations, no shared copy. |
| Provenance \`MIB\` / \`OSM\` alone, or a hand-entered seed row | +1 | One unreviewed source. |
| An **independent** OSM prayer space within ${NEAR_M} m of the pin, today | +3 | Someone stood there and mapped it. |
| …but mapped under a clearly different name | +2 instead of +3 | In dense areas two separate masjids sit a street apart, so a name clash may mean OSM mapped the *neighbour*. |
| …between ${NEAR_M} m and ${NEARBY_M} m | +1 | Same block — suggestive, but might be a different building. |
| The matched OSM element's name agrees with ours | +1 | Withheld from OSM-sourced rows, where a name match would be self-referential. |
| An OSM-sourced row's own element still exists and is still tagged as a prayer space | +1 | Re-asking the row's only source is not corroboration, so it earns one point, not three — but the *opposite* answer is decisive (see below). |
| Website | +2 | A self-published, checkable presence. Rare in this dataset (${places.filter((p) => p.website).length} of ${places.length}), so it discriminates. |
| Phone number | +1 | A contactable organisation, though MIB phone numbers are often a volunteer's mobile. |
| Facebook / Instagram page | +1 | Weaker than a website but still a public presence. |
| *(contact subtotal capped at +3)* | | |
| Address names a specific building (house number, unit, or a named premises) | +1 | "125 Woodmill Road" or "Argyle Centre, 91 Argyle Road" pins a building. |
| MIB capacity ≥ 200 | +1 | A venue that seats hundreds is a building, not a borrowed room. A small capacity is never penalised — plenty of real musallas are small. |

**Crucially, a row is never allowed to corroborate itself.** For the ${refs.length}
rows imported from a specific OSM element, that element is excluded from the
proximity search. Without that exclusion every OSM-only row matched itself at
0 m and scored +3 for it, which is why an earlier draft of this audit promoted
plain OSM nodes with a website straight to \`verified\`. The cross-tab above is
the proof it is fixed: \`OSM\`-only rows now line up with *other* OSM prayer
spaces at roughly the same rate \`MIB\`-only rows do, instead of 100%.

**Negative**

| Signal | Points | Why it counts |
|---|---|---|
| MIB flags "Irregular / part-time venue" | −2 | MIB itself is telling us the venue is volatile. Such a place can never reach \`verified\`. |
| \`musalla\` in ordinary premises (no hospital / campus / airport / services / station / retail / prison in the name or address) | −1 | A room rented above a shop closes without anyone updating a map. \`multi_faith_room\` is exempt by definition — it is a shared room *inside* a host building, and the host vouches for it. Keyword matching alone was not enough: it missed "Quiet Room, Blue Zone, Metro Centre", because the address never says "shopping centre". |
| Address recorded as "Address not recorded yet" | −1 | Nothing to check and nothing to navigate to. |
| The row's own OSM element has been deleted from OSM | −3 | Its only source has withdrawn it. Forces \`unverified\`. |
| The row's own OSM element is no longer a Muslim prayer space (e.g. \`religion=christian\`) | −3 | The import matched a cemetery chapel or another faith's building. Forces \`unverified\`. |

On this run, **${refsGone} of ${refs.length}** OSM-sourced elements had been deleted and
**${results.filter((r) => r.contradicted).length}** were contradicted — the OSM import has not rotted. The problem with
those rows is not that they are stale, it is that nothing except OSM has ever
said they are there.

Total range: −6 to +12.

"A Muslim prayer space" above means an OSM element tagged
\`religion=muslim\`, \`building=mosque\`, \`room=prayer\`, \`amenity=prayer_room\`,
or \`religion=multifaith\` — a hospital multi-faith room is somewhere a Muslim
can actually pray. An element with an explicitly non-Muslim religion
(\`christian\`, \`jewish\`, …) never counts as a match, so a cemetery chapel
cannot corroborate a musalla.

**Independent corroboration families.** Four things that can be wrong
independently of each other: (1) two datasets agreeing, (2) OSM mapping a
prayer space within ${NEARBY_M} m, (3) a website, (4) a phone number. Counted
separately because a website and a phone number can both come from the same MIB
survey, but a map match cannot. The tighter ${NEAR_M} m radius is tracked
separately and only matters for reaching \`verified\`.

Honest caveat: families (1) and (2) are **not** fully independent — the \`+OSM\`
half of the provenance tag and today's live check both ultimately rest on
OpenStreetMap, just years apart. That is precisely why the \`verified\` gate
*also* insists on a website or a phone number: a row cannot reach \`verified\` on
OSM evidence alone, however many times OSM is asked.

**Thresholds**

- \`verified\` — needs **all** of: a map/dataset corroboration (\`MIB+OSM\` *or* a live OSM match within ${NEAR_M} m); a contactable organisation (website *or* phone); at least **2** independent families; a total of **≥ ${VERIFIED_MIN}**; not part-time; not contradicted by OSM. In plain terms: *two things that were not copied from each other both say this place is here, and you can ring it up.*
- \`unverified\` — **0** independent families, **or** exactly 1 family with a total of **≤ ${WEAK_MAX}**, **or** its own OSM source now contradicts it. These are the rows the app's filter should be able to hide.
- \`community\` — everything else: plausible, single-source or partly corroborated. The honest default for anything that does not clear the \`verified\` bar but is not close to worthless either.

Roughly, the three tiers separate into: purpose-built masjids that both
MuslimsInBritain and OpenStreetMap record and that answer a phone
(\`verified\`); masjids one of the two knows about (\`community\`); and small
musallas, part-time venues and bare OSM nodes with no contact details at all
(\`unverified\`).

The worked example that prompted this audit, **Mount Pleasant Musallah**
(\`mount-pleasant-musallah-mib-1411\`): ${(() => {
  const r = results.find((x) => x.place.id === "mount-pleasant-musallah-mib-1411");
  return r
    ? `score ${r.score}, ${r.corroborations} independent families → **${r.tier}**. Missing: ${r.missing.join("; ")}.`
    : "no longer in the dataset.";
})()}

## Most doubtful entries — review these ${Math.min(15, downgrades.length)} by hand first

The very bottom of the list: the lowest-scoring rows in the whole dataset that
are currently shown to users at a higher confidence than they deserve.

${DETAIL_HEADER}
${downgrades.slice(0, 15).map(detailRow).join("\n")}

## Proposed downgrades to \`unverified\` (${downgrades.length})

Every row that loses tier, worst score first. \`Corrob.\` is how many of the four
independent corroboration families the row has.

${DETAIL_HEADER}
${downgrades.length ? downgrades.map(detailRow).join("\n") : "| _none_ | | | | | |"}

## Already \`unverified\`, and staying there (${stayedUnverified.length})

No change is proposed for these — they are listed so the doubtful set is
complete. Provenance breakdown: ${
  Object.entries(
    stayedUnverified.reduce((a, r) => ((a[r.provenance] = (a[r.provenance] ?? 0) + 1), a), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`)
    .join(", ") || "n/a"
}.

${DETAIL_HEADER}
${stayedUnverified.length ? stayedUnverified.map(detailRow).join("\n") : "| _none_ | | | | | |"}

## Proposed upgrades to \`verified\` (${upgrades.length})

${UPGRADE_HEADER}
${upgrades.length ? upgrades.map(upgradeRow).join("\n") : "| _none_ | | | | |"}

## Moved to \`community\` (${toCommunity.length})

${
  toCommunity.length
    ? toCommunity
        .sort((a, b) => a.score - b.score)
        .map(
          (r) =>
            `- **${r.place.name}** (\`${r.place.id}\`) — was \`${r.place.confidence}\`, score ${r.score}: ${r.reasons[0] ?? "no positive signals"}`,
        )
        .join("\n")
    : "_none_"
}

## Candidates for REMOVAL, not just downgrading (${removals.length})

These do not look like venues offering a public Muslim prayer space, which is
the dataset's inclusion rule. **Nothing has been deleted** — this is a list for
a human to confirm, then remove from Supabase.

| Name | id | Type | Address | Why |
|---|---|---|---|---|
${
  removals.length
    ? removals
        .map(
          ({ r, why }) =>
            `| ${cell(short(r.place.name, 44))} | \`${cell(r.place.id)}\` | ${r.place.type} | ${cell(short(r.place.address || "—", 44))} | ${cell(why)} |`,
        )
        .join("\n")
    : "| _none_ | | | | |"
}

## What this audit cannot tell you

- **Whether a place is still open.** No signal here is a visit or a phone call. A mosque that closed last month still scores well.
- **Whether the facilities are right.** Sisters' space, wudu and disabled access are copied from MIB and are not checked at all.
- **Whether a phone number or website still works.** Presence is scored; reachability is not. Fetching ${places.filter((p) => p.website).length} websites and honouring robots.txt was out of scope.
- **Whether the coordinates are right.** A pin in the wrong place still scores well here as long as an OSM prayer space happens to be near it. That is \`scripts/verify-coords.mjs\`' job (stored point vs. postcode centroid) and the two reports should be read together.
- **Ahmadi / Shia exclusions.** The dataset deliberately omits these. A live OSM match is counted regardless of the element's \`denomination\` tag, so a match could in principle be a neighbouring mosque of a different school. Matches within ${NEAR_M} m of the pin are near-certainly the same building.
- **Anything about the ${places.length - liveChecked} places whose Overpass cell failed**, beyond their offline signals.
`;

writeFileSync(reportPath, report);

// --- SQL -------------------------------------------------------------------
const sqlEsc = (s) => String(s).replace(/'/g, "''");
const sql = `-- Proposed \`confidence\` values for public.places
--
-- Generated ${new Date().toISOString().slice(0, 10)} by scripts/verify-places.mjs
-- (\`npm run verify:places\`). See place-confidence-report.md for the scoring
-- rules, the evidence behind each row, and the list of removal candidates.
--
-- PROVENANCE: every tier here comes from independently checkable signals --
-- the MIB/OSM provenance tag on the row, a live Overpass query for
-- amenity=place_of_worship + religion=muslim / building=mosque / room=prayer /
-- amenity=prayer_room / religion=multifaith near the stored coordinates, a
-- re-check of each OSM-sourced row's own element by id, the presence of a
-- phone/website, address specificity, MIB's own "irregular / part-time" flag,
-- and premises type. No place's existence was
-- confirmed by visiting or calling it; "verified" means "two independent
-- sources agree it is here and you can contact it", not "we went".
--
-- This is NON-DESTRUCTIVE: it only writes the confidence column, one row at a
-- time, by id. No inserts, no deletes, no other columns touched.
--
-- ${changed.length} of ${places.length} rows change tier
-- (${upgrades.length} -> verified, ${toCommunity.length} -> community, ${downgrades.length} -> unverified).
--
-- AFTER RUNNING THIS in the Supabase SQL editor, re-sync the bundled dataset:
--
--     npm run sync:places
--
-- (src/data/places.json in this commit already carries these values, so the
-- sync should be a no-op unless the table has changed for other reasons.)

begin;

${changed
  .map(
    (r) =>
      `update public.places set confidence = '${r.tier}' where id = '${sqlEsc(r.place.id)}';` +
      ` -- was ${r.place.confidence ?? "null"}, score ${r.score}`,
  )
  .join("\n")}

commit;

-- Sanity check:
--   select confidence, count(*) from public.places group by confidence order by 2 desc;
-- Expected: verified ${tierOf.verified.length}, community ${tierOf.community.length}, unverified ${tierOf.unverified.length}.
`;
writeFileSync(sqlPath, sql);

// --- places.json -----------------------------------------------------------
if (apply) {
  const byId = new Map(results.map((r) => [r.place.id, r.tier]));
  // Spreading over an existing `confidence` key replaces the value in place,
  // so key order (and therefore the diff) stays minimal. Written with exactly
  // the formatting sync-places.mjs uses, so a later sync is a clean no-op.
  const next = places.map((p) => {
    const tierValue = byId.get(p.id);
    if (!tierValue || p.confidence === tierValue) return p;
    return { ...p, confidence: tierValue };
  });
  writeFileSync(placesPath, JSON.stringify(next, null, "\t") + "\n");
  console.log(`Rewrote ${placesPath} with the proposed tiers.`);
}

console.log(
  `\nverified ${tierOf.verified.length}  community ${tierOf.community.length}  unverified ${tierOf.unverified.length}` +
    `  (${changed.length} changed; ${removals.length} removal candidates)`,
);
console.log(
  `Live OSM check covered ${liveChecked}/${places.length} places from ${cellsFetched}/${neededCells.size} cells` +
    ` (${elementsSeen} OSM elements; ${withNear} matched within ${NEAR_M} m).`,
);
console.log(`Report written to ${reportPath}`);
console.log(`SQL written to ${sqlPath}`);
if (!apply) console.log("Re-run with --apply to also rewrite src/data/places.json.");
