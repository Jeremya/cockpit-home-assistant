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

export type MainTab = "home" | "rooms" | "plan" | "settings";
/** Only the four primary destinations show the compact bar. */
export function mainTabFor(path: string): MainTab | null {
  if (path === "/") return "home";
  if (path === "/entities") return "rooms";
  if (path === "/house") return "plan";
  if (path === "/settings") return "settings";
  return null;
}
