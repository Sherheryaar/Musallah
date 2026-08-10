import { describe, expect, it } from "vitest";

import {
  applyFacilityDefaults,
  cleanAddress,
  cleanNotes,
  disambiguateName,
  FACILITY_KEYS,
  FacilityKey,
  Place,
  placesEqual,
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

describe("cleanAddress", () => {
  it("strips a placeholder segment left by a blank CSV column (real dataset examples)", () => {
    expect(cleanAddress("17 Wellington Road, n/a, Tipton,Sandwell, DY4 8RS")).toBe(
      "17 Wellington Road, Tipton,Sandwell, DY4 8RS",
    );
    expect(cleanAddress("246 Bow Road, not known, Bow,Tower Hamlets, E3 3AP")).toBe(
      "246 Bow Road, Bow,Tower Hamlets, E3 3AP",
    );
    expect(
      cleanAddress("3 Sherwood Ave, Abbeyquarter, Ballyhaunis,None until 2015"),
    ).toBe("3 Sherwood Ave, Abbeyquarter, Ballyhaunis");
  });

  it("strips a stray international dialling code", () => {
    expect(cleanAddress("Kesh Road, +353, Gortnakesh,Cavan,")).toBe(
      "Kesh Road, Gortnakesh,Cavan",
    );
  });

  it("collapses an empty segment left by a blank line-2 field", () => {
    expect(
      cleanAddress(
        "King George VI Building, University of Newcastle upon Tyne, , Newcastle upon Tyne, NE1 7RU",
      ),
    ).toBe(
      "King George VI Building, University of Newcastle upon Tyne, Newcastle upon Tyne, NE1 7RU",
    );
  });

  it("leaves normal addresses, including inconsistent comma spacing, untouched", () => {
    expect(cleanAddress("9 Roundel Street, Darnall,Sheffield, S9 3LE")).toBe(
      "9 Roundel Street, Darnall,Sheffield, S9 3LE",
    );
  });
});

describe("placesEqual", () => {
  /**
   * Every optional field populated. The point of a fully-populated fixture is
   * the "notices a change to any field" test below: it walks these keys, so a
   * field left out here is a field the test cannot police.
   */
  const full = (): Place => ({
    id: "abc",
    name: "Central Masjid",
    type: "masjid",
    address: "1 High Street, Leeds, LS1 1AA",
    lat: 53.8008,
    lng: -1.5491,
    facilities: {
      sistersSpace: true,
      wudu: true,
      disabledAccess: false,
      parking: true,
      jumuah: true,
      janazah: false,
    },
    jumuahOnly: true,
    jumuahTimes: ["13:00", "13:45"],
    jamaat: {
      fajr: "05:15",
      dhuhr: "13:30",
      asr: "17:00",
      maghrib: "20:45",
      isha: "22:00",
      source: "Website timetable",
      recordedOn: "2026-07-01",
    },
    notes: "Enter from the rear",
    lastVerified: "2026-07-02",
    source: "Phone call",
    phone: "0113 000 0000",
    website: "https://example.org",
    facebook: "https://facebook.com/example",
    instagram: "https://instagram.com/example",
    confidence: "verified",
  });

  it("treats structurally identical datasets as equal", () => {
    expect(placesEqual([full()], [full()])).toBe(true);
    expect(placesEqual([], [])).toBe(true);
  });

  it("notices length and ordering differences", () => {
    const a = full();
    const b = { ...full(), id: "def" };
    expect(placesEqual([a], [a, b])).toBe(false);
    expect(placesEqual([a, b], [b, a])).toBe(false);
  });

  // The guard that makes this function safe to extend: adding a field to
  // `Place` without adding it to placeEqual fails here.
  it("notices a change to any field", () => {
    const changed: Record<string, unknown> = {
      id: "other",
      name: "Other name",
      type: "musalla",
      address: "2 Low Street",
      lat: 53.9,
      lng: -1.6,
      jumuahOnly: undefined,
      jumuahTimes: ["13:00"],
      notes: "Different note",
      lastVerified: "2026-08-01",
      source: "Visit",
      phone: "0113 111 1111",
      website: "https://other.example",
      facebook: undefined,
      instagram: "https://instagram.com/other",
      confidence: "unverified",
    };
    for (const [key, value] of Object.entries(changed)) {
      const mutated = { ...full(), [key]: value } as Place;
      expect(placesEqual([full()], [mutated]), `field ${key}`).toBe(false);
    }

    for (const key of FACILITY_KEYS) {
      const mutated = full();
      mutated.facilities = {
        ...mutated.facilities,
        [key]: !mutated.facilities[key],
      };
      expect(placesEqual([full()], [mutated]), `facility ${key}`).toBe(false);
    }

    // jamaat is a nested object, so each of ITS fields needs the same check —
    // a stale jamaat time is the most consequential thing this could miss.
    const jamaatFields = Object.keys(full().jamaat!) as Array<
      keyof NonNullable<Place["jamaat"]>
    >;
    for (const key of jamaatFields) {
      const mutated = full();
      mutated.jamaat = { ...mutated.jamaat!, [key]: "changed" };
      expect(placesEqual([full()], [mutated]), `jamaat ${key}`).toBe(false);
    }
    const withoutJamaat = full();
    delete withoutJamaat.jamaat;
    expect(placesEqual([full()], [withoutJamaat])).toBe(false);
  });

  it("covers every key of Place", () => {
    // Belt and braces for the loop above: if `Place` grows a field, this
    // fails until the fixture (and therefore the mutation test) includes it.
    expect(Object.keys(full()).sort()).toEqual(
      [
        "address",
        "confidence",
        "facebook",
        "facilities",
        "id",
        "instagram",
        "jamaat",
        "jumuahOnly",
        "jumuahTimes",
        "lastVerified",
        "lat",
        "lng",
        "name",
        "notes",
        "phone",
        "source",
        "type",
        "website",
      ].sort(),
    );
  });
});
