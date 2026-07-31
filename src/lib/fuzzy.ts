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
 * Bounded Levenshtein distance check (true if distance ≤ max). Classic
 * two-row DP with an early exit when the whole row exceeds max.
 */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] <= max;
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
 * True when every query token matches some text token. Tokens are expected
 * pre-computed via tokenize() for the text side (do it once per place, not
 * once per keystroke).
 */
export function fuzzyMatches(
  textTokens: readonly string[],
  query: string,
): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return true;
  return queryTokens.every((qt) =>
    textTokens.some((tt) => tokenMatches(tt, qt)),
  );
}
