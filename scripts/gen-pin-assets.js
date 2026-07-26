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
const zlib = require("zlib");

// Colours mirror src/lib/theme.ts -- keep them in sync if the theme changes.
const PINS = {
  "dot-masjid": "#2783DE", // colors.accent
  "dot-musalla": "#46A171", // colors.positive
  "dot-multi-faith": "#D5803B", // colors.attention
};

const SIZE_PT = 16; // rendered size in points
const BORDER_PT = 2.5; // white ring width in points

// ---- Minimal PNG encoder (8-bit RGBA, no filtering) ----

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // Each scanline is prefixed with a 0 (no filter) byte.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Dot drawing (4x4 supersampled for smooth edges) ----

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

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
