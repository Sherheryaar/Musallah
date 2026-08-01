// On-device prayer time calculation — no network, no API.
//
// Astronomy: the praytimes.org solar equations (simplified from Jean Meeus,
// "Astronomical Algorithms" — the reference recommended by the US Naval
// Observatory), the same approach used by the open-source `adhan` library
// that powers most respected prayer apps.
//
// Fajr & Isha:
// - "moonsighting" (default): Moonsighting Committee Worldwide method by
//   Sh. Khalid Shaukat (moonsighting.com) — the method apps like Pillars
//   offer, and the recommended one for the UK. Instead of fixed twilight
//   angles it uses seasonally adjusted Subh Sadiq / Shafaq rules, because
//   at London's latitude the sun never reaches 18° below the horizon in
//   midsummer and fixed-angle methods break down. Above 55° latitude it
//   falls back to the 1/7-of-night rule, per the method's spec.
// - "mwl": Muslim World League (18°/17°) with an angle-based high-latitude
//   fallback, kept for comparison/user preference.

export type Madhab = "shafi" | "hanafi";
export type Shafaq = "general" | "ahmer" | "abyad";
export type CalculationMethodKey = "moonsighting" | "mwl";

export type CalcOptions = {
  /** Fajr/Isha rule set. Default "moonsighting" (recommended for the UK). */
  method?: CalculationMethodKey;
  /** Asr shadow factor: "shafi" (1x, also Maliki/Hanbali) or "hanafi" (2x). */
  madhab?: Madhab;
  /** Moonsighting Isha twilight: "general" (default, best ≤55°), "ahmer", "abyad". */
  shafaq?: Shafaq;
};

export type CalcDate = { year: number; month: number; day: number };

/** Event times as fractional hours UTC on the given calendar date. */
export type PrayerTimesUtcHours = {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
};

// ---------------------------------------------------------------------------
// Degree-based trig helpers
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const sin = (d: number) => Math.sin(d * DEG);
const cos = (d: number) => Math.cos(d * DEG);
const tan = (d: number) => Math.tan(d * DEG);
const arccos = (x: number) => Math.acos(x) / DEG;
const arcsin = (x: number) => Math.asin(x) / DEG;
const arccot = (x: number) => Math.atan2(1, x) / DEG;
const arctan2 = (y: number, x: number) => Math.atan2(y, x) / DEG;

const fixAngle = (a: number) => a - 360 * Math.floor(a / 360);
const fixHour = (h: number) => h - 24 * Math.floor(h / 24);

// ---------------------------------------------------------------------------
// Solar position (praytimes.org / Meeus simplified)
// ---------------------------------------------------------------------------

/**
 * Julian date at 00:00 UT for a calendar date. Exported so the qibla
 * screen can reuse this verified solar model for sun-based alignment
 * instead of duplicating (and risking divergence from) the ephemeris math.
 */
export function julianDate(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    b -
    1524.5
  );
}

/** Sun declination (deg) and equation of time (hours) at a julian date. */
export function sunPosition(jd: number): {
  declination: number;
  equationOfTime: number;
} {
  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d); // mean anomaly
  const q = fixAngle(280.459 + 0.98564736 * d); // mean longitude
  const L = fixAngle(q + 1.915 * sin(g) + 0.02 * sin(2 * g)); // ecliptic longitude
  const e = 23.439 - 0.00000036 * d; // obliquity
  const ra = fixHour(arctan2(cos(e) * sin(L), cos(L)) / 15); // right ascension, hours
  return {
    declination: arcsin(sin(e) * sin(L)),
    equationOfTime: q / 15 - ra,
  };
}

// ---------------------------------------------------------------------------
// Per-day solar event solver
// ---------------------------------------------------------------------------

class DaySolver {
  private readonly jdBase: number;

  constructor(
    private readonly lat: number,
    private readonly lng: number,
    date: CalcDate,
  ) {
    // Anchor the julian date to local solar midnight (praytimes.org).
    this.jdBase = julianDate(date.year, date.month, date.day) - lng / (15 * 24);
  }

  /** Solar noon (hours, local-solar frame). */
  midDay(dayFraction: number): number {
    const { equationOfTime } = sunPosition(this.jdBase + dayFraction);
    return fixHour(12 - equationOfTime);
  }

  /**
   * Time the sun reaches `angle` degrees BELOW the horizon.
   * Returns NaN when the sun never gets that low (London midsummer at 18°)
   * so callers can apply a high-latitude rule.
   */
  sunAngleTime(angle: number, dayFraction: number, direction: "ccw" | "cw"): number {
    const { declination } = sunPosition(this.jdBase + dayFraction);
    const cosH =
      (-sin(angle) - sin(this.lat) * sin(declination)) /
      (cos(this.lat) * cos(declination));
    if (cosH < -1 || cosH > 1) return NaN;
    const t = arccos(cosH) / 15;
    return this.midDay(dayFraction) + (direction === "ccw" ? -t : t);
  }

  /** Asr: shadow length = factor × object height (+ noon shadow). */
  asrTime(shadowFactor: number, dayFraction: number): number {
    const { declination } = sunPosition(this.jdBase + dayFraction);
    const angle = -arccot(shadowFactor + tan(Math.abs(this.lat - declination)));
    return this.sunAngleTime(angle, dayFraction, "cw");
  }

  /** Convert a local-solar-frame time to fractional hours UTC. */
  toUtc(rawHours: number): number {
    return rawHours - this.lng / 15;
  }
}

// ---------------------------------------------------------------------------
// Moonsighting Committee seasonal adjustments (moonsighting.com, as
// implemented in the open-source `adhan` library)
// ---------------------------------------------------------------------------

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dayOfYear(date: CalcDate): number {
  const leapAdd = isLeapYear(date.year) && date.month > 2 ? 1 : 0;
  return CUMULATIVE_DAYS[date.month - 1] + date.day + leapAdd;
}

/** Days since the winter (N hemisphere) / summer (S) solstice. */
function daysSinceSolstice(doy: number, year: number, latitude: number): number {
  const daysInYear = isLeapYear(year) ? 366 : 365;
  if (latitude >= 0) {
    let d = doy + 10;
    if (d >= daysInYear) d -= daysInYear;
    return d;
  }
  let d = doy - (isLeapYear(year) ? 173 : 172);
  if (d < 0) d += daysInYear;
  return d;
}

/** Piecewise-linear seasonal curve between the four anchor values. */
function seasonalMinutes(a: number, b: number, c: number, d: number, dyy: number): number {
  if (dyy < 91) return a + ((b - a) / 91) * dyy;
  if (dyy < 137) return b + ((c - b) / 46) * (dyy - 91);
  if (dyy < 183) return c + ((d - c) / 46) * (dyy - 137);
  if (dyy < 229) return d + ((c - d) / 46) * (dyy - 183);
  if (dyy < 275) return c + ((b - c) / 46) * (dyy - 229);
  return b + ((a - b) / 91) * (dyy - 275);
}

/** Minutes before sunrise for Subh Sadiq (Fajr). */
function morningAdjustmentMinutes(latitude: number, dyy: number): number {
  const L = Math.abs(latitude);
  return seasonalMinutes(
    75 + (28.65 / 55) * L,
    75 + (19.44 / 55) * L,
    75 + (32.74 / 55) * L,
    75 + (48.1 / 55) * L,
    dyy,
  );
}

/** Minutes after sunset for Shafaq disappearance (Isha). */
function eveningAdjustmentMinutes(latitude: number, dyy: number, shafaq: Shafaq): number {
  const L = Math.abs(latitude);
  switch (shafaq) {
    case "ahmer":
      return seasonalMinutes(
        62 + (17.4 / 55) * L,
        62 - (7.16 / 55) * L,
        62 + (5.12 / 55) * L,
        62 + (19.44 / 55) * L,
        dyy,
      );
    case "abyad":
      return seasonalMinutes(
        75 + (25.6 / 55) * L,
        75 + (7.16 / 55) * L,
        75 + (36.84 / 55) * L,
        75 + (45.1 / 55) * L,
        dyy,
      );
    default: // "general" — blend of red/white shafaq, best up to 55°
      return seasonalMinutes(
        75 + (25.6 / 55) * L,
        75 + (2.05 / 55) * L,
        75 - (9.21 / 55) * L,
        75 + (6.14 / 55) * L,
        dyy,
      );
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computePrayerTimesUtc(
  lat: number,
  lng: number,
  date: CalcDate,
  options: CalcOptions = {},
): PrayerTimesUtcHours | null {
  const method = options.method ?? "moonsighting";
  const madhab = options.madhab ?? "shafi";
  const shafaq = options.shafaq ?? "general";
  const solver = new DaySolver(lat, lng, date);

  const fajrAngle = 18;
  const ishaAngle = method === "mwl" ? 17 : 18;
  const asrFactor = madhab === "hanafi" ? 2 : 1;
  const HORIZON = 0.833; // refraction + solar semi-diameter

  // Two passes: first with rough day-fractions, then refined with the
  // previous estimates so declination/EqT are sampled at the event itself.
  let est = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  let raw = est;
  for (let pass = 0; pass < 2; pass++) {
    raw = {
      fajr: solver.sunAngleTime(fajrAngle, est.fajr / 24, "ccw"),
      sunrise: solver.sunAngleTime(HORIZON, est.sunrise / 24, "ccw"),
      dhuhr: solver.midDay(est.dhuhr / 24),
      asr: solver.asrTime(asrFactor, est.asr / 24),
      sunset: solver.sunAngleTime(HORIZON, est.sunset / 24, "cw"),
      isha: solver.sunAngleTime(ishaAngle, est.isha / 24, "cw"),
    };
    est = {
      ...raw,
      // Keep a usable estimate when twilight angles are unreachable.
      fajr: Number.isNaN(raw.fajr) ? est.fajr : raw.fajr,
      isha: Number.isNaN(raw.isha) ? est.isha : raw.isha,
    };
  }

  if (
    [raw.sunrise, raw.dhuhr, raw.asr, raw.sunset].some((t) => Number.isNaN(t))
  ) {
    // Polar day/night — outside this app's scope.
    return null;
  }

  const sunrise = solver.toUtc(raw.sunrise);
  const dhuhrBase = solver.toUtc(raw.dhuhr);
  const asr = solver.toUtc(raw.asr);
  const sunset = solver.toUtc(raw.sunset);
  let fajr = Number.isNaN(raw.fajr) ? NaN : solver.toUtc(raw.fajr);
  let isha = Number.isNaN(raw.isha) ? NaN : solver.toUtc(raw.isha);

  const night = 24 - (sunset - sunrise); // hours of darkness

  if (method === "moonsighting") {
    // Seasonal Subh Sadiq / Shafaq bounds. The angle-based time is kept only
    // when it is *within* the seasonal bound (matches the adhan library):
    // Fajr can never be earlier, Isha never later, than the seasonal rule.
    let boundFajr: number;
    let boundIsha: number;
    if (Math.abs(lat) >= 55) {
      boundFajr = sunrise - night / 7;
      boundIsha = sunset + night / 7;
    } else {
      const dyy = daysSinceSolstice(dayOfYear(date), date.year, lat);
      boundFajr = sunrise - morningAdjustmentMinutes(lat, dyy) / 60;
      boundIsha = sunset + eveningAdjustmentMinutes(lat, dyy, shafaq) / 60;
    }
    if (Number.isNaN(fajr) || boundFajr > fajr) fajr = boundFajr;
    if (Number.isNaN(isha) || boundIsha < isha) isha = boundIsha;
  } else {
    // MWL high-latitude fallback: angle-based night portion (praytimes.org).
    if (Number.isNaN(fajr)) fajr = sunrise - (fajrAngle / 60) * night;
    if (Number.isNaN(isha)) isha = sunset + (ishaAngle / 60) * night;
  }

  // Method offsets: Moonsighting uses Zuhr = zenith + 5 min and Maghrib =
  // sunset + 3 min (moonsighting.com); MWL uses zenith + 1 min, Maghrib at
  // sunset (matches the adhan library's method adjustments).
  const dhuhr = dhuhrBase + (method === "moonsighting" ? 5 : 1) / 60;
  const maghrib = sunset + (method === "moonsighting" ? 3 : 0) / 60;

  return { fajr, sunrise, dhuhr, asr, maghrib, isha };
}
