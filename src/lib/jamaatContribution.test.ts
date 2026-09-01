import { describe, expect, it } from "vitest";
import { isoDate } from "./time";

import {
  buildConfirmationMessage,
  buildOutdatedMessage,
  buildTimesContributionMessage,
  canContributeJamaat,
  CONFIRM_COOLDOWN_DAYS,
  confirmStorageKey,
  shouldOfferConfirmation,
} from "./jamaatContribution";
import type { JamaatTimes, Place } from "@/data/places";

// NOT imported from ./feedback: that module imports react-native (Linking),
// which this node test environment cannot parse — the same constraint that
// keeps theme.ts free of runtime RN imports. The value mirrors the database
// CHECK constraint on submissions.message and MAX_MESSAGE_LENGTH in
// src/lib/feedback.ts; it cannot move without a migration.
const MAX_MESSAGE_LENGTH = 2000;

const JAMAAT: JamaatTimes = {
  fajr: "05:15",
  dhuhr: "13:30",
  maghrib: "20:45",
  isha: "22:00",
  source: "Website timetable, July 2026",
  recordedOn: "2026-07-01",
};

const NOW = new Date(2026, 7, 10, 22, 30); // 10 Aug 2026, local

describe("buildConfirmationMessage", () => {
  const msg = buildConfirmationMessage(JAMAAT, NOW);

  it("starts with the machine-scannable marker", () => {
    expect(msg.startsWith("[Jamaat confirmed]")).toBe(true);
  });

  it("restates exactly the times that were on screen", () => {
    expect(msg).toContain("fajr 05:15");
    expect(msg).toContain("dhuhr 13:30");
    expect(msg).toContain("maghrib 20:45");
    expect(msg).toContain("isha 22:00");
    // Asr is absent from this record and must not be invented.
    expect(msg).not.toContain("asr");
  });

  it("carries the check date and the data's own provenance", () => {
    expect(msg).toContain("2026-08-10");
    expect(msg).toContain("recorded 2026-07-01");
    expect(msg).toContain("Website timetable, July 2026");
  });

  it("fits the database's message cap with room to spare", () => {
    // `source` is the only unbounded field; even an absurd one must leave
    // the message under the CHECK constraint or the insert bounces.
    const bloated = { ...JAMAAT, source: "x".repeat(500) };
    expect(buildConfirmationMessage(bloated, NOW).length).toBeLessThan(
      MAX_MESSAGE_LENGTH,
    );
  });
});

describe("buildOutdatedMessage", () => {
  it("uses a distinct marker and flags the disagreement loudly", () => {
    const msg = buildOutdatedMessage(JAMAAT, NOW);
    expect(msg.startsWith("[Jamaat outdated]")).toBe(true);
    expect(msg).toContain("OUT OF DATE");
    expect(msg).toContain("fajr 05:15");
  });
});

describe("buildTimesContributionMessage", () => {
  it("prefixes the marker ahead of the topic prefix the form adds", () => {
    expect(
      buildTimesContributionMessage("[Masjid website or app] Fajr 6:00"),
    ).toBe("[Jamaat times] [Masjid website or app] Fajr 6:00");
  });
});

describe("shouldOfferConfirmation", () => {
  it("offers when never confirmed", () => {
    expect(shouldOfferConfirmation(null, NOW)).toBe(true);
  });

  it("suppresses within the cooldown and re-offers after it", () => {
    const recent = new Date(
      NOW.getTime() - (CONFIRM_COOLDOWN_DAYS - 1) * 86_400_000,
    ).toISOString();
    const stale = new Date(
      NOW.getTime() - (CONFIRM_COOLDOWN_DAYS + 1) * 86_400_000,
    ).toISOString();
    expect(shouldOfferConfirmation(recent, NOW)).toBe(false);
    expect(shouldOfferConfirmation(stale, NOW)).toBe(true);
  });

  it("treats garbage storage as never-confirmed", () => {
    expect(shouldOfferConfirmation("not a date", NOW)).toBe(true);
    expect(shouldOfferConfirmation("", NOW)).toBe(true);
  });
});

describe("canContributeJamaat", () => {
  const base = { jumuahOnly: undefined } as unknown as Place;
  it("allows ordinary places and refuses jumu'ah-only venues", () => {
    expect(canContributeJamaat(base)).toBe(true);
    expect(canContributeJamaat({ ...base, jumuahOnly: true } as Place)).toBe(
      false,
    );
  });
});

describe("helpers", () => {
  it("isoDate pads to YYYY-MM-DD", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("storage key is namespaced per place", () => {
    expect(confirmStorageKey("abc")).toBe("jamaatConfirmed:abc");
  });
});
