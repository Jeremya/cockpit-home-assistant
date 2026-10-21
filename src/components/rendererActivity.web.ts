import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { View } from "react-native";
import { useIsFocused } from "expo-router";
const subscribe = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
const visible = () => !document.hidden;
export function useRendererActivity() {
  const focused = useIsFocused();
  const active = useSyncExternalStore(subscribe, visible, () => false);
  const [node, setNode] = useState<Element | null>(null);
  const [inViewport, setInViewport] = useState(true);
  const ref = useCallback(
    (value: View | null) => setNode(value as unknown as Element | null),
    [],
  );
  useEffect(() => {
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.target === node);
      if (entry) setInViewport(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return { mount: focused && active, visible: inViewport, setHost: ref };
}
