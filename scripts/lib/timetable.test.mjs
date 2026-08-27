import { describe, expect, it } from "vitest";

import {
  addMinutes,
  decodePercentMixed,
  hhmmFromIso,
  htmlTableRows,
  iqamaToJamaat,
  masjidboxDay,
  masjidboxJamaat,
  masjidboxSlugs,
  masjidboxState,
  masjidboxTimezone,
  mawaqitSlugs,
  parseDailyIqamahTable,
  parseDatedJamaatTable,
  prayerKeyFromLabel,
  sameJamaat,
  siratDayTimes,
  to24Hour,
  toDMY,
  toHHMM,
  todayInZone,
} from "./timetable.mjs";

describe("toHHMM", () => {
  it("pads and accepts valid times", () => {
    expect(toHHMM("9:56")).toBe("09:56");
    expect(toHHMM(" 21:05 ")).toBe("21:05");
  });

  it("rejects nonsense rather than guessing", () => {
    expect(toHHMM("25:00")).toBeNull();
    expect(toHHMM("13:75")).toBeNull();
    expect(toHHMM("+10")).toBeNull();
    expect(toHHMM("")).toBeNull();
    expect(toHHMM(null)).toBeNull();
  });
});

describe("to24Hour", () => {
  it("reads UK 12-hour timetables by prayer", () => {
    // "1:12" against Zuhr is 13:12, never 01:12.
    expect(to24Hour("1:12", "dhuhr")).toBe("13:12");
    expect(to24Hour("6:45", "asr")).toBe("18:45");
    expect(to24Hour("8:52", "maghrib")).toBe("20:52");
    expect(to24Hour("10:15", "isha")).toBe("22:15");
  });

  it("keeps Fajr in the morning", () => {
    expect(to24Hour("3:59", "fajr")).toBe("03:59");
    expect(to24Hour("4:32", "fajr")).toBe("04:32");
  });

  it("leaves already-24h values alone", () => {
    expect(to24Hour("13:30", "dhuhr")).toBe("13:30");
    expect(to24Hour("21:57", "isha")).toBe("21:57");
    expect(to24Hour("12:30", "dhuhr")).toBe("12:30");
  });
});

describe("addMinutes", () => {
  it("adds within the hour and across it", () => {
    expect(addMinutes("13:20", 10)).toBe("13:30");
    expect(addMinutes("21:55", 10)).toBe("22:05");
    expect(addMinutes("13:30", 0)).toBe("13:30");
  });

  it("wraps past midnight", () => {
    expect(addMinutes("23:55", 10)).toBe("00:05");
  });
});

describe("iqamaToJamaat", () => {
  const times = ["03:42", "05:26", "13:16", "17:21", "20:56", "22:00"];

  it("takes clock times straight through", () => {
    const { jamaat, skipped } = iqamaToJamaat(
      times,
      ["04:30", "13:30", "18:00", "21:01", "22:15"],
      true,
    );
    expect(jamaat).toEqual({
      fajr: "04:30",
      dhuhr: "13:30",
      asr: "18:00",
      maghrib: "21:01",
      isha: "22:15",
    });
    expect(skipped).toEqual([]);
  });

  it("resolves +N offsets against that mosque's own adhan times", () => {
    const { jamaat } = iqamaToJamaat(
      times,
      ["04:15", "+10", "+10", "+5", "+10"],
      true,
    );
    expect(jamaat).toEqual({
      fajr: "04:15",
      dhuhr: "13:26", // 13:16 + 10
      asr: "17:31", // 17:21 + 10
      maghrib: "21:01", // 20:56 + 5
      isha: "22:10", // 22:00 + 10
    });
  });

  it("treats +0 as praying at the adhan", () => {
    const { jamaat } = iqamaToJamaat(times, ["+0", "+0", "+0", "+0", "+0"], true);
    expect(jamaat.dhuhr).toBe("13:16");
    expect(jamaat.maghrib).toBe("20:56");
  });

  it("publishes nothing when the mosque disabled iqama", () => {
    const { jamaat, skipped } = iqamaToJamaat(
      times,
      ["+0", "+0", "+0", "+0", "+0"],
      false,
    );
    expect(jamaat).toEqual({});
    expect(skipped).toHaveLength(5);
  });

  it("refuses to resolve offsets against an unexpected times layout", () => {
    // A 7-entry array means we cannot tell which index is which prayer;
    // guessing would put a wrong prayer time in front of a user.
    const odd = ["03:37", "03:37", "05:17", "13:20", "17:32", "21:14", "22:43"];
    const { jamaat, skipped } = iqamaToJamaat(
      odd,
      ["+10", "+10", "+10", "+5", "+10"],
      true,
    );
    expect(jamaat).toEqual({});
    expect(skipped).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
  });

  it("keeps the clock times it can read and reports the rest", () => {
    const odd = ["03:37", "03:37", "05:17", "13:20", "17:32", "21:14", "22:43"];
    const { jamaat, skipped } = iqamaToJamaat(
      odd,
      ["04:15", "13:30", "+10", "+10", "22:15"],
      true,
    );
    expect(jamaat).toEqual({ fajr: "04:15", dhuhr: "13:30", isha: "22:15" });
    expect(skipped).toEqual(["asr", "maghrib"]);
  });

  it("rejects malformed iqama arrays", () => {
    expect(iqamaToJamaat(times, null, true).jamaat).toEqual({});
    expect(iqamaToJamaat(times, ["13:30"], true).jamaat).toEqual({});
  });
});

describe("toDMY", () => {
  it("converts ISO to the DD/MM/YYYY key the timetable uses", () => {
    expect(toDMY("2026-08-01")).toBe("01/08/2026");
    expect(toDMY("2026-12-31")).toBe("31/12/2026");
  });
});

describe("htmlTableRows + parseDatedJamaatTable", () => {
  // Copied verbatim from eastlondonmosque.org.uk (checked 2026-08-01):
  // the real header row and the real rows for 1 and 7 August 2026. Note
  // Sunrise sits at index 4, BEFORE Fajr — which is why columns are
  // resolved by header name, not position.
  const html = `
    <table>
      <tr><td>Gregorian date</td><td>Islamic day</td><td>Islamic month</td><td>Islamic year</td><td>Sunrise</td><td>Fajr Begins</td><td>Fajr Jam&#257;'ah</td><td>Zuhr Begins</td><td>Zuhr Jam&#257;'ah</td><td>Asr Mithl 1</td><td>Asr Mithl 2</td><td>Asr Jam&#257;'ah</td><td>Maghrib Begins</td><td>Maghrib Jam&#257;'ah</td><td>Ish&#257; Begins</td><td>Ish&#257; Jam&#257;'ah</td></tr>
      <tr><td>01/08/2026</td><td>18</td><td>Safar</td><td>1448</td><td>5:21</td><td>3:39</td><td>3:59</td><td>1:12</td><td>1:30</td><td>5:17</td><td>6:24</td><td>6:45</td><td>8:52</td><td>8:59</td><td>9:56</td><td>10:15</td></tr>
      <tr><td>07/08/2026</td><td>24</td><td>Safar</td><td>1448</td><td>5:30</td><td>3:50</td><td>4:10</td><td>1:11</td><td>1:45</td><td>5:12</td><td>6:17</td><td>6:45</td><td>8:41</td><td>8:48</td><td>9:46</td><td>10:15</td></tr>
      <tr><td>01/01/2026</td><td>12</td><td>Rajab</td><td>1447</td><td>8:03</td><td>6:26</td><td>6:46</td><td>12:09</td><td>12:45</td><td>1:46</td><td>2:17</td><td>2:45</td><td>4:05</td><td>4:12</td><td>5:42</td><td>7:30</td></tr>
    </table>`;
  const rows = htmlTableRows(html);

  it("extracts every row's cells", () => {
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveLength(16);
    expect(rows[1][0]).toBe("01/08/2026");
  });

  it("reads the jamaat columns for a date, in 24-hour time", () => {
    // Matches the mosque's own printed timetable for 1 August 2026.
    expect(parseDatedJamaatTable(rows, "2026-08-01")).toEqual({
      fajr: "03:59",
      dhuhr: "13:30",
      asr: "18:45",
      maghrib: "20:59",
      isha: "22:15",
    });
  });

  it("picks up the Friday Jumu'ah shift in Zuhr jamaah", () => {
    // 7 August 2026 is a Friday: Zuhr jamā'ah moves 1:30 -> 1:45.
    expect(parseDatedJamaatTable(rows, "2026-08-07").dhuhr).toBe("13:45");
  });

  it("handles a midwinter row where Zuhr and Maghrib are close together", () => {
    expect(parseDatedJamaatTable(rows, "2026-01-01")).toEqual({
      fajr: "06:46",
      dhuhr: "12:45",
      asr: "14:45",
      maghrib: "16:12",
      isha: "19:30",
    });
  });

  it("returns null for a date the table doesn't contain", () => {
    expect(parseDatedJamaatTable(rows, "2027-01-15")).toBeNull();
  });

  it("returns null when the header row is missing", () => {
    // Layout change: no named columns means we refuse to guess.
    const headerless = `<table><tr><td>01/08/2026</td><td>5:21</td><td>3:39</td></tr></table>`;
    expect(
      parseDatedJamaatTable(htmlTableRows(headerless), "2026-08-01"),
    ).toBeNull();
  });

  it("follows the header when columns are reordered", () => {
    const swapped = `
      <table>
        <tr><td>Gregorian date</td><td>Ish&#257; Jam&#257;'ah</td><td>Fajr Jam&#257;'ah</td><td>Zuhr Jam&#257;'ah</td></tr>
        <tr><td>01/08/2026</td><td>10:15</td><td>3:59</td><td>1:30</td></tr>
      </table>`;
    expect(parseDatedJamaatTable(htmlTableRows(swapped), "2026-08-01")).toEqual({
      fajr: "03:59",
      dhuhr: "13:30",
      isha: "22:15",
    });
  });
});

describe("siratDayTimes", () => {
  // Shape taken from a real /v1/snapshot entry: Thursday carries the day's
  // jamā'ah and an empty jumuah, Friday carries the sittings.
  const days = [
    {
      date: "2026-08-27",
      fajr: "05:15",
      dhuhr: "13:30",
      asr: "18:30",
      maghrib: "20:02",
      isha: "21:30",
      jumuah: [],
    },
    {
      date: "2026-08-28",
      fajr: "05:17",
      dhuhr: "13:30",
      asr: "18:28",
      maghrib: "20:00",
      isha: "21:28",
      jumuah: [
        { label: "1st Jumu'ah", time: "13:30" },
        { label: "2nd Jumu'ah", time: "14:30" },
      ],
    },
  ];

  it("takes jamaah from today and jumuah from the coming Friday", () => {
    const got = siratDayTimes(days, "2026-08-27");
    expect(got.jamaat).toEqual({
      fajr: "05:15",
      dhuhr: "13:30",
      asr: "18:30",
      maghrib: "20:02",
      isha: "21:30",
    });
    // Thursday's own record has none; Friday's must be found instead.
    expect(got.jumuah).toEqual(["13:30", "14:30"]);
    expect(got.skipped).toEqual([]);
  });

  it("never reads another day's jamaah times", () => {
    // Friday's Fajr is 05:17; asking for Thursday must not return it.
    expect(siratDayTimes(days, "2026-08-27").jamaat.fajr).toBe("05:15");
    expect(siratDayTimes(days, "2026-08-28").jamaat.fajr).toBe("05:17");
  });

  it("uses today's own sittings on a Friday", () => {
    expect(siratDayTimes(days, "2026-08-28").jumuah).toEqual(["13:30", "14:30"]);
  });

  it("ignores a Jumu'ah that has already passed", () => {
    // Asking about the Saturday after: last Friday's sitting is behind us and
    // must not be presented as upcoming.
    expect(siratDayTimes(days, "2026-08-29").jumuah).toEqual([]);
  });

  it("reports prayers with no time today rather than dropping them", () => {
    const partial = [{ date: "2026-08-27", dhuhr: "13:30", jumuah: [] }];
    const got = siratDayTimes(partial, "2026-08-27");
    expect(got.jamaat).toEqual({ dhuhr: "13:30" });
    expect(got.skipped).toEqual(["fajr", "asr", "maghrib", "isha"]);
  });

  it("returns nothing usable when the mosque has no record for today", () => {
    const got = siratDayTimes([{ date: "2026-09-01", fajr: "05:20" }], "2026-08-27");
    expect(got.jamaat).toEqual({});
    expect(got.jumuah).toEqual([]);
    expect(got.skipped).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
  });

  it("survives a missing or malformed times array", () => {
    for (const input of [undefined, null, [], "nope", [null]]) {
      const got = siratDayTimes(input, "2026-08-27");
      expect(got.jamaat).toEqual({});
      expect(got.jumuah).toEqual([]);
    }
  });

  it("de-duplicates repeated sittings", () => {
    const dupes = [
      {
        date: "2026-08-27",
        jumuah: [
          { label: "a", time: "13:30" },
          { label: "b", time: "13:30" },
          { label: "c", time: "bogus" },
        ],
      },
    ];
    expect(siratDayTimes(dupes, "2026-08-27").jumuah).toEqual(["13:30"]);
  });
});

describe("parseDailyIqamahTable", () => {
  // The real table from belfastislamiccentre.org.uk, including its
  // two-prayers-in-one-row Sunrise/Dhuhr line.
  const belfast = [
    ["27/08/2026"],
    ["Prayer صلاة", "Begins", "Iqamah"],
    ["Fajr فجر", "04:40", "05:00"],
    ["Sunrise شروق", "06:20", "Dhuhr ظهر", "13:27", "13:40"],
    ["'Asr عصر", "17:16", "17:30"],
    ["Maghrib مغرب", "20:31", "20:38"],
    ["Isha عشاء", "21:56", "22:15"],
  ];

  it("reads the iqamah column for every prayer", () => {
    expect(parseDailyIqamahTable(belfast, "2026-08-27")).toEqual({
      fajr: "05:00",
      dhuhr: "13:40",
      asr: "17:30",
      maghrib: "20:38",
      isha: "22:15",
    });
  });

  it("does not let a Sunrise time bleed onto the prayer beside it", () => {
    // Sunrise's 06:20 shares a row with Dhuhr. Attributing it to Dhuhr would
    // publish a jamā'ah seven hours early.
    const parsed = parseDailyIqamahTable(belfast, "2026-08-27");
    expect(parsed.dhuhr).toBe("13:40");
    expect(Object.values(parsed)).not.toContain("06:20");
  });

  it("refuses a table that is not showing today", () => {
    // A stale or cached page must yield nothing rather than yesterday's times.
    expect(parseDailyIqamahTable(belfast, "2026-08-28")).toBeNull();
  });

  it("accepts a written-out date", () => {
    const rows = [
      ["Thursday 27th August 2026"],
      ["Prayer", "Begins", "Jama'ah"],
      ["Fajr", "04:40", "05:00"],
    ];
    expect(parseDailyIqamahTable(rows, "2026-08-27")).toEqual({ fajr: "05:00" });
  });

  it("returns null when no column names a jamaah time", () => {
    // "Begins | Ends" is not a jamā'ah table; guessing would be a wrong time.
    const rows = [
      ["27/08/2026"],
      ["Prayer", "Begins", "Ends"],
      ["Fajr", "04:40", "06:20"],
    ];
    expect(parseDailyIqamahTable(rows, "2026-08-27")).toBeNull();
  });

  it("takes the iqamah column by name, not by position", () => {
    // Reversed order: the jamā'ah is the FIRST time here.
    const rows = [
      ["27/08/2026"],
      ["Prayer", "Iqamah", "Begins"],
      ["Fajr", "05:00", "04:40"],
      ["Asr", "17:30", "17:16"],
    ];
    expect(parseDailyIqamahTable(rows, "2026-08-27")).toEqual({
      fajr: "05:00",
      asr: "17:30",
    });
  });

  it("resolves an explicit am/pm and a 12-hour jamaah column", () => {
    const rows = [
      ["27/08/2026"],
      ["Prayer", "Begins", "Iqamah"],
      ["Fajr", "4:40 am", "5:00 am"],
      ["Isha", "9:56 pm", "10:15 pm"],
    ];
    expect(parseDailyIqamahTable(rows, "2026-08-27")).toEqual({
      fajr: "05:00",
      isha: "22:15",
    });
  });

  it("reads a bare 12-hour jamaah column against the prayer", () => {
    // No am/pm at all: "10:15" for Isha means 22:15, and Fajr stays morning.
    const rows = [
      ["27/08/2026"],
      ["Prayer", "Begins", "Iqamah"],
      ["Fajr", "4:40", "5:00"],
      ["Isha", "9:56", "10:15"],
    ];
    expect(parseDailyIqamahTable(rows, "2026-08-27")).toEqual({
      fajr: "05:00",
      isha: "22:15",
    });
  });

  it("skips a prayer whose row is missing a column", () => {
    const rows = [
      ["27/08/2026"],
      ["Prayer", "Begins", "Iqamah"],
      ["Fajr", "04:40", "05:00"],
      ["Asr", "17:16"],
    ];
    expect(parseDailyIqamahTable(rows, "2026-08-27")).toEqual({ fajr: "05:00" });
  });

  it("ignores prose that merely mentions iqamah before the real header", () => {
    // Real rows from harrowmosque.org.uk. The first cell is a banner, not a
    // header; reading it as one made every data row unparseable and left a
    // major mosque's times stale.
    const harrow = [
      ["IQAMAH CHANGES: Fajr: 5:30 AM Isha: 9:30 PM"],
      ["27 August 2026 Fajr Jamaat 05:30 5:30 AM"],
      ["Prayer", "Begins", "Jamaat"],
      ["Fajr", "4:25 AM", "5:15 AM"],
      ["Sunrise", "6:05 AM", "Zuhr", "1:07 AM", "1:30 PM"],
      ["Asr**", "5:50 PM", "6:15 PM"],
      ["Maghrib", "7:58 PM", "8:03 PM"],
      ["Isha", "9:10 PM", "9:45 PM"],
    ];
    expect(parseDailyIqamahTable(harrow, "2026-08-27")).toEqual({
      fajr: "05:15",
      dhuhr: "13:30",
      asr: "18:15",
      maghrib: "20:03",
      isha: "21:45",
    });
  });

  it("returns null for a table with no rows or no date", () => {
    expect(parseDailyIqamahTable([], "2026-08-27")).toBeNull();
    expect(
      parseDailyIqamahTable(
        [["Prayer", "Begins", "Iqamah"], ["Fajr", "04:40", "05:00"]],
        "2026-08-27",
      ),
    ).toBeNull();
  });
});

describe("masjidboxSlugs", () => {
  it("reads the embed/share form", () => {
    // Real markup from baitulazizmosque.org.uk.
    const html = `<script src="https://masjidbox.com/widgets/loader.js"></script>
      <a href="https://masjidbox.com/prayer-times/baitulaziz-icc">Times</a>`;
    expect(masjidboxSlugs(html)).toEqual(["baitulaziz-icc"]);
  });

  it("reads the standalone page form", () => {
    expect(
      masjidboxSlugs(`<a href="https://masjidbox.net/al-furqan-education-trust">x</a>`),
    ).toEqual(["al-furqan-education-trust"]);
  });

  it("never mistakes CDN assets or platform pages for a mosque", () => {
    // This is the exact failure that produced 34 junk candidates: pages
    // whose only masjidbox URLs are images, loaders, or donation links.
    const html = `
      <img src="https://cdn.masjidbox.com/content/pictures/abc.webp">
      <script src="https://masjidbox.com/widgets/loader.js"></script>
      <a href="https://masjidbox.com/donations">Donate</a>
      <a href="https://masjidbox.com/applications">Apply</a>`;
    expect(masjidboxSlugs(html)).toEqual([]);
  });

  it("reports every slug when a page names more than one mosque", () => {
    const html = `
      <a href="https://masjidbox.com/prayer-times/mosque-one">One</a>
      <a href="https://masjidbox.com/prayer-times/mosque-two">Two</a>`;
    expect(masjidboxSlugs(html)).toEqual(["mosque-one", "mosque-two"]);
  });
});

describe("mawaqitSlugs", () => {
  it("reads slugs with and without a language prefix", () => {
    expect(
      mawaqitSlugs(`<iframe src="https://mawaqit.net/en/finsbury-park-mosque">`),
    ).toEqual(["finsbury-park-mosque"]);
    expect(mawaqitSlugs(`<a href="https://mawaqit.net/some-masjid">`)).toEqual([
      "some-masjid",
    ]);
  });

  it("ignores language-only and asset paths", () => {
    expect(mawaqitSlugs(`<a href="https://mawaqit.net/en/">`)).toEqual([]);
  });
});

describe("prayerKeyFromLabel", () => {
  it("maps the spellings UK mosques actually print", () => {
    expect(prayerKeyFromLabel("Fajr Jamā'ah")).toBe("fajr");
    expect(prayerKeyFromLabel("Zuhr")).toBe("dhuhr");
    expect(prayerKeyFromLabel("DHUHR")).toBe("dhuhr");
    expect(prayerKeyFromLabel("Asr Mithl 2")).toBe("asr");
    expect(prayerKeyFromLabel("Magrib")).toBe("maghrib");
    expect(prayerKeyFromLabel("Ishā")).toBe("isha");
  });

  it("refuses things that are not prayers", () => {
    expect(prayerKeyFromLabel("Shuruq")).toBeNull();
    expect(prayerKeyFromLabel("Sunrise")).toBeNull();
    expect(prayerKeyFromLabel("")).toBeNull();
  });
});

describe("masjidboxJamaat", () => {
  it("takes the Iqamah (second) time per prayer", () => {
    // Al Furqan Education Trust's real grid, 1 August 2026.
    const columns = [
      { title: "Fajr", times: ["3:39", "4:15"] },
      { title: "Shuruq", times: ["5:21"] },
      { title: "Dhuhr", times: ["13:12", "13:30"] },
      { title: "Asr", times: ["17:17", "17:30"] },
      { title: "Maghrib", times: ["20:52", "20:57"] },
      { title: "Isha", times: ["21:56", "22:15"] },
    ];
    expect(masjidboxJamaat(columns)).toEqual({
      fajr: "04:15",
      dhuhr: "13:30",
      asr: "17:30",
      maghrib: "20:57",
      isha: "22:15",
    });
  });

  it("ignores the trailing bleed in the last column", () => {
    // The final column's markup block runs to the end of the page, so it
    // also captures the month table and the Jumu'ah times. Reading "the
    // last time" here produced Isha 21:15 for Al Furqan and 14:15 (a
    // Jumu'ah time) for Romford — both wrong. Only index 1 is the iqamah.
    const columns = [
      { title: "Maghrib", times: ["20:52", "20:57"] },
      {
        title: "Isha",
        times: [
          "21:56",
          "22:15",
          "3:39",
          "4:15",
          "13:12",
          "13:30",
          "21:02",
          "21:15",
        ],
      },
    ];
    expect(masjidboxJamaat(columns)).toEqual({
      maghrib: "20:57",
      isha: "22:15",
    });
  });

  it("skips Shuruq, which has a placeholder second value", () => {
    expect(masjidboxJamaat([{ title: "Shuruq", times: ["5:21", "--"] }])).toBeNull();
  });

  it("skips a prayer with only one time (athan or iqamah? unknowable)", () => {
    expect(
      masjidboxJamaat([
        { title: "Fajr", times: ["4:15"] },
        { title: "Dhuhr", times: ["13:12", "13:30"] },
      ]),
    ).toEqual({ dhuhr: "13:30" });
  });

  it("returns null when nothing usable is present", () => {
    expect(masjidboxJamaat([{ title: "Shuruq", times: ["5:21"] }])).toBeNull();
    expect(masjidboxJamaat([])).toBeNull();
  });
});

describe("hhmmFromIso", () => {
  it("reads the mosque's own wall clock, not the runner's", () => {
    // The refresh runs on a UTC CI box. Going via `new Date` would turn a
    // 04:01 BST jamā'ah into 03:01 for the whole summer.
    expect(hhmmFromIso("2026-08-02T04:01:00+01:00")).toBe("04:01");
    expect(hhmmFromIso("2026-01-02T17:30:00+00:00")).toBe("17:30");
    expect(hhmmFromIso("2026-08-02T22:15:00+05:30")).toBe("22:15");
  });

  it("returns null for anything that is not a datetime", () => {
    expect(hhmmFromIso("")).toBeNull();
    expect(hhmmFromIso("13:30")).toBeNull();
    expect(hhmmFromIso(null)).toBeNull();
    expect(hhmmFromIso(undefined)).toBeNull();
  });
});

describe("todayInZone", () => {
  it("gives the date where the masjid is, not where the runner is", () => {
    // 23:30 UTC on 1 Aug is already 00:30 on 2 Aug in London.
    const nearMidnight = new Date("2026-08-01T23:30:00Z");
    expect(todayInZone("Europe/London", nearMidnight)).toBe("2026-08-02");
    expect(todayInZone("UTC", nearMidnight)).toBe("2026-08-01");
  });

  it("falls back to the UTC date for an unknown zone", () => {
    expect(todayInZone("Not/AZone", new Date("2026-08-02T12:00:00Z"))).toBe(
      "2026-08-02",
    );
  });
});

describe("decodePercentMixed", () => {
  it("decodes escapes sitting alongside literal UTF-8", () => {
    // decodeURIComponent throws on this; Masjidbox ships exactly this mix.
    expect(decodePercentMixed("%7B%22a%22%3A%22صفر%22%7D")).toBe('{"a":"صفر"}');
    expect(decodePercentMixed("100%")).toBe("100%");
    expect(decodePercentMixed("a%2Gb")).toBe("a%2Gb");
  });
});

describe("masjidboxState", () => {
  it("pulls the embedded state out of the page", () => {
    const payload = encodeURIComponent(JSON.stringify({ azan: { ok: true } }));
    const html = `<script>window.REDUX_STATE = '${payload}';</script>`;
    expect(masjidboxState(html)).toEqual({ azan: { ok: true } });
  });

  it("returns null rather than throwing on a page without it", () => {
    expect(masjidboxState("<html>no state here</html>")).toBeNull();
    expect(masjidboxState("<script>window.REDUX_STATE = '%ZZnot json';</script>")).toBeNull();
  });
});

describe("masjidboxDay", () => {
  // Holborn Mosque's real shape, 2 Aug 2026.
  const state = (rows) => ({ azan: { masjidAzan: { item: { timetable: rows } } } });
  /** The .com prayer-times page's shape — same rows, different keys. */
  const comState = (rows, extra = {}) => ({
    masjidbox: { masjidboxAthany: { timetable: rows, ...extra } },
  });
  const day = {
    date: "2026-08-02T00:00:00+01:00",
    fajr: "2026-08-02T03:41:00+01:00",
    sunrise: "2026-08-02T05:23:00+01:00",
    dhuhr: "2026-08-02T13:12:00+01:00",
    asr: "2026-08-02T18:23:00+01:00",
    maghrib: "2026-08-02T20:50:00+01:00",
    isha: "2026-08-02T21:54:00+01:00",
    iqamah: {
      fajr: "2026-08-02T04:01:00+01:00",
      dhuhr: "2026-08-02T13:30:00+01:00",
      asr: "2026-08-02T18:45:00+01:00",
      maghrib: "2026-08-02T20:55:00+01:00",
      isha: "2026-08-02T22:15:00+01:00",
    },
  };

  it("takes the iqamah, never the adhan", () => {
    // 03:41 is when the adhan is called; 04:01 is when the jamā'ah stands.
    expect(masjidboxDay(state([day]), "2026-08-02")).toEqual({
      jamaat: {
        fajr: "04:01",
        dhuhr: "13:30",
        asr: "18:45",
        maghrib: "20:55",
        isha: "22:15",
      },
      jumuah: undefined,
    });
  });

  it("finds the right day in a month of rows", () => {
    const other = {
      ...day,
      date: "2026-08-03T00:00:00+01:00",
      iqamah: { ...day.iqamah, fajr: "2026-08-03T04:05:00+01:00" },
    };
    expect(masjidboxDay(state([day, other]), "2026-08-03").jamaat.fajr).toBe("04:05");
  });

  it("returns null when today is not in the timetable", () => {
    // A timetable that has run out must read as "no data", never as the
    // nearest row — that would show a user last month's times.
    expect(masjidboxDay(state([day]), "2026-09-14")).toBeNull();
    expect(masjidboxDay(state([]), "2026-08-02")).toBeNull();
    expect(masjidboxDay({}, "2026-08-02")).toBeNull();
  });

  it("collects every Jumu'ah the mosque holds", () => {
    const friday = {
      ...day,
      date: "2026-08-07T00:00:00+01:00",
      iqamah: {
        ...day.iqamah,
        jumuah: [
          "2026-08-07T14:35:00+01:00",
          "2026-08-07T13:20:00+01:00",
          "2026-08-07T14:00:00+01:00",
        ],
      },
    };
    expect(masjidboxDay(state([friday]), "2026-08-07").jumuah).toEqual([
      "13:20",
      "14:00",
      "14:35",
    ]);
  });

  it("never reports the Friday adhan as the Jumu'ah jamā'ah", () => {
    // Ilford Islamic Centre: adhan 13:10, prayer 13:30 and 14:15. Falling
    // back from iqamah.jumuah to jumuah would send people 20 minutes early.
    const friday = {
      ...day,
      date: "2026-08-07T00:00:00+01:00",
      jumuah: ["2026-08-07T13:10:00+01:00", "2026-08-07T13:10:00+01:00"],
      iqamah: {
        ...day.iqamah,
        jumuah: ["2026-08-07T13:30:00+01:00", "2026-08-07T14:15:00+01:00"],
      },
    };
    expect(masjidboxDay(state([friday]), "2026-08-07").jumuah).toEqual([
      "13:30",
      "14:15",
    ]);

    // And with no iqamah.jumuah, report nothing rather than the adhan.
    const adhanOnly = { ...friday, iqamah: day.iqamah };
    expect(masjidboxDay(state([adhanOnly]), "2026-08-07").jumuah).toBeUndefined();
  });

  it("drops a jamā'ah that falls before its own adhan", () => {
    // Madinatul Ilm publishes Fajr jamā'ah 02:00 against a 03:41 adhan, and
    // Cambridge ISOC 03:30 against 03:35. Both are dashboard typos; a user
    // sent out at 2am is worse than a user shown nothing.
    const typo = {
      ...day,
      iqamah: { ...day.iqamah, fajr: "2026-08-02T02:00:00+01:00" },
    };
    const out = masjidboxDay(state([typo]), "2026-08-02");
    expect(out.jamaat.fajr).toBeUndefined();
    expect(out.jamaat.dhuhr).toBe("13:30"); // the rest of the row survives
  });

  it("keeps a jamā'ah at the same minute as the adhan", () => {
    // Romford Mosque genuinely publishes Fajr adhan and iqamah both at 04:45.
    const together = {
      ...day,
      fajr: "2026-08-02T04:45:00+01:00",
      iqamah: { ...day.iqamah, fajr: "2026-08-02T04:45:00+01:00" },
    };
    expect(masjidboxDay(state([together]), "2026-08-02").jamaat.fajr).toBe("04:45");
  });

  it("keeps an Isha jamā'ah that runs past midnight", () => {
    // Comparing clock faces would read 00:15 as "before" 23:50 and bin it.
    const late = {
      ...day,
      isha: "2026-08-02T23:50:00+01:00",
      iqamah: { ...day.iqamah, isha: "2026-08-03T00:15:00+01:00" },
    };
    expect(masjidboxDay(state([late]), "2026-08-02").jamaat.isha).toBe("00:15");
  });

  it("reads the .com prayer-times page's shape too", () => {
    // Same rows, different keys — the .com page is the one every mosque has.
    expect(masjidboxDay(comState([day]), "2026-08-02").jamaat.fajr).toBe("04:01");
  });

  it("publishes nothing for a masjid marked closed", () => {
    expect(masjidboxDay(comState([day], { athany: { closed: true } }), "2026-08-02")).toBeNull();
  });

  it("skips a prayer the mosque left blank instead of inventing one", () => {
    const partial = { ...day, iqamah: { fajr: day.iqamah.fajr, dhuhr: null } };
    expect(masjidboxDay(state([partial]), "2026-08-02").jamaat).toEqual({
      fajr: "04:01",
    });
  });
});

describe("masjidboxTimezone", () => {
  it("reads the mosque's zone from either page shape, ignoring junk", () => {
    const net = (v) => ({ azan: { masjidAzan: { item: { timetable: [], timezone: v } } } });
    const com = (v) => ({
      masjidbox: { masjidboxAthany: { timetable: [], settings: { timezone: v } } },
    });
    expect(masjidboxTimezone(net("Europe/London"))).toBe("Europe/London");
    expect(masjidboxTimezone(com("Europe/London"))).toBe("Europe/London");
    expect(masjidboxTimezone(net("BST"))).toBeNull();
    expect(masjidboxTimezone({})).toBeNull();
  });
});

describe("sameJamaat", () => {
  it("compares only the prayer fields", () => {
    const a = { fajr: "04:30", dhuhr: "13:30" };
    expect(sameJamaat(a, { ...a })).toBe(true);
    expect(sameJamaat(a, { fajr: "04:30", dhuhr: "13:45" })).toBe(false);
    expect(sameJamaat(a, { fajr: "04:30" })).toBe(false);
    expect(sameJamaat(a, null)).toBe(false);
  });
});
