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

  it("keeps the boolean filter flags, including false", () => {
    // `false` is a real stored choice, not an absent one: the user who turns
    // a filter OFF must not have it silently re-enabled by a later default.
    expect(
      sanitizeSettings({ savedOnly: false, corroboratedOnly: true }),
    ).toEqual({ savedOnly: false, corroboratedOnly: true });
  });

  it("accepts the three theme values and rejects anything else", () => {
    expect(sanitizeSettings({ theme: "dark" })).toEqual({ theme: "dark" });
    expect(sanitizeSettings({ theme: "light" })).toEqual({ theme: "light" });
    expect(sanitizeSettings({ theme: "system" })).toEqual({ theme: "system" });
    expect(sanitizeSettings({ theme: "midnight" })).toEqual({});
    expect(sanitizeSettings({ savedOnly: "yes" })).toEqual({});
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

  it("never carries post-v1 fields out of a v1 blob", () => {
    // savedOnly, theme, corroboratedOnly and hapticFeedback all postdate v1,
    // so anything claiming to hold one is not a v1 choice — the current
    // default must win instead.
    const migrated = migrateV1Settings({
      madhab: "hanafi",
      savedOnly: true,
      theme: "dark",
      corroboratedOnly: true,
      hapticFeedback: false,
    });
    expect(migrated).toEqual({ madhab: "hanafi" });
  });
});
