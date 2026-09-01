// Typo-tolerant search over place names and addresses, tuned for this
// domain: transliterated Arabic words have no single "correct" spelling
// (masjid/masjed, jamia/jamiya, musalla/mussallah), and users type on
// phones. Pure functions, no dependencies — fast enough to run on every
// keystroke over a few thousand places.

/**
 * Spelling variants folded to one canonical token, so "mosque" finds
 * "Masjid" and "musallah" finds "Musalla".
 */
const SYNONYMS: Record<string, string> = {
  mosque: "masjid",
  mosques: "masjid",
  masjed: "masjid",
  masjids: "masjid",
  mesjid: "masjid",
  musala: "musalla",
  musallah: "musalla",
  mussalla: "musalla",
  mussallah: "musalla",
  mussala: "musalla",
  center: "centre",
  centers: "centre",
  centres: "centre",
  jummah: "jumuah",
  jumma: "jumuah",
  juma: "jumuah",
  jumah: "jumuah",
};

/** Lowercase, strip accents/apostrophes/punctuation, split, fold synonyms. */
export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Apostrophes JOIN ("jumu'ah" → "jumuah", "mary's" → "marys") — they
      // must not split words like other punctuation does.
      .replace(/['’ʻ`]/g, "")
      .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((token) => SYNONYMS[token] ?? token)
  );
}

/**
 * Scratch rows for the DP below, allocated once.
 *
 * A single keystroke compares this many token pairs across the whole dataset:
 * roughly six tokens per place over a few thousand places. Two fresh arrays
 * per call meant tens of thousands of short-lived allocations per keystroke,
 * all of them the same couple of dozen slots.
 *
 * Module-level state is safe here because JavaScript is single-threaded and
 * withinEditDistance neither recurses nor awaits, so no second caller can be
 * mid-comparison. The buffers grow on demand and are never shrunk; the widest
 * token seen bounds them, which for place names is a few dozen characters.
 */
let dpPrev = new Int32Array(64);
let dpCurr = new Int32Array(64);

/**
 * Bounded Levenshtein distance check (true if distance ≤ max). Classic
 * two-row DP with an early exit when the whole row exceeds max.
 */
function withinEditDistance(a: string, b: string, max: number): boolean {
  const bLen = b.length;
  if (Math.abs(a.length - bLen) > max) return false;
  if (dpPrev.length < bLen + 1) {
    dpPrev = new Int32Array(bLen + 1);
    dpCurr = new Int32Array(bLen + 1);
  }
  let prev = dpPrev;
  let curr = dpCurr;
  for (let j = 0; j <= bLen; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      const substitute = prev[j - 1] + cost;
      const insert = curr[j - 1] + 1;
      const remove = prev[j] + 1;
      let best = substitute < insert ? substitute : insert;
      if (remove < best) best = remove;
      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > max) return false;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[bLen] <= max;
}

/**
 * Does one text token satisfy one query token? Prefix match first (covers
 * mid-typing), then substring for longer queries, then a typo budget that
 * scales with length: 1 edit for 4–7 letters, 2 edits for 8+. Short tokens
 * get no fuzz — "st" must not match "sw".
 */
function tokenMatches(textToken: string, queryToken: string): boolean {
  if (textToken.startsWith(queryToken)) return true;
  if (queryToken.length >= 4 && textToken.includes(queryToken)) return true;
  const max = queryToken.length >= 8 ? 2 : queryToken.length >= 4 ? 1 : 0;
  if (max === 0) return false;
  return withinEditDistance(queryToken, textToken, max);
}

/**
 * True when every query token matches some text token. BOTH sides are
 * pre-tokenised: the text side once per place, and the query side once per
 * keystroke — never once per place per keystroke.
 */
export function fuzzyMatchesTokens(
  textTokens: readonly string[],
  queryTokens: readonly string[],
): boolean {
  if (queryTokens.length === 0) return true;
  for (const qt of queryTokens) {
    let found = false;
    for (const tt of textTokens) {
      if (tokenMatches(tt, qt)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** Convenience wrapper for one-off checks and tests. */
export function fuzzyMatches(
  textTokens: readonly string[],
  query: string,
): boolean {
  return fuzzyMatchesTokens(textTokens, tokenize(query));
}
