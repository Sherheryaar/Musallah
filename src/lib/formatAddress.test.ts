import { describe, expect, it } from "vitest";

import { formatAddress } from "./formatAddress";

describe("formatAddress", () => {
  it("adds the missing space after a comma", () => {
    expect(formatAddress("26a Mansfield Road, Walthamstow,Waltham Forest, E17 6PJ")).toBe(
      "26a Mansfield Road, Walthamstow, Waltham Forest, E17 6PJ",
    );
  });

  it("closes a space that precedes a comma", () => {
    expect(formatAddress("Christ Church, Waltham Avenue, Hayes , UB3 1TF")).toBe(
      "Christ Church, Waltham Avenue, Hayes, UB3 1TF",
    );
  });

  it("collapses double spaces and trims the ends", () => {
    expect(formatAddress("  9 Roundel Street,  Darnall,Sheffield  ")).toBe(
      "9 Roundel Street, Darnall, Sheffield",
    );
  });

  it("folds a wrapped address onto one line", () => {
    expect(formatAddress("12 High Street,\nLeyton")).toBe("12 High Street, Leyton");
  });

  it("leaves a trailing comma without inventing a trailing space", () => {
    expect(formatAddress("Somewhere Road,")).toBe("Somewhere Road,");
  });

  it("leaves a correctly spaced address exactly as it is", () => {
    const clean = "Flat 2, 118-120 Lea Bridge Road, London E10 7BT";
    expect(formatAddress(clean)).toBe(clean);
  });

  it("does not touch wording, case, abbreviations or postcodes", () => {
    const curated = "c/o The Old Fire Stn, 2A-4B St. Mary's Rd, LONDON, e17 9re";
    expect(formatAddress(curated)).toBe(curated);
  });

  it("survives an empty string", () => {
    expect(formatAddress("")).toBe("");
  });
});
