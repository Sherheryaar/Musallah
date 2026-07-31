import { describe, expect, it } from "vitest";

import { migrateV1Settings, sanitizeSettings } from "./settingsStorage";

describe("sanitizeSettings", () => {
  it("keeps only well-formed fields", () => {
    expect(
      sanitizeSettings({
        method: "mwl",
        madhab: "banana",
        shafaq: "ahmer",
        facilityFilters: ["wudu", "notAFacility"],
      }),
    ).toEqual({
      method: "mwl",
      shafaq: "ahmer",
      facilityFilters: ["wudu"],
    });
  });

  it("survives garbage", () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings("not an object")).toEqual({});
    expect(sanitizeSettings(42)).toEqual({});
  });
});

describe("migrateV1Settings", () => {
  it("drops values equal to the v1 defaults (indistinguishable from untouched)", () => {
    // The exact blob a pre-hanafi-default install saved after the user
    // toggled a facility filter: whole object, old shafi default included.
    const migrated = migrateV1Settings({
      method: "moonsighting",
      madhab: "shafi",
      shafaq: "general",
      facilityFilters: ["sistersSpace"],
    });
    // madhab is dropped, so the new hanafi default applies...
    expect(migrated.madhab).toBeUndefined();
    expect(migrated.method).toBeUndefined();
    expect(migrated.shafaq).toBeUndefined();
    // ...but a filter choice is always deliberate and survives.
    expect(migrated.facilityFilters).toEqual(["sistersSpace"]);
  });

  it("keeps values that differ from the v1 defaults (deliberate choices)", () => {
    expect(
      migrateV1Settings({
        method: "mwl",
        madhab: "hanafi",
        shafaq: "abyad",
        facilityFilters: [],
      }),
    ).toEqual({ method: "mwl", madhab: "hanafi", shafaq: "abyad" });
  });
});
