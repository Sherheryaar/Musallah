// Display-time spacing cleanup for address strings, deliberately NOT a data
// fix: the place list is fetched live and regenerated from the source CSV on
// every sync (scripts/csv-to-places.mjs passes the column through as-is), so
// roughly half the rows arrive with a comma and no space after it
// ("Walthamstow,Waltham Forest") and a correction made in the data would be
// undone by the next import.

/**
 * Normalise the WHITESPACE of an address for display, and nothing else.
 *
 * Not a general tidier, on purpose: no title-casing, no punctuation
 * rewriting, no postcode reformatting. These strings are human-curated and
 * their wording, capitalisation and abbreviations are intentional — the only
 * thing wrong with them is the missing space.
 */
export function formatAddress(address: string): string {
  return (
    address
      // A handful of rows have the opposite problem ("Hayes , UB3"). Done
      // before the next step so the comma is then treated as spaced already.
      .replace(/\s+,/g, ",")
      // The lookahead means a trailing comma never gains a trailing space.
      .replace(/,(?=\S)/g, ", ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
