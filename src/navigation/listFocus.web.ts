/** Shown to the user: connected, laid out and outside any hidden subtree. */
export const visible = (
  node: Element | null | undefined,
): node is HTMLElement =>
  !!node &&
  node.isConnected &&
  node.getClientRects().length > 0 &&
  !node.closest('[inert], [aria-hidden="true"]');

/** Where focus lands on return to the list, panel or route alike: the origin
 * while it is still shown, else the list title, else the main region (a direct
 * link has no list yet). Null keeps waiting; nothing hidden is ever chosen. */
export function listFocusTarget(
  origin: string | null,
  root: Document = document,
) {
  return (
    [
      origin ? root.querySelector(origin) : null,
      root.getElementById("home-list-title"),
      root.getElementById("maurice-content"),
    ].find(visible) ?? null
  );
}
