import { describe, expect, it } from "vitest";

import {
  applyFacilityDefaults,
  cleanNotes,
  disambiguateName,
  FACILITY_KEYS,
  FacilityKey,
} from "./places";

const noFacilities = () =>
  Object.fromEntries(FACILITY_KEYS.map((k) => [k, false])) as Record<
    FacilityKey,
    boolean
  >;

describe("disambiguateName", () => {
  it("appends the venue for generic names (real dataset examples)", () => {
    expect(
      disambiguateName(
        "Prayer Room",
        "Chapel, Glenfield Hospital, Groby Road, City of Leicester, LE3 9QP",
      ),
    ).toBe("Prayer Room (Glenfield Hospital)");
    expect(
      disambiguateName(
        "Multi-faith room",
        "Selfridges, 400 Oxford Street, City of Westminster, W1A 1AB",
      ),
    ).toBe("Multi-faith room (Selfridges)");
    expect(
      disambiguateName(
        "Faith Room",
        "Natural History Museum, Cromwell Road, South Kensington,Kensington and Chelsea, SW7 5BD",
      ),
    ).toBe("Faith Room (Natural History Museum)");
  });

  it("prefers venue-sounding segments over floors and cabins", () => {
    expect(
      disambiguateName(
        "Prayer Room",
        "Portakabin, Pymmes Building Garden, North Middlesex Hospital, Edmonton,Enfield, N18 1QX",
      ),
    ).toBe("Prayer Room (North Middlesex Hospital)");
    expect(
      disambiguateName(
        "Muslim Prayer Room",
        "First Floor, Birmingham Children’s Hospital, Steelhouse Lane, Birmingham, Ladywood, B4 6NH",
      ),
    ).toBe("Muslim Prayer Room (Birmingham Children’s Hospital)");
  });

  it("leaves proper names alone", () => {
    expect(
      disambiguateName("East London Mosque", "82-92 Whitechapel Rd, London"),
    ).toBe("East London Mosque");
    expect(
      disambiguateName("Lewisham Islamic Centre", "363 Lewisham High St"),
    ).toBe("Lewisham Islamic Centre");
  });

  it("is idempotent (already-disambiguated names pass through)", () => {
    const once = disambiguateName(
      "Prayer Room",
      "Leicester General Hospital, Gwendolen Road, City of Leicester, LE5 4PW",
    );
    expect(disambiguateName(once, "Leicester General Hospital, ...")).toBe(
      once,
    );
  });

  it("leaves names alone when the address is unusable", () => {
    expect(disambiguateName("Prayer Room", "")).toBe("Prayer Room");
    expect(disambiguateName("Faith Room", "Address not recorded yet")).toBe(
      "Faith Room",
    );
  });
});

describe("applyFacilityDefaults", () => {
  it("a masjid always has jumu'ah and wudu", () => {
    const result = applyFacilityDefaults("masjid", noFacilities());
    expect(result.jumuah).toBe(true);
    expect(result.wudu).toBe(true);
    // Nothing else is assumed.
    expect(result.sistersSpace).toBe(false);
    expect(result.parking).toBe(false);
    expect(result.disabledAccess).toBe(false);
    expect(result.janazah).toBe(false);
  });

  it("never assumes anything for other place types", () => {
    expect(applyFacilityDefaults("musalla", noFacilities()).wudu).toBe(false);
    expect(
      applyFacilityDefaults("multi_faith_room", noFacilities()).jumuah,
    ).toBe(false);
  });
});

describe("cleanNotes", () => {
  it("strips data-source tags, capacity, and denomination", () => {
    // Denomination stays in the data but is never displayed — sectarian
    // labels upset people and help nobody find a place to pray.
    expect(
      cleanNotes(
        "Capacity ~700 (MuslimsInBritain.org); Denomination: Deobandi; Data: MIB+OSM (mib-2203)",
      ),
    ).toBeUndefined();
  });

  it("keeps other segments while stripping denomination", () => {
    expect(
      cleanNotes("Denomination: Barelvi; Entrance on the side street"),
    ).toBe("Entrance on the side street");
  });

  it("rewrites irregular-venue flags in plain English", () => {
    expect(
      cleanNotes("Irregular / part-time venue per MIB; Data: MIB (mib-344)"),
    ).toBe("May be an irregular or part-time venue — check before travelling");
  });

  it("returns undefined when nothing user-relevant remains", () => {
    expect(cleanNotes("Data: OSM (node/4751291621)")).toBeUndefined();
  });

  it("keeps genuinely useful notes untouched", () => {
    expect(
      cleanNotes(
        "One of the largest mosques in the UK. Sisters' entrance via the London Muslim Centre.",
      ),
    ).toBe(
      "One of the largest mosques in the UK. Sisters' entrance via the London Muslim Centre.",
    );
  });
});
