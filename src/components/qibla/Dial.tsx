import React, { useMemo } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Circle, Path, Polygon } from "react-native-svg";

import KaabaMark from "@/components/KaabaMark";
import { useTheme } from "@/context/ThemeContext";
import { elevation } from "@/lib/elevation";
import { ALIGNED_TOLERANCE_DEG } from "@/lib/qibla";
import { type, type ThemeColors } from "@/lib/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// --- Dial geometry -------------------------------------------------------
// Every dimension derives from the dial size so the instrument fits a 360px
// phone and a foldable without two sets of magic numbers.

/** Distance from the dial's edge to the outer end of the graduations. */
const RIM = 12;
const TICK_MINOR = { w: 1.5, h: 6 };
const TICK_MAJOR = { w: 2, h: 12 };
/** The Kaaba mark's box at the needle's tip. */
const KAABA_SIZE = 26;

const CARDINALS: { angle: number; label: string }[] = [
  { angle: 0, label: "N" },
  { angle: 90, label: "E" },
  { angle: 180, label: "S" },
  { angle: 270, label: "W" },
];

/**
 * Graduated bezel: 72 ticks every 5°, emphasised every 30°.
 *
 * Drawn as TWO stroked circles with a dash pattern rather than 72 views —
 * one node each, and the spacing is exact by construction. A circle's path
 * starts at 3 o'clock, and both 90° and 30° are whole multiples of the 5°
 * period, so a tick lands on each cardinal without any phase correction
 * beyond centring the dash on its own angle.
 */
function bezelDashes(radius: number, everyDeg: number, width: number) {
  const circumference = 2 * Math.PI * radius;
  const period = (circumference * everyDeg) / 360;
  return {
    strokeDasharray: [width, period - width] as number[],
    // Half a dash back, so each tick straddles its angle instead of
    // starting on it.
    strokeDashoffset: width / 2,
  };
}

/** SVG path for a wedge of an annulus, angles in degrees clockwise from 12. */
function annulusSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  fromDeg: number,
  toDeg: number,
): string {
  // SVG's 0° is at 3 o'clock; the dial's 0° is at 12.
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1o, y1o] = pt(rOuter, fromDeg);
  const [x2o, y2o] = pt(rOuter, toDeg);
  const [x2i, y2i] = pt(rInner, toDeg);
  const [x1i, y1i] = pt(rInner, fromDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return [
    `M ${x1o} ${y1o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i}`,
    "Z",
  ].join(" ");
}

type Props = {
  /** Diameter in points (already clamped by the screen). */
  size: number;
  /** Unbounded heading accumulator from useCompassHeading. */
  spin: Animated.Value;
  /** 0 → 1 as alignment is acquired; native driver (transform/opacity). */
  lock: Animated.Value;
  /** The same 0 → 1 on the JS driver, for the SVG ring's strokeDashoffset. */
  ring: Animated.Value;
  /** One-shot 0 → 1 radial wave on lock-on. */
  pulseWave: Animated.Value;
  /** Spirit-level bubble offsets from useSensorQuality. */
  bubbleX: Animated.Value;
  bubbleY: Animated.Value;
  /** Qibla bearing from true north, degrees. */
  bearing: number;
  /** The sun's azimuth while it is up, else null. */
  sunAzimuth: number | null;
  locked: boolean;
  /**
   * False when there is no live heading: the rose is then frozen north-up
   * and the gate, capture window and ring come off. A dial that can't track
   * is a diagram, and must not be dressed as an instrument.
   */
  instrument: boolean;
  needleColor: string;
};

/**
 * The compass rose. ONE native animated node carries the entire face; every
 * child is a static transform inside it, so the compass costs a single native
 * rotation per frame instead of fourteen JS-computed ones.
 */
export default function Dial({
  size: dial,
  spin,
  lock,
  ring,
  pulseWave,
  bubbleX,
  bubbleY,
  bearing,
  sunAzimuth,
  locked,
  instrument,
  needleColor,
}: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(
    () => createStyles(colors, scheme, dial),
    [colors, scheme, dial],
  );

  // --- Geometry, in SVG user units ---------------------------------------
  const c = dial / 2;
  const rOuter = c - RIM;
  const rMinor = rOuter - TICK_MINOR.h / 2;
  const rMajor = rOuter - TICK_MAJOR.h / 2;
  const minorDash = useMemo(() => bezelDashes(rMinor, 5, TICK_MINOR.w), [rMinor]);
  const majorDash = useMemo(() => bezelDashes(rMajor, 30, TICK_MAJOR.w), [rMajor]);
  // The needle, pointing at 12 o'clock, already offset to the dial centre.
  // A short tail crosses the hub so it reads as a balanced instrument
  // needle rather than an arrow sticker pasted on.
  const needlePoints = useMemo(() => {
    const k = dial / 320;
    // Y coordinates, not radii: the tip sits 30px inside the rim to leave
    // the Kaaba mark its own space on the graduations.
    const tipY = c - (rOuter - 30 * k);
    const shoulderY = tipY + 28 * k;
    const tailY = c + 50 * k;
    const w = 7 * k;
    return [
      `${c},${tipY}`,
      `${c + w},${shoulderY}`,
      `${c + w * 0.42},${tailY}`,
      `${c - w * 0.42},${tailY}`,
      `${c - w},${shoulderY}`,
    ].join(" ");
  }, [dial, c, rOuter]);
  // Confirmation ring: the circumference IS the dash length, so animating
  // the offset from C to 0 makes a ring visibly close rather than fade in.
  const ringRadius = c - 3;
  const ringLength = 2 * Math.PI * ringRadius;
  const captureWedge = useMemo(
    () =>
      annulusSector(
        c,
        c,
        rOuter - 22,
        rOuter,
        -ALIGNED_TOLERANCE_DEG,
        ALIGNED_TOLERANCE_DEG,
      ),
    [c, rOuter],
  );

  // `border` is a 1.4:1 whisper on the dark well, so the minor graduations
  // simply vanish there. Dark mode draws them from textSecondary held back
  // by opacity instead: subordinate to the majors without disappearing.
  const minorTickColor = scheme === "dark" ? colors.textSecondary : colors.border;
  const minorTickOpacity = scheme === "dark" ? 0.45 : 1;

  // --- Interpolations ----------------------------------------------------
  // The face turns anticlockwise as the user turns clockwise; glyphs that
  // must stay upright cancel that rotation with the opposite one.
  const faceSpin = useMemo(
    () => spin.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "-360deg"] }),
    [spin],
  );
  const uprightSpin = useMemo(
    () => spin.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }),
    [spin],
  );
  const needleScale = useMemo(
    () => lock.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
    [lock],
  );
  const gateOpacity = useMemo(
    () => lock.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
    [lock],
  );
  // Full circumference (open) → 0 (closed).
  const ringDashOffset = useMemo(
    () => ring.interpolate({ inputRange: [0, 1], outputRange: [ringLength, 0] }),
    [ring, ringLength],
  );
  const upright = instrument ? [{ rotate: uprightSpin }] : [];

  return (
    <View style={styles.dialWrap}>
      {/* Fixed index gate at 12 o'clock. This is what turns a floating arrow
          into a task: bring the Kaaba mark into the gate. It does NOT rotate —
          it is the target, not part of the rose. */}
      {instrument ? (
        <Animated.View style={[styles.gate, { opacity: gateOpacity }]}>
          <MaterialCommunityIcons
            name="menu-down"
            size={26}
            color={locked ? colors.accent : colors.text}
          />
        </Animated.View>
      ) : null}

      <View style={styles.dial}>
        {/* Screen-fixed overlay: the capture window and the confirmation ring
            belong to the GATE, not to the rose, so they must not rotate with
            the heading. This layer's parent is the dial itself, which is NOT
            inert, so unlike the Svgs inside the face it needs its own
            pointerEvents. */}
        {instrument ? (
          <Svg
            width={dial}
            height={dial}
            style={[StyleSheet.absoluteFill, styles.inert]}
          >
            {/* The ±5° window, visible BEFORE you reach it. */}
            <Path d={captureWedge} fill={colors.accent} opacity={0.14} />
            {/* Closes clockwise from 12 as alignment is acquired.
                strokeDashoffset is not native-drivable, which is exactly why
                `ring` is a separate Animated.Value from `lock`. */}
            <AnimatedCircle
              cx={c}
              cy={c}
              r={ringRadius}
              fill="none"
              stroke={colors.accent}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={[ringLength, ringLength]}
              strokeDashoffset={ringDashOffset}
              // Start the ring at 12 o'clock rather than 3.
              originX={c}
              originY={c}
              rotation={-90}
            />
          </Svg>
        ) : null}

        <Animated.View
          style={[
            styles.face,
            instrument ? { transform: [{ rotate: faceSpin }] } : null,
          ]}
        >
          {/* The graduated bezel: 72 ticks in two nodes. */}
          <Svg width={dial} height={dial} style={StyleSheet.absoluteFill}>
            <Circle
              cx={c}
              cy={c}
              r={rMinor}
              fill="none"
              stroke={minorTickColor}
              strokeOpacity={minorTickOpacity}
              strokeWidth={TICK_MINOR.h}
              {...minorDash}
            />
            <Circle
              cx={c}
              cy={c}
              r={rMajor}
              fill="none"
              stroke={colors.textSecondary}
              strokeOpacity={0.9}
              strokeWidth={TICK_MAJOR.h}
              {...majorDash}
            />
          </Svg>

          {CARDINALS.map(({ angle, label }) => (
            <View
              key={label}
              style={[styles.rotor, { transform: [{ rotate: `${angle}deg` }] }]}
            >
              {/* Counter-rotated so the letter stays upright as the dial
                  turns. Rotation is about the glyph's own centre, which is
                  why this cancels rather than compounds. */}
              <Animated.Text
                allowFontScaling={false}
                style={[
                  styles.cardinal,
                  label === "N" && styles.cardinalNorth,
                  { transform: [{ rotate: `${-angle}deg` }, ...upright] },
                ]}
              >
                {label}
              </Animated.Text>
            </View>
          ))}

          {/* The sun's live position on the rim — lets anyone sanity-check the
              dial against the sky at a glance. A vector icon, not the ☀️
              emoji: emoji ignore `color`, and at 14px on a rotating element
              Android renders it as a smear. */}
          {sunAzimuth !== null ? (
            <View
              style={[styles.rotor, { transform: [{ rotate: `${sunAzimuth}deg` }] }]}
            >
              <Animated.View
                style={{
                  marginTop: RIM + TICK_MAJOR.h + 16,
                  transform: [{ rotate: `${-sunAzimuth}deg` }, ...upright],
                }}
              >
                <MaterialCommunityIcons
                  name="white-balance-sunny"
                  size={17}
                  color={colors.attention}
                />
              </Animated.View>
            </View>
          ) : null}

          {/* The qibla needle. */}
          <Animated.View
            style={[
              styles.rotor,
              { transform: [{ rotate: `${bearing}deg` }, { scale: needleScale }] },
            ]}
          >
            {/* Authored SVG, not the 🕋 emoji — see KaabaMark. It follows
                `needleColor`, so when the compass is not trustworthy the mark
                dims with the needle instead of contradicting it. */}
            <Animated.View
              style={{
                width: KAABA_SIZE,
                height: KAABA_SIZE,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ rotate: `${-bearing}deg` }, ...upright],
              }}
            >
              <KaabaMark
                size={KAABA_SIZE}
                color={needleColor}
                bandColor={colors.canvas}
              />
            </Animated.View>
            {/* One polygon: tip, shoulders, and a counterweight tail crossing
                the hub. A head-plus-stem pair meets at a visible seam and
                cannot taper. */}
            <Svg width={dial} height={dial} style={StyleSheet.absoluteFill}>
              <Polygon points={needlePoints} fill={needleColor} />
            </Svg>
          </Animated.View>
        </Animated.View>

        <View style={styles.hub}>
          <View style={styles.hubCenterTarget} />
          <Animated.View
            style={[
              styles.spiritBubble,
              {
                transform: [{ translateX: bubbleX }, { translateY: bubbleY }],
                backgroundColor: locked ? colors.accent : colors.textSecondary,
              },
            ]}
          />
        </View>

        {locked ? (
          <Animated.View
            style={[
              styles.rippleWave,
              {
                transform: [
                  {
                    scale: pulseWave.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.25],
                    }),
                  },
                ],
                opacity: pulseWave.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 0],
                }),
                borderColor: colors.accent,
              },
            ]}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (
  colors: ThemeColors,
  scheme: "light" | "dark",
  dial: number,
) => {
  // Depth reads differently per theme: a black shadow on a near-black screen
  // is invisible, so dark mode expresses lift by luminance (a lighter well, a
  // lit top edge) instead. Value-only across schemes — see cardEdge.
  const lift =
    scheme === "dark"
      ? {
          borderColor: colors.surfaceSecondary,
          ...Platform.select({
            android: { elevation: 0 },
            default: {
              shadowColor: "#000",
              shadowOpacity: 0,
              shadowRadius: 0,
              shadowOffset: { width: 0, height: 0 },
            },
          }),
        }
      : { borderColor: colors.border, ...elevation(scheme, "ambient") };

  return StyleSheet.create({
    dialWrap: {
      width: dial,
      alignItems: "center",
    },
    /** Any decorative layer that must never intercept a touch. */
    inert: {
      pointerEvents: "none",
    },
    gate: {
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: -4,
      pointerEvents: "none",
    },
    dial: {
      width: dial,
      height: dial,
      borderRadius: dial / 2,
      borderWidth: 1,
      backgroundColor: colors.canvas,
      ...lift,
    },
    face: {
      position: "absolute",
      width: dial,
      height: dial,
      pointerEvents: "none",
    },
    // Each glyph sits in a full-size layer rotated about the dial's centre;
    // its child is pinned to the top, so rotating the layer sweeps the child
    // around the rim.
    rotor: {
      position: "absolute",
      width: dial,
      height: dial,
      alignItems: "center",
      paddingTop: RIM,
      pointerEvents: "none",
    },
    cardinal: {
      marginTop: TICK_MAJOR.h + 6,
      ...type.caption,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },
    cardinalNorth: {
      color: colors.text,
    },
    hub: {
      position: "absolute",
      top: dial / 2 - 13,
      left: dial / 2 - 13,
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    hubCenterTarget: {
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      opacity: 0.5,
    },
    spiritBubble: {
      position: "absolute",
      width: 8,
      height: 8,
      borderRadius: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 1,
    },
    rippleWave: {
      position: "absolute",
      top: 0,
      left: 0,
      width: dial,
      height: dial,
      borderRadius: dial / 2,
      borderWidth: 2,
    },
  });
};
