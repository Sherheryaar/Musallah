// Identity evidence for matching a third-party directory record to one of our
// places. Shared by the aggregator harvests (currently scripts/harvest-sirat.mjs).
//
// WHY THIS EXISTS: the harvests started with two signals — distance and
// name-token overlap — and both are weaker than they look.
//
//   * distance alone is not identity: in dense areas two different mosques
//     genuinely sit metres apart.
//   * a shared name token is not identity either, and fails in BOTH
//     directions. It false-positives on town names ("Banbury Makkah Masjid"
//     vs "Banbury Sheikh Bin Baaz Masjid" — see harvest-sirat.mjs), and it
//     false-negatives on every mosque known by two names, which is extremely
//     common: "Bangladeshi Cultural Centre" and "Limehouse Masjid" are the
//     same building, and no amount of fuzzy string matching will ever say so.
//
// A FULL UK POSTCODE is a third, independent signal that beats both. It
// covers roughly 15 adjacent addresses, so postcode agreement plus a sub-60m
// gap is strong evidence of one building — and unlike a name it cannot be
// talked into a match by a shared town.
//
// It also correctly REFUSES matches that fuzzy names would accept: our
// "Masjid-e-Qubah" (BD8 7PD) and Sirat's "Masjid Quba" (BD8 7LA) are 9 m
// apart with near-identical names, and are two different mosques. Any
// transliteration-tolerant name matcher links those; the postcode does not.
// That is the reason this file exists rather than a cleverer name matcher.

const POSTCODE = /\b([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})\b/i;

/**
 * A full UK postcode (outward + inward), normalised to uppercase with no
 * space, or null if the text has no full postcode in it.
 *
 * Deliberately only full postcodes. An outward code alone ("BD8") spans a
 * whole district and thousands of addresses, so treating that as agreement
 * would re-introduce exactly the false positives above.
 */
export function postcodeOf(text) {
  const match = POSTCODE.exec(String(text ?? ""));
  return match ? `${match[1]}${match[2]}`.toUpperCase() : null;
}

/** Just the outward code ("BD8" of "BD8 7PD") — the postal district. */
export function outwardOf(text) {
  const match = POSTCODE.exec(String(text ?? ""));
  return match ? match[1].toUpperCase() : null;
}

/**
 * Compares the postcodes of two free-text addresses.
 *
 * FOUR outcomes, and the split between the two "differ" cases is the whole
 * point. An audit of the 362 links already registered found 38 whose
 * postcodes disagreed, and 37 of those were plainly the same mosque —
 * "Harlow Islamic Centre" at CM19 4QT and CM19 4QX, 4 m apart, same name.
 * Two datasets routinely record neighbouring unit codes for one building
 * (a large site can span several, or one side used the unit next door), so
 * an inward-code difference is NOISE and must not veto anything.
 *
 * A different outward code is a different postal district, which is real
 * evidence of a different building. The one link in that audit that
 * disagreed at outward level (BD9 4HN vs BD18 2DR) was indeed wrong: that
 * Sirat record was registered to two of our places at once.
 *
 *   "agree"           same full postcode — strong evidence of one building
 *   "differ-unit"     same district, different unit — no evidence either way
 *   "differ-district" different district — evidence AGAINST a match
 *   "unknown"         at least one address has no full postcode
 */
export function comparePostcodes(addressA, addressB) {
  const a = postcodeOf(addressA);
  const b = postcodeOf(addressB);
  if (!a || !b) return "unknown";
  if (a === b) return "agree";
  return outwardOf(addressA) === outwardOf(addressB)
    ? "differ-unit"
    : "differ-district";
}
