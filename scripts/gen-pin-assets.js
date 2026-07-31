/**
 * Generates the map pin dot PNGs in assets/pins/ (1x, 2x and 3x for each
 * place type). Dependency-free: draws an anti-aliased circle with a white
 * border and encodes the PNG by hand using Node's built-in zlib.
 *
 * Run with: node scripts/gen-pin-assets.js
 *
 * Why images instead of <View> markers: iOS (Apple Maps) snapshots
 * view-based marker children and drops them after the first frame, so
 * custom dots flashed once and disappeared. Image markers are handed to
 * the native annotation directly and render reliably on both platforms.
 */
const fs = require("fs");
const path = require("path");
const { encodePng, hexToRgb } = require("./lib/png");

// Colours mirror placeTypeColors in src/lib/theme.ts -- keep in sync.
// No blue: the map's user-location dot is blue, and a blue pin was
// indistinguishable from "you are here".
const PINS = {
  "dot-masjid": "#2E7D57", // placeTypeColors.masjid (green)
  "dot-musalla": "#D5803B", // placeTypeColors.musalla (amber)
  "dot-multi-faith": "#7A5FA8", // placeTypeColors.multi_faith_room (purple)
};

const SIZE_PT = 16; // rendered size in points
const BORDER_PT = 2.5; // white ring width in points

// ---- Dot drawing (4x4 supersampled for smooth edges) ----

function makeDot(scale, fillHex) {
  const size = SIZE_PT * scale;
  const [fr, fg, fb] = hexToRgb(fillHex);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 0.5 * scale; // hair of padding so edges never clip
  const rInner = rOuter - BORDER_PT * scale;
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let outer = 0;
      let inner = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const d = Math.hypot(px - cx, py - cy);
          if (d <= rOuter) outer++;
          if (d <= rInner) inner++;
        }
      }
      outer /= SS * SS;
      inner /= SS * SS;

      const alpha = outer;
      const ring = outer - inner; // white border coverage
      let r = 0;
      let g = 0;
      let b = 0;
      if (alpha > 0) {
        r = (inner * fr + ring * 255) / alpha;
        g = (inner * fg + ring * 255) / alpha;
        b = (inner * fb + ring * 255) / alpha;
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, "..", "assets", "pins");
fs.mkdirSync(outDir, { recursive: true });

for (const [name, color] of Object.entries(PINS)) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const file = path.join(outDir, `${name}${suffix}.png`);
    fs.writeFileSync(file, makeDot(scale, color));
    console.log("wrote", path.relative(path.join(__dirname, ".."), file));
  }
}
