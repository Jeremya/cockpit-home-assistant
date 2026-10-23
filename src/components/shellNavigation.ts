const detailPrefixes = ["/appliance/", "/device/"];

/** The rail's current place. A detail shown beside Home is still Overview;
 * a detail shown as its own page belongs to Devices & rooms. */
export function railSelected(path: string, href: string, panelOpen: boolean) {
  const detail = detailPrefixes.some((prefix) => path.startsWith(prefix));
  if (href === "/") return path === "/" || (detail && panelOpen);
  if (href === "/house") return path.startsWith("/house");
  if (href === "/entities")
    return path.startsWith("/entities") || (detail && !panelOpen);
  return path === href;
}
