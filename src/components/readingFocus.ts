import { AccessibilityInfo, type View } from "react-native";

/** null is valid but not mounted; undefined permanently invalidates the origin. */
export type ReadingFocusTarget = () => View | null | undefined;

/** The caller revalidates the route, identity and placement on every lookup. */
export function restoreReadingFocus(target: ReadingFocusTarget) {
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
