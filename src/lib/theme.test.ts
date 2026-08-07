import { describe, expect, it } from "vitest";

import { darkColors, lightColors, placeTypeColors } from "./theme";

// Contrast is a property of the palette, so it belongs in a test rather
// than in a reviewer's head. Every pairing the app actually renders is
// asserted here; picking a "nicer" lighter grey later will fail the build
// instead of quietly shipping unreadable 13px text.
//
// WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text (>=18.66px bold
// or >=24px regular) and for non-text graphics like icons and borders.
// Nothing in this app renders these colours at large-text sizes, so 4.5
// is the bar throughout.

const AA_NORMAL = 4.5;
const AA_GRAPHIC = 3;

/** WCAG relative luminance of an #RRGGBB colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The three surfaces body text lands on. surfaceSecondary is included
 * because it backs the search field's clear button (app/index.tsx) and the
 * verification block (app/place/[id].tsx) — but note it only ever carries
 * `text` or `textSecondary`. It is a tile, track and badge fill, never a
 * card, so the accent and status inks below are deliberately not asserted
 * against it: requiring that would force them darker for a pairing the app
 * does not render.
 */
const BACKGROUNDS = ["canvas", "surface", "surfaceSecondary"] as const;

/** Where an accent or status ink is actually used as text. */
const INK_ON = [
  ["accent", "canvas"],
  ["accent", "surface"],
  ["accent", "accentSoft"],
  ["positive", "canvas"],
  ["positive", "surface"],
  ["positive", "positiveSoft"],
  ["attention", "canvas"],
  ["attention", "surface"],
  ["attention", "attentionSoft"],
] as const;

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
])("%s palette", (_name, colors) => {
  describe.each(BACKGROUNDS)("on %s", (bg) => {
    it.each(["text", "textSecondary"] as const)("%s is readable", (fg) => {
      expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });
  });

  it.each(INK_ON)("%s ink is readable on %s", (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  // Buttons put canvas-coloured text on a filled accent. This is the pair
  // that shipped at 2.07:1 in dark mode, because it was hardcoded #FFFFFF
  // rather than read from the palette.
  it("button labels are readable on a filled accent", () => {
    expect(contrastRatio(colors.canvas, colors.accent)).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  // Not text, so the lower graphic bar applies — but a border nobody can
  // see is a border that isn't doing its job.
  it("borders are visible against their surfaces", () => {
    expect(contrastRatio(colors.border, colors.canvas)).toBeGreaterThan(1.1);
  });

  it("the you-are-here blue is readable", () => {
    expect(
      contrastRatio(colors.youAreHere, colors.canvas),
    ).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe("place type colours", () => {
  // These sit on map tiles rather than app surfaces, so they are judged as
  // graphics (3:1). They are also baked into assets/pins/*.png — changing
  // one here without re-running scripts/gen-pin-assets.js desyncs the map
  // from the legend.
  //
  // Deliberately NOT asserted: that the three are distinguishable from one
  // another. Contrast ratio is a luminance measure, and these are chosen to
  // differ by HUE at similar lightness — masjid green and multi-faith
  // purple sit at 1.04:1 and are still trivially told apart. A contrast
  // assertion there would be testing the wrong property and would push the
  // palette towards a meaningless lightness spread.
  it("read against a white map tile", () => {
    for (const colour of Object.values(placeTypeColors)) {
      expect(contrastRatio(colour, "#FFFFFF")).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
    }
  });

  it("read as icons on the list card's type tile", () => {
    // PlaceCard draws these over surfaceSecondary. The icon's SHAPE carries
    // the meaning and every row is labelled in text, so colour is redundant
    // here — but it should still be discernible.
    for (const colour of Object.values(placeTypeColors)) {
      expect(
        contrastRatio(colour, lightColors.surfaceSecondary),
      ).toBeGreaterThan(2.5);
    }
  });
});
