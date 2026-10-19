import type { ReadingFocusTarget } from "./readingFocus";

/** Route focus can precede removal of the navigator's hidden/inert attributes. */
export function restoreReadingFocus(target: ReadingFocusTarget) {
  let observer: MutationObserver | undefined;
  let cancelled = false;
  const attempt = () => {
    if (cancelled) return;
    const node = target() as unknown as HTMLElement | null | undefined;
    if (node === undefined) {
      cancelled = true;
      observer?.disconnect();
      return;
    }
    if (
      node?.isConnected &&
      node.getClientRects().length &&
      !node.closest('[inert], [aria-hidden="true"]')
    ) {
      node.focus();
      if (node.ownerDocument.activeElement === node) {
        cancelled = true;
        observer?.disconnect();
        return;
      }
    }
    // A hidden screen's zero-size layout can remove the marker until its next
    // visible measurement. Ref attachment and exposure are both DOM mutations.
    if (!observer) {
      observer = new MutationObserver(attempt);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
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
