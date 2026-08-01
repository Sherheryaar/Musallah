import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFS,
  IOS_PENDING_LIMIT,
  MAX_PLANNED,
  needsReschedule,
  planNotifications,
  prefsFingerprint,
  type NotificationPrefs,
} from "./notificationPlan";

const LONDON = { lat: 51.5074, lng: -0.1278 };
const NOW = new Date("2026-08-01T10:00:00");

const enabled: NotificationPrefs = {
  ...DEFAULT_NOTIFICATION_PREFS,
  enabled: true,
};

describe("planNotifications", () => {
  it("plans nothing when disabled (the default)", () => {
    expect(
      planNotifications(LONDON.lat, LONDON.lng, {}, DEFAULT_NOTIFICATION_PREFS, NOW),
    ).toEqual([]);
    expect(DEFAULT_NOTIFICATION_PREFS.enabled).toBe(false); // opt-in stays opt-in
  });

  it("fills the window but never exceeds the iOS budget", () => {
    const plan = planNotifications(LONDON.lat, LONDON.lng, {}, enabled, NOW);
    expect(plan.length).toBe(MAX_PLANNED);
    expect(MAX_PLANNED).toBeLessThan(IOS_PENDING_LIMIT);
  });

  it("plans only the future, in order, with no duplicates", () => {
    const plan = planNotifications(LONDON.lat, LONDON.lng, {}, enabled, NOW);
    expect(plan.every((p) => p.fireAt.getTime() > NOW.getTime())).toBe(true);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].fireAt.getTime()).toBeGreaterThanOrEqual(
        plan[i - 1].fireAt.getTime(),
      );
    }
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
  });

  it("skips prayers already past today", () => {
    // 10:00 London on Aug 1: Fajr (~03:50) already gone, Dhuhr (~13:07) not.
    const plan = planNotifications(LONDON.lat, LONDON.lng, {}, enabled, NOW);
    const today = plan.filter((p) => p.id.includes("2026-08-01"));
    expect(today.some((p) => p.prayer === "fajr")).toBe(false);
    expect(today.some((p) => p.prayer === "dhuhr")).toBe(true);
  });

  it("respects the per-prayer selection", () => {
    const fajrOnly = {
      ...enabled,
      prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false },
    };
    const plan = planNotifications(LONDON.lat, LONDON.lng, {}, fajrOnly, NOW);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((p) => p.prayer === "fajr")).toBe(true);
  });

  it("fires early when minutesBefore is set, and says so", () => {
    const early = { ...enabled, minutesBefore: 15 };
    const plan = planNotifications(LONDON.lat, LONDON.lng, {}, early, NOW);
    const first = plan[0];
    expect(first.prayerAt.getTime() - first.fireAt.getTime()).toBe(15 * 60_000);
    expect(first.title).toMatch(/in 15 min/);
    expect(first.body).toMatch(/begins at \d{2}:\d{2}/);
  });

  it("follows the madhab: later Asr for hanafi", () => {
    const shafi = planNotifications(
      LONDON.lat, LONDON.lng, { madhab: "shafi" }, enabled, NOW,
    ).find((p) => p.prayer === "asr")!;
    const hanafi = planNotifications(
      LONDON.lat, LONDON.lng, { madhab: "hanafi" }, enabled, NOW,
    ).find((p) => p.prayer === "asr")!;
    expect(hanafi.prayerAt.getTime()).toBeGreaterThan(shafi.prayerAt.getTime());
  });
});

describe("needsReschedule", () => {
  const base = {
    lastScheduledAt: NOW.getTime() - 60_000,
    lastLat: LONDON.lat,
    lastLng: LONDON.lng,
    lastPrefsFingerprint: "fp",
    now: NOW,
    lat: LONDON.lat,
    lng: LONDON.lng,
    prefsFingerprint: "fp",
  };

  it("does not thrash when nothing changed", () => {
    expect(needsReschedule(base)).toBe(false);
  });

  it("reschedules on first run, pref changes, staleness, and travel", () => {
    expect(needsReschedule({ ...base, lastScheduledAt: null })).toBe(true);
    expect(needsReschedule({ ...base, prefsFingerprint: "fp2" })).toBe(true);
    expect(
      needsReschedule({
        ...base,
        lastScheduledAt: NOW.getTime() - 8 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(true);
    // Londoner visiting Birmingham (~1.6° west): times shift ~7 minutes.
    expect(needsReschedule({ ...base, lng: -1.89 })).toBe(true);
    // Walking across town must NOT reschedule.
    expect(needsReschedule({ ...base, lat: LONDON.lat + 0.01 })).toBe(false);
  });
});

describe("prefsFingerprint", () => {
  it("changes when any relevant input changes, and only then", () => {
    const a = prefsFingerprint(enabled, { madhab: "hanafi" });
    expect(prefsFingerprint(enabled, { madhab: "hanafi" })).toBe(a);
    expect(prefsFingerprint(enabled, { madhab: "shafi" })).not.toBe(a);
    expect(
      prefsFingerprint({ ...enabled, minutesBefore: 10 }, { madhab: "hanafi" }),
    ).not.toBe(a);
    expect(
      prefsFingerprint(
        { ...enabled, prayers: { ...enabled.prayers, fajr: false } },
        { madhab: "hanafi" },
      ),
    ).not.toBe(a);
  });
});
