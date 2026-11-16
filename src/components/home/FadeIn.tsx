import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Platform } from "react-native";
import { useReducedMotion } from "./useReducedMotion";

/** Subtle entrance used by the cockpit; reduced motion applies the final state. */
export function FadeIn({
  children,
  delay = 0,
  offset = 8,
}: {
  children: ReactNode;
  delay?: number;
  offset?: number;
}) {
  const reduce = useReducedMotion();
  // Web is the review/screenshot surface: keep it static there. Native gets the
  // subtle entrance, with reduced motion applying the final state immediately.
  const animate = Platform.OS !== "web" && !reduce;
  const [progress] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 300,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [animate, delay, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [offset, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
