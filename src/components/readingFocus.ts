import { AccessibilityInfo, type View } from "react-native";

/** The caller revalidates the route, identity and placement on every lookup. */
export function restoreReadingFocus(target: () => View | undefined) {
  let cancelled = false;
  const frame = requestAnimationFrame(() => {
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        const node = !cancelled && enabled ? target() : undefined;
        if (node) AccessibilityInfo.sendAccessibilityEvent(node, "focus");
      })
      .catch(() => undefined);
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
