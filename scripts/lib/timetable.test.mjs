import { describe, expect, it } from "vitest";

import {
  addMinutes,
  htmlTableRows,
  iqamaToJamaat,
  parseDatedJamaatTable,
  sameJamaat,
  to24Hour,
  toDMY,
  toHHMM,
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

describe("sameJamaat", () => {
  it("compares only the prayer fields", () => {
    const a = { fajr: "04:30", dhuhr: "13:30" };
    expect(sameJamaat(a, { ...a })).toBe(true);
    expect(sameJamaat(a, { fajr: "04:30", dhuhr: "13:45" })).toBe(false);
    expect(sameJamaat(a, { fajr: "04:30" })).toBe(false);
    expect(sameJamaat(a, null)).toBe(false);
  });
});
