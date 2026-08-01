/**
 * Generates the map cluster-bubble PNGs in assets/pins/ (1x/2x/3x per count
 * bucket). Same rationale as gen-pin-assets.js: iOS view-based markers
 * re-rasterize constantly and CRASH with a few hundred live bubbles, so the
 * count label is baked into a static image the native map can own.
 *
 * Run with: node scripts/gen-cluster-assets.js
 *
 * Counts are bucketed (2-9 exact, then 10+/20+/30+/50+/100+/200+/500+) so a
 * small fixed set of images covers every possible cluster. Bubble diameter
 * grows with the tier for visual hierarchy.
 */
const fs = require("fs");
const path = require("path");
const { encodePng, hexToRgb } = require("./lib/png");

// Mirror placeTypeColors.masjid in src/lib/theme.ts. Never blue -- the
// user-location dot owns blue on this map.
const FILL = "#2E7D57";
const HALO_ALPHA = 0.3; // soft outer ring, communicates "group"

// Buckets: label -> bubble diameter in points (halo adds 3pt around it).
const BUCKETS = {
  2: 26, 3: 26, 4: 26, 5: 26, 6: 26, 7: 26, 8: 26, 9: 26,
  "10+": 32, "20+": 32, "30+": 32,
  "50+": 38, "100+": 38,
  "200+": 44, "500+": 44,
};

const HALO_PT = 3;
const RING_PT = 2;

// 3x5 bitmap font, rendered as rounded cells and scaled to the bubble.
const FONT = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "001", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
};

function makeBubble(label, bubblePt, scale) {
  const size = (bubblePt + HALO_PT * 2) * scale;
  const [fr, fg, fb] = hexToRgb(FILL);
  const c = size / 2;
  const rHalo = size / 2 - 0.5 * scale;
  const rBubble = rHalo - HALO_PT * scale;
  const rFill = rBubble - RING_PT * scale;
  const SS = 4;

  // --- label geometry ---------------------------------------------------
  const chars = String(label).split("");
  const unitsW = chars.length * 4 - 1; // 3 per glyph + 1 gap
  const innerD = rFill * 2;
  // Fit within a comfortable chord of the fill circle, cap by height.
  const u = Math.max(
    scale,
    Math.min(
      Math.floor((innerD * 0.72) / unitsW),
      Math.floor((innerD * 0.52) / 5),
    ),
  );
  const textW = unitsW * u;
  const textH = 5 * u;
  const tx0 = c - textW / 2;
  const ty0 = c - textH / 2;

  // Is this supersample point inside a lit, rounded font cell?
  const cellR = u * 0.22; // rounded corners soften the pixel-font look
  function inText(px, py) {
    const gx = px - tx0;
    const gy = py - ty0;
    if (gx < 0 || gy < 0 || gx >= textW || gy >= textH) return false;
    const col = Math.floor(gx / u);
    const row = Math.floor(gy / u);
    const ch = chars[Math.floor(col / 4)];
    const sub = col % 4;
    if (sub === 3) return false; // gap between glyphs
    const glyph = FONT[ch];
    if (!glyph || glyph[row][sub] !== "1") return false;
    // Rounded corners: reject points in the cell's sharp corner regions.
    const lx = gx - col * u;
    const ly = gy - row * u;
    const nx = Math.max(cellR - lx, lx - (u - cellR), 0);
    const ny = Math.max(cellR - ly, ly - (u - cellR), 0);
    return Math.hypot(nx, ny) <= cellR + 0.001 || nx === 0 || ny === 0;
  }

  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let halo = 0;
      let bubble = 0;
      let fill = 0;
      let text = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const d = Math.hypot(px - c, py - c);
          if (d <= rHalo) halo++;
          if (d <= rBubble) bubble++;
          if (d <= rFill) fill++;
          if (d <= rFill && inText(px, py)) text++;
        }
      }
      const n = SS * SS;
      halo /= n; bubble /= n; fill /= n; text /= n;

      // Composite back-to-front: translucent halo, white ring, green fill,
      // white text.
      const haloOnly = halo - bubble;
      const ringOnly = bubble - fill;
      const fillOnly = fill - text;
      const alpha = haloOnly * HALO_ALPHA + bubble; // ring+fill fully opaque
      let r = 0, g = 0, b = 0;
      if (alpha > 0) {
        r = (haloOnly * HALO_ALPHA * fr + ringOnly * 255 + fillOnly * fr + text * 255) / alpha;
        g = (haloOnly * HALO_ALPHA * fg + ringOnly * 255 + fillOnly * fg + text * 255) / alpha;
        b = (haloOnly * HALO_ALPHA * fb + ringOnly * 255 + fillOnly * fb + text * 255) / alpha;
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(Math.min(r, 255));
      rgba[i + 1] = Math.round(Math.min(g, 255));
      rgba[i + 2] = Math.round(Math.min(b, 255));
      rgba[i + 3] = Math.round(Math.min(alpha, 1) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, "..", "assets", "pins");
fs.mkdirSync(outDir, { recursive: true });

for (const [label, bubblePt] of Object.entries(BUCKETS)) {
  const slug = String(label).replace("+", "p");
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const file = path.join(outDir, `cluster-${slug}${suffix}.png`);
    fs.writeFileSync(file, makeBubble(label, bubblePt, scale));
    console.log("wrote", path.relative(path.join(__dirname, ".."), file));
  }
}
