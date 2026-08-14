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
 * The colour a semi-transparent foreground ACTUALLY renders as, composited
 * over its background.
 *
 * This is the hole the rest of this file had: every assertion above compares
 * two opaque palette entries, so a perfectly good colour dimmed with
 * `opacity` in a stylesheet was never measured. Two shipped that way —
 * place/[id]'s hero address at 0.9 (4.40:1) and qibla's privacy line at 0.9
 * (4.03:1 in light) — both under AA while every palette test passed.
 */
export function composite(fg: string, bg: string, alpha: number): string {
  const parse = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [f, b] = [parse(fg), parse(bg)];
  const mix = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
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

  // `controlBorder` is the one that must clear the real 1.4.11 bar, because
  // where it is used the outline IS the control: the sheet's drag handle, the
  // unselected radio rings, the qibla tape's graduations. Asserted against
  // accentSoft too — the tape's capture window is painted in it, and the
  // graduations run straight through.
  it.each(["canvas", "surface", "surfaceSecondary", "accentSoft"] as const)(
    "control outlines are identifiable on %s",
    (bg) => {
      expect(
        contrastRatio(colors.controlBorder, colors[bg]),
      ).toBeGreaterThanOrEqual(AA_GRAPHIC);
    },
  );

  // ...and it must still read as a hairline. A control outline that measures
  // as strongly as body text stops looking like an outline.
  it("control outlines recede behind secondary text", () => {
    expect(contrastRatio(colors.controlBorder, colors.canvas)).toBeLessThan(
      contrastRatio(colors.textSecondary, colors.canvas),
    );
  });

  it("the you-are-here blue is readable", () => {
    expect(
      contrastRatio(colors.youAreHere, colors.canvas),
    ).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

/**
 * Text the app deliberately dims with `opacity`. Every entry here is a real
 * stylesheet rule, and the alpha is part of the rendered colour — so it has
 * to be measured as composited, not as the palette entry it started from.
 *
 * If you add an `opacity` to a Text style anywhere, add it here too.
 */
describe("dimmed text", () => {
  const CASES: {
    where: string;
    fg: string;
    bg: string;
    alpha: number;
  }[] = [
    {
      where: "qibla privacy line (light)",
      fg: lightColors.textSecondary,
      bg: lightColors.surface,
      alpha: 1,
    },
    {
      where: "qibla privacy line (dark)",
      fg: darkColors.textSecondary,
      bg: darkColors.surface,
      alpha: 1,
    },
  ];

  it.each(CASES)("$where stays readable at opacity $alpha", ({ fg, bg, alpha }) => {
    expect(
      contrastRatio(composite(fg, bg, alpha), bg),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

/**
 * The hero gradient (place detail, prayer countdown) carries WHITE text at
 * full opacity. A gradient has no single background, so AA is asserted
 * against BOTH stops — text over any point between two passing stops also
 * passes, because the blend's luminance sits between theirs.
 */
describe("hero gradient", () => {
  const HERO_TEXT = "#FFFFFF";

  it.each([
    ["light", lightColors],
    ["dark", darkColors],
  ] as const)("white text clears AA on every %s stop", (_name, colors) => {
    for (const stop of [colors.heroGradientStart, colors.heroGradientEnd]) {
      expect(contrastRatio(HERO_TEXT, stop)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  // White-on-gradient has limited headroom — anyone reaching for `opacity`
  // to build hierarchy on the hero should hit this comment instead. Use
  // size and weight; alpha is the one tool the gradient cannot afford.
  it("leaves almost no headroom to dim white on the lightest stop", () => {
    expect(
      contrastRatio(
        composite(HERO_TEXT, lightColors.heroGradientStart, 0.8),
        lightColors.heroGradientStart,
      ),
    ).toBeLessThan(AA_NORMAL);
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
