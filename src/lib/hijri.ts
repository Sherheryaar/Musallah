// Gregorian -> Hijri conversion using the tabular (arithmetic) Islamic
// calendar -- the classic "Kuwaiti algorithm". Accurate to within about a
// day of the observational Umm al-Qura calendar, which is fine for display
// (actual month starts depend on moon sighting anyway). Pure math: no Intl,
// no dependencies, works on Hermes on every device.

const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  "Jumada al-Awwal",
  "Jumada al-Thani",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhul-Qi'dah",
  "Dhul-Hijjah",
];

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export type HijriDate = { day: number; month: number; year: number };

export function gregorianToHijri(date: Date): HijriDate {
  const jdn = gregorianToJdn(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  let days = jdn - 1948440 + 10632;
  const n = Math.floor((days - 1) / 10631);
  days = days - 10631 * n + 354;
  const j =
    Math.floor((10985 - days) / 5316) * Math.floor((50 * days) / 17719) +
    Math.floor(days / 5670) * Math.floor((43 * days) / 15238);
  days =
    days -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * days) / 709);
  const day = days - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month, year };
}

/** e.g. "5 SHA'BAN 1442 AH" */
export function formatHijri(date: Date): string {
  const h = gregorianToHijri(date);
  return `${h.day} ${HIJRI_MONTHS[h.month - 1].toUpperCase()} ${h.year} AH`;
}
