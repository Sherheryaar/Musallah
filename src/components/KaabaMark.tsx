import React from "react";
import Svg, { Rect } from "react-native-svg";

type Props = {
  /** Rendered box, in points. */
  size: number;
  /** The cloth. Follows the needle, so it dims with an untrusted compass. */
  color: string;
  /** Knockout colour for the band — the surface the mark sits on. */
  bandColor: string;
};

/**
 * The Kaaba, as geometry.
 *
 * Replaces the 🕋 emoji (U+1F54B) that used to sit at the needle's tip. The
 * emoji was there because MaterialCommunityIcons has no Kaaba glyph — its
 * `mosque` is a domed mosque, the wrong building — but an emoji is the one
 * thing in this app that could not follow the design:
 *
 *   - Emoji ignore `color`. The needle turns from accent to textSecondary the
 *     moment the compass stops being trustworthy, and the mark AT ITS TIP
 *     stayed fully saturated — the one element contradicting the screen's own
 *     verdict about whether to believe it.
 *   - Its metrics differ per platform, which is why the old code had to pin it
 *     inside a fixed 26pt box to stop the needle shifting.
 *   - It ignores the theme entirely, in an app where everything else is drawn
 *     from a palette that is contrast-tested in both schemes.
 *
 * Two rects: the cloth, and the hizam knocked out of it. Deliberately flat
 * rather than a perspective cube — at 26pt a third face closes up into mud,
 * and the band is what makes the silhouette read as the Kaaba and not a
 * generic box.
 */
export default function KaabaMark({ size, color, bandColor }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={3} width={16} height={18} rx={1.5} fill={color} />
      {/* The hizam sits in the upper third, as it does on the building. */}
      <Rect x={4} y={7.4} width={16} height={3.2} fill={bandColor} />
    </Svg>
  );
}
