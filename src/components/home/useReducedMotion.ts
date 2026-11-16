import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/** Native and web reduced-motion preference. Tests render final states immediately. */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => {
    if (process.env.NODE_ENV === "test") return true;
    if (Platform.OS === "web" && typeof window !== "undefined")
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return false;
  });
  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      const changed = (event: MediaQueryListEvent) => setReduce(event.matches);
      query.addEventListener?.("change", changed);
      return () => query.removeEventListener?.("change", changed);
    }
    const info = AccessibilityInfo as typeof AccessibilityInfo & {
      isReduceMotionEnabled?: () => Promise<boolean>;
    };
    let active = true;
    void info
      .isReduceMotionEnabled?.()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => undefined);
    const subscription = info.addEventListener?.(
      "reduceMotionChanged",
      setReduce,
    ) as { remove?: () => void } | undefined;
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return reduce;
}
