import { describe, expect, it } from "vitest";

import { fuzzyMatches, tokenize } from "./fuzzy";

const tokens = (s: string) => tokenize(s);

describe("tokenize", () => {
  it("lowercases, strips punctuation and apostrophes", () => {
    expect(tokenize("Jumu'ah Salaah — St. Mary's")).toEqual([
      "jumuah",
      "salaah",
      "st",
      "marys",
    ]);
  });

  it("folds domain synonyms", () => {
    expect(tokenize("East London Mosque")).toContain("masjid");
    expect(tokenize("The City Mussalla")).toContain("musalla");
    expect(tokenize("Islamic Center")).toContain("centre");
  });
});

describe("fuzzyMatches", () => {
  const elm = tokens("East London Mosque & London Muslim Centre Whitechapel");
  const birmingham = tokens("Birmingham Central Mosque Highgate");
  const lewisham = tokens("Lewisham Islamic Centre");

  it("matches exact and prefix queries", () => {
    expect(fuzzyMatches(elm, "east london")).toBe(true);
    expect(fuzzyMatches(elm, "whitech")).toBe(true);
  });

  it("matches across mosque/masjid synonyms", () => {
    expect(fuzzyMatches(elm, "east london masjid")).toBe(true);
    expect(fuzzyMatches(birmingham, "birmingham masjid")).toBe(true);
  });

  it("tolerates one typo in medium words and two in long ones", () => {
    expect(fuzzyMatches(birmingham, "birmingam")).toBe(true); // missing h
    expect(fuzzyMatches(birmingham, "burmingham")).toBe(true); // u for i
    expect(fuzzyMatches(lewisham, "lewsham islamic")).toBe(true);
    expect(fuzzyMatches(elm, "whitechaple")).toBe(true); // transposition
  });

  it("does not fuzz short tokens", () => {
    expect(fuzzyMatches(tokens("SW9 Prayer Room"), "sw")).toBe(true); // prefix ok
    expect(fuzzyMatches(tokens("SW9 Prayer Room"), "se9")).toBe(false); // not a typo-match
  });

  it("rejects unrelated queries", () => {
    expect(fuzzyMatches(elm, "glasgow")).toBe(false);
    expect(fuzzyMatches(lewisham, "xyzzy")).toBe(false);
  });

  it("empty query matches everything", () => {
    expect(fuzzyMatches(elm, "  ")).toBe(true);
  });
});
