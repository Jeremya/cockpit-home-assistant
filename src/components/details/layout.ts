export const detailGap = 20;

/** Columns follow the width measured by the route or panel, never the window.
 * 360 px per column keeps a 360–440 px panel and the 768 px route single. */
export function detailColumns(width: number): 1 | 2 {
  return width >= 360 * 2 + detailGap ? 2 : 1;
}
