import { describe, expect, it } from "vitest";

import { comparePostcodes, outwardOf, postcodeOf } from "./identity.mjs";

describe("postcodeOf", () => {
  it("reads a full postcode out of a free-text address", () => {
    expect(postcodeOf("Thornhill Road, Thornhill Lees,Kirklees, WF12 9BX")).toBe(
      "WF129BX",
    );
  });

  it("normalises spacing and case", () => {
    expect(postcodeOf("12 Example St, e14 8ae")).toBe("E148AE");
    expect(postcodeOf("SW9  7PH")).toBe("SW97PH");
  });

  it("handles every UK outward-code shape", () => {
    expect(postcodeOf("M1 3DJ")).toBe("M13DJ"); // A9
    expect(postcodeOf("B66 3SB")).toBe("B663SB"); // A99
    expect(postcodeOf("EH48 1HE")).toBe("EH481HE"); // AA99
    expect(postcodeOf("W13 0SQ")).toBe("W130SQ"); // A99 with 0
    expect(postcodeOf("EC1A 1BB")).toBe("EC1A1BB"); // AA9A
  });

  it("returns null when there is no full postcode", () => {
    // An outward code alone is not enough to identify a building, so it must
    // not be reported as a postcode at all.
    expect(postcodeOf("Somewhere in BD8")).toBeNull();
    expect(postcodeOf("no postcode here")).toBeNull();
    expect(postcodeOf("")).toBeNull();
    expect(postcodeOf(null)).toBeNull();
    expect(postcodeOf(undefined)).toBeNull();
  });
});

describe("outwardOf", () => {
  it("returns the postal district only", () => {
    expect(outwardOf("Bradford BD8 7PD")).toBe("BD8");
    expect(outwardOf("London EC1A 1BB")).toBe("EC1A");
    expect(outwardOf("no postcode")).toBeNull();
  });
});

describe("comparePostcodes", () => {
  it("agrees on the same building despite unrelated names", () => {
    // The real pair this was built for: same postcode, two names.
    expect(
      comparePostcodes("Bangladeshi Cultural Centre, London E14 8AE", "E14 8AE"),
    ).toBe("agree");
  });

  it("calls a same-district, different-unit difference noise, not a mismatch", () => {
    // Harlow Islamic Centre, recorded 4 m apart by two datasets under
    // neighbouring unit codes. Vetoing this would demote a correct link.
    expect(comparePostcodes("Harlow CM19 4QT", "Harlow CM19 4QX")).toBe(
      "differ-unit",
    );
    // Masjid-e-Qubah vs Masjid Quba, 9 m apart with near-identical names and
    // genuinely two mosques: same district, so the postcode cannot settle it
    // either way and the match stays held on the strength of the names.
    expect(comparePostcodes("Bradford BD8 7PD", "Bradford BD8 7LA")).toBe(
      "differ-unit",
    );
  });

  it("flags a different postal district as evidence against a match", () => {
    // The one genuinely wrong link the registry audit turned up.
    expect(comparePostcodes("Bradford BD9 4HN", "Bradford BD18 2DR")).toBe(
      "differ-district",
    );
  });

  it("reports unknown rather than guessing when either side lacks one", () => {
    expect(comparePostcodes("E14 8AE", "no postcode")).toBe("unknown");
    expect(comparePostcodes("no postcode", "E14 8AE")).toBe("unknown");
    expect(comparePostcodes(null, null)).toBe("unknown");
  });
});
