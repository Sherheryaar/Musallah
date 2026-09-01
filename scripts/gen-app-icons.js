/**
 * Generates the app icons: a white mosque silhouette (dome,
 * two minarets, arched doorway) on the app's accent-green background.
 * Dependency-free — same procedural PNG approach as gen-pin-assets.js.
 *
 * Run with: node scripts/gen-app-icons.js
 *
 * Outputs:
 *   assets/icon.png                 1024×1024  app icon (app.json "icon"; iOS
 *                                              requires a full-bleed opaque
 *                                              square — the OS rounds the
 *                                              corners itself)
 *   assets/adaptive-icon.png        1024×1024  Android adaptive foreground
 *                                              (transparent; composited over
 *                                              adaptiveIcon.backgroundColor)
 *   assets/adaptive-icon-mono.png   1024×1024  Android 13+ themed icon
 *   assets/notification-icon.png       96×96   Android notification small
 *                                              icon (alpha-only stencil)
 *
 * The three transparent assets exist because Android does not treat a
 * plain square icon the way iOS does: without an adaptive icon it badges
 * the legacy square, and without a dedicated notification icon it falls
 * back to the launcher icon and renders it as a SOLID WHITE BLOCK in the
 * status bar for every prayer reminder.
 */
const fs = require("fs");
const path = require("path");
const { encodePng, hexToRgb } = require("./lib/png");

const BACKGROUND = "#2E7D57"; // colors.accent in src/lib/theme.ts (masjid green)
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

// The glyph's own bounding box in unit space: x spans the two minarets,
// y runs from the minaret caps to the base of the hall. Its centre sits
// BELOW the canvas centre, which is why re-centring is not a no-op.
const GLYPH_BOX = { x1: 0.13, y1: 0.355, x2: 0.87, y2: 0.74 };
const GLYPH_CX = (GLYPH_BOX.x1 + GLYPH_BOX.x2) / 2;
const GLYPH_CY = (GLYPH_BOX.y1 + GLYPH_BOX.y2) / 2;
const GLYPH_W = GLYPH_BOX.x2 - GLYPH_BOX.x1;

/**
 * Render at `size` px, 4×4 supersampled.
 *
 * `background: null` writes a transparent canvas and puts the glyph in the
 * alpha channel — required for Android's adaptive foreground (the OS
 * composites it over its own background layer and masks the result to
 * whatever shape the launcher wants) and for the notification icon (where
 * Android DISCARDS all colour and uses alpha alone as a stencil, so an
 * opaque square renders as a solid white block in the status bar).
 *
 * `fit` scales the glyph to occupy that fraction of the canvas width AND
 * re-centres it (its bounding box sits slightly below centre as drawn).
 * Adaptive foregrounds must keep their art inside the central 66% safe
 * zone, since everything outside can be cropped by the launcher's mask.
 *
 * Omitting `fit` leaves the geometry EXACTLY as originally authored —
 * icon.png already ships, and re-centring it would move the mark for no
 * reason.
 */
function makeIcon(size, { background = BACKGROUND, fit = null } = {}) {
  const [gr, gg, gb] = hexToRgb(GLYPH);
  const [br, bg, bb] = background ? hexToRgb(background) : [0, 0, 0];
  const scale = fit === null ? null : fit / GLYPH_W;
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = (y + (sy + 0.5) / SS) / size;
          // Map the canvas point back into glyph space, so the glyph is
          // scaled about its own centre and lands on the canvas centre.
          const gx = scale === null ? ux : GLYPH_CX + (ux - 0.5) / scale;
          const gy = scale === null ? uy : GLYPH_CY + (uy - 0.5) / scale;
          if (inGlyph(gx, gy)) hits++;
        }
      }
      const t = hits / (SS * SS);
      const i = (y * size + x) * 4;
      if (background) {
        rgba[i] = Math.round(br + (gr - br) * t);
        rgba[i + 1] = Math.round(bg + (gg - bg) * t);
        rgba[i + 2] = Math.round(bb + (gb - bb) * t);
        rgba[i + 3] = 255;
      } else {
        // Premultiplied-safe: keep the glyph colour flat and vary alpha, so
        // antialiased edges don't fringe against an unknown backdrop.
        rgba[i] = gr;
        rgba[i + 1] = gg;
        rgba[i + 2] = gb;
        rgba[i + 3] = Math.round(255 * t);
      }
    }
  }
  return encodePng(size, size, rgba);
}

const root = path.join(__dirname, "..");
const outputs = [
  // iOS + the legacy Android icon: full-bleed, opaque (iOS forbids alpha).
  [path.join(root, "assets", "icon.png"), 1024, {}],
  // Android adaptive foreground. Transparent, glyph inside the safe zone;
  // app.json pairs it with backgroundColor #2E7D57 so the composited result
  // matches icon.png. Without this Android 8+ shrinks the legacy square
  // into a system-drawn badge.
  [path.join(root, "assets", "adaptive-icon.png"), 1024, { background: null, fit: 0.6 }],
  // Android 13+ themed icons: the launcher tints the alpha with the user's
  // wallpaper palette, so colour here is irrelevant. Drawn slightly smaller
  // — themed icons are rendered inside a tighter mask than adaptive ones.
  [path.join(root, "assets", "adaptive-icon-mono.png"), 1024, { background: null, fit: 0.54 }],
  // Notification small icon. Android renders alpha only, at ~24dp.
  [path.join(root, "assets", "notification-icon.png"), 96, { background: null, fit: 0.82 }],
];

for (const [file, size, options] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeIcon(size, options));
  console.log("wrote", path.relative(root, file), `(${size}x${size})`);
}
