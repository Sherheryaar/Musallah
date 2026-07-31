/**
 * Generates the app icon and PWA icons: a white mosque silhouette (dome,
 * two minarets, arched doorway) on the app's accent-blue background.
 * Dependency-free — same procedural PNG approach as gen-pin-assets.js.
 *
 * Run with: node scripts/gen-app-icons.js
 *
 * Outputs:
 *   assets/icon.png       1024×1024  app icon (app.json "icon"; iOS requires
 *                                    a full-bleed opaque square — the OS
 *                                    rounds the corners itself)
 *   public/icon-512.png    512×512   PWA manifest icon
 *   public/icon-192.png    192×192   PWA manifest icon + favicon/apple-touch
 */
const fs = require("fs");
const path = require("path");
const { encodePng, hexToRgb } = require("./lib/png");

const BACKGROUND = "#2783DE"; // colors.accent in src/lib/theme.ts
const GLYPH = "#FFFFFF";

// All geometry in unit coordinates (0..1), so every size renders identically.
const inRect = (x, y, x1, y1, x2, y2) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** The mosque silhouette: true if the unit point is glyph-coloured. */
function inGlyph(x, y) {
  // Arched doorway is carved out of everything.
  const door =
    inRect(x, y, 0.455, 0.585, 0.545, 0.74) || inCircle(x, y, 0.5, 0.585, 0.045);
  if (door) return false;

  return (
    // Main hall
    inRect(x, y, 0.2, 0.56, 0.8, 0.74) ||
    // Central dome (upper half only) + finial
    (inCircle(x, y, 0.5, 0.56, 0.165) && y <= 0.56) ||
    inCircle(x, y, 0.5, 0.375, 0.02) ||
    // Minarets + their caps
    inRect(x, y, 0.13, 0.36, 0.175, 0.74) ||
    inRect(x, y, 0.825, 0.36, 0.87, 0.74) ||
    (inCircle(x, y, 0.1525, 0.36, 0.034) && y <= 0.36) ||
    (inCircle(x, y, 0.8475, 0.36, 0.034) && y <= 0.36)
  );
}

/** Render at `size` px, 4×4 supersampled, fully opaque (iOS forbids alpha). */
function makeIcon(size) {
  const [br, bg, bb] = hexToRgb(BACKGROUND);
  const [gr, gg, gb] = hexToRgb(GLYPH);
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = (y + (sy + 0.5) / SS) / size;
          if (inGlyph(ux, uy)) hits++;
        }
      }
      const t = hits / (SS * SS);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(br + (gr - br) * t);
      rgba[i + 1] = Math.round(bg + (gg - bg) * t);
      rgba[i + 2] = Math.round(bb + (gb - bb) * t);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const root = path.join(__dirname, "..");
const outputs = [
  [path.join(root, "assets", "icon.png"), 1024],
  [path.join(root, "public", "icon-512.png"), 512],
  [path.join(root, "public", "icon-192.png"), 192],
];

for (const [file, size] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeIcon(size));
  console.log("wrote", path.relative(root, file), `(${size}x${size})`);
}
