import { describe, expect, it } from "vitest";

import {
  FALLBACK_LOCATION,
  isInCoverage,
  isLikelyIreland,
  queryMatchesPlaceFields,
} from "./geo";

describe("isInCoverage", () => {
  it("accepts places across the UK and Ireland", () => {
    expect(isInCoverage(51.5074, -0.1278)).toBe(true); // London
    expect(isInCoverage(52.4862, -1.8904)).toBe(true); // Birmingham
    expect(isInCoverage(55.8642, -4.2518)).toBe(true); // Glasgow
    expect(isInCoverage(54.5973, -5.9301)).toBe(true); // Belfast
    expect(isInCoverage(53.3498, -6.2603)).toBe(true); // Dublin
    expect(isInCoverage(60.155, -1.145)).toBe(true); // Lerwick, Shetland
  });

  it("rejects places outside the dataset's coverage", () => {
    expect(isInCoverage(48.8566, 2.3522)).toBe(false); // Paris
    expect(isInCoverage(40.7128, -74.006)).toBe(false); // New York
    expect(isInCoverage(43.3731, -80.9821)).toBe(false); // Stratford, Ontario
  });

  it("fallback location is inside coverage", () => {
    expect(isInCoverage(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng)).toBe(
      true,
    );
  });
});

describe("isLikelyIreland", () => {
  it("accepts places in Northern Ireland and the Republic of Ireland", () => {
    expect(isLikelyIreland(53.3498, -6.2603)).toBe(true); // Dublin
    expect(isLikelyIreland(51.8985, -8.4756)).toBe(true); // Cork
    expect(isLikelyIreland(53.2707, -9.0568)).toBe(true); // Galway
    expect(isLikelyIreland(54.5973, -5.9301)).toBe(true); // Belfast
  });

  it("rejects Great Britain, even its westernmost points", () => {
    expect(isLikelyIreland(51.5074, -0.1278)).toBe(false); // London
    expect(isLikelyIreland(55.8642, -4.2518)).toBe(false); // Glasgow
    expect(isLikelyIreland(50.0657, -5.7132)).toBe(false); // Land's End, Cornwall
    expect(isLikelyIreland(53.2707, -4.2)).toBe(false); // Anglesey-ish, Wales
  });
});

describe("queryMatchesPlaceFields", () => {
  const stratford = [
    "Stratford",
    "Stratford and New Town",
    "London",
    "Greater London",
    "E15 2JE",
    "England",
  ];

  it("accepts a query naming the geocoded place", () => {
    expect(queryMatchesPlaceFields("Stratford", stratford)).toBe(true);
    expect(queryMatchesPlaceFields("stratford london", stratford)).toBe(true);
  });

  it("accepts postcode searches", () => {
    expect(queryMatchesPlaceFields("E15", stratford)).toBe(true);
  });

  it("tolerates a single typo in a longer token", () => {
    expect(queryMatchesPlaceFields("Stratfrod", stratford)).toBe(true);
    expect(
      queryMatchesPlaceFields("Birmingam", ["Birmingham", "West Midlands"]),
    ).toBe(true);
  });

  it("rejects gibberish the geocoder guessed a location for", () => {
    // The real failure mode: device geocoders resolve random words to some
    // arbitrary village rather than returning nothing.
    expect(
      queryMatchesPlaceFields("asdf qwerty zxc", [
        "Little Snoring",
        "Fakenham",
        "Norfolk",
        "NR21 0AL",
        "England",
      ]),
    ).toBe(false);
  });

  it("rejects a query with no usable tokens or no fields", () => {
    expect(queryMatchesPlaceFields("!!", ["London"])).toBe(false);
    expect(queryMatchesPlaceFields("London", [null, undefined, ""])).toBe(
      false,
    );
  });

  it("does not let a short token match on a typo", () => {
    // 2-4 letter tokens must appear verbatim — with an edit budget,
    // everything matches everything.
    expect(queryMatchesPlaceFields("brum", ["Bramhall", "Stockport"])).toBe(
      false,
    );
  });

  it("handles accents", () => {
    expect(queryMatchesPlaceFields("Câmii", ["Valide Sultan Camii"])).toBe(
      true,
    );
  });
});
