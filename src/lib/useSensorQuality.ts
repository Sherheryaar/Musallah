// The two advisory sensors behind the compass-quality verdict.
//
// Magnetometer field strength catches magnets and metal (an interfered
// compass reads confidently and WRONG — the single biggest cause of "the
// qibla app is off"); the accelerometer catches a tilted phone. Neither is
// the heading itself, which comes from useCompassHeading.

import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { Accelerometer, Magnetometer } from "expo-sensors";

import { magnitude, tiltFromFlat } from "./compassQuality";

const SAMPLE_INTERVAL_MS = 500;

export function useSensorQuality(): {
  /** Total field in microtesla, or null until the first sample. */
  fieldStrength: number | null;
  /** Degrees from flat, or null until the first sample. */
  tiltDeg: number | null;
  /** Native-driven spirit-level bubble offsets: zero JS re-renders. */
  bubbleX: Animated.Value;
  bubbleY: Animated.Value;
} {
  const [fieldStrength, setFieldStrength] = useState<number | null>(null);
  const [tiltDeg, setTiltDeg] = useState<number | null>(null);
  const bubbleX = useRef(new Animated.Value(0)).current;
  const bubbleY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mag: { remove: () => void } | null = null;
    let acc: { remove: () => void } | null = null;
    try {
      Magnetometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      mag = Magnetometer.addListener((v) => {
        // Expo reports microtesla on both platforms.
        setFieldStrength(Math.round(magnitude(v)));
      });
      acc = Accelerometer.addListener((v) => {
        setTiltDeg(Math.round(tiltFromFlat(v)));
        const spring = (value: Animated.Value, to: number) =>
          Animated.spring(value, {
            toValue: Math.max(-5, Math.min(5, to)),
            useNativeDriver: true,
            friction: 7,
            tension: 40,
          }).start();
        spring(bubbleX, -v.x * 6);
        spring(bubbleY, v.y * 6);
      });
    } catch {
      // No sensors — quality checks simply stay unavailable.
    }
    return () => {
      mag?.remove();
      acc?.remove();
    };
  }, [bubbleX, bubbleY]);

  return { fieldStrength, tiltDeg, bubbleX, bubbleY };
}
