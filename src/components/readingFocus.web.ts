import type { View } from "react-native";

/** Route focus can precede removal of the navigator's hidden/inert attributes. */
export function restoreReadingFocus(target: () => View | undefined) {
  let observer: MutationObserver | undefined;
  let cancelled = false;
  const attempt = () => {
    if (cancelled) return;
    const node = target() as unknown as HTMLElement | undefined;
    if (!node?.isConnected) {
      observer?.disconnect();
      return;
    }
    if (
      node.getClientRects().length &&
      !node.closest('[inert], [aria-hidden="true"]')
    ) {
      observer?.disconnect();
      node.focus();
    } else if (!observer) {
      observer = new MutationObserver(attempt);
      observer.observe(node.ownerDocument.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "hidden", "aria-hidden", "inert"],
      });
    }
  };
  const frame = requestAnimationFrame(attempt);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
