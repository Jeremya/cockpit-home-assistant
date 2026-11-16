import type { FurnitureCatalogEntry } from "./furnitureCatalog";

export interface FurnitureSize {
  x: number;
  y: number;
  z: number;
}

/**
 * Uniform model scale from the asset's own bounding box to the catalog height.
 * Uniform scaling preserves the kit's proportions; the plan footprint is a
 * placement/orientation hint, not a stretch target (flat rugs excepted).
 */
export function furnitureScale(
  size: FurnitureSize,
  entry: Pick<FurnitureCatalogEntry, "height">,
) {
  if (!(size.y > 0) || !(entry.height > 0)) return 1;
  return entry.height / size.y;
}

/** Counter runs repeat one module; bounded so a malformed width cannot flood the scene. */
export function counterModuleCount(width: number, moduleWidth: number) {
  if (!(moduleWidth > 0) || !Number.isFinite(width)) return 1;
  return Math.max(1, Math.min(12, Math.round(width / moduleWidth)));
}

/** Flat textiles fill their plan footprint in X/Z and keep their authored thickness. */
export function flatScale(
  size: FurnitureSize,
  width: number,
  depth: number,
): FurnitureSize {
  return {
    x: size.x > 0 && width > 0 ? width / size.x : 1,
    y: 1,
    z: size.z > 0 && depth > 0 ? depth / size.z : 1,
  };
}

/**
 * Legacy photo-derived footprints were drawn in 2D: the model must fill the
 * rectangle, not float at a height-derived scale that ignores it. The model's
 * long axis is aligned to the rectangle's long axis when both are clearly
 * rectangular; rugs keep their flat X/Z stretch.
 */
export function footprintFit(
  size: FurnitureSize,
  width: number,
  depth: number,
  height: number,
) {
  const aspect = (a: number, b: number) =>
    a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : 1;
  const rotate =
    aspect(size.x, size.z) > 1.2 &&
    aspect(width, depth) > 1.2 &&
    size.x > size.z !== width > depth;
  const oriented = rotate
    ? { x: size.z, y: size.y, z: size.x }
    : { x: size.x, y: size.y, z: size.z };
  return {
    rotate,
    scale: {
      x: oriented.x > 0 && width > 0 ? width / oriented.x : 1,
      y: oriented.y > 0 && height > 0 ? height / oriented.y : 1,
      z: oriented.z > 0 && depth > 0 ? depth / oriented.z : 1,
    },
  };
}
