/** Between the blocks of a detail; the same step as cards on a screen. */
export const detailGap = 16;

/** Columns follow the width measured by the route or panel, never the window.
 * 360 px per column keeps a 360–440 px panel and the 768 px route single. */
export function detailColumns(width: number): 1 | 2 {
  // The threshold predates the 16 px rhythm and stays where it was (740 px).
  return width >= 360 * 2 + 20 ? 2 : 1;
}
