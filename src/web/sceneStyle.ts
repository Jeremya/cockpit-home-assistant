import type { RoomKind } from "../spatial/model";
import { MODEL_YAW } from "./modelCamera";

/**
 * Presentation-only values for the shared Three.js scene. Nothing here is a
 * measurement, a story elevation or a Home Assistant fact: heights and sizes
 * are rendering settings that can change without touching the plan schema.
 */
export const scenePalette = {
  stage: "#0a0e1a",
  plinth: "#141927",
  wallBody: "#e7e3db",
  wallCap: "#262b3a",
  windowFrame: "#2c3142",
  glass: "#9cc0ff",
  glassEmissive: "#3d5fae",
  labelInk: "#2b2f3a",
  /** Shared with the marker palette so a selected room still reads as "Maurice". */
  selectedFloor: "#3f6694",
} as const;

/** Furniture materials replace the vendor palette so the kit reads as Maurice's. */
export const furniturePalette = {
  wood: "#a6764c",
  woodDark: "#7f5736",
  fabric: "#8f8074",
  fabricLight: "#efe9df",
  fabricDark: "#75685d",
  rug: "#b3a99c",
  rugDark: "#8a7f72",
  metal: "#b9c0c6",
  metalLight: "#e9edef",
  metalDark: "#3d4653",
  lamp: "#ffe9b8",
  lampGlow: "#ffd68a",
  plant: "#5f8a6a",
  stone: "#cfcac2",
} as const;

export type FloorSurface = "oak" | "walnut" | "stone";

export const floorSurface: Record<RoomKind, FloorSurface> = {
  living: "oak",
  kitchen: "stone",
  bedroom: "walnut",
  bathroom: "stone",
  storage: "stone",
  circulation: "oak",
};

export const floorSurfaceColor: Record<
  FloorSurface,
  { base: string; seam: string; accent: string }
> = {
  oak: { base: "#b98a5e", seam: "#8d6540", accent: "#c99a6c" },
  walnut: { base: "#7d5a3c", seam: "#5d412b", accent: "#8f6b4a" },
  stone: { base: "#cfcac2", seam: "#b4aea5", accent: "#dcd8d1" },
};

/** Rendering-only envelope height in metres; documented as a preview, not a storey. */
export const EXTERIOR_WALL_HEIGHT = 1.8;
/** Interior partitions stay lower so the floor stays legible from the default view. */
export const INTERIOR_WALL_HEIGHT = 0.9;
/** Camera-facing envelope walls are cut to this curb; it is not a wall measurement. */
export const CUTAWAY_WALL_HEIGHT = 0.14;
export const EXTERIOR_WALL_THICKNESS = 0.2;
export const INTERIOR_WALL_THICKNESS = 0.1;
export const WINDOW_THICKNESS = 0.05;
/** Preview glazing height; a saved `window` line carries no sill/head data. */
export const WINDOW_HEIGHT = 1.1;
/** A wall whose outward normal faces the camera beyond this weight is cut away. */
export const CUTAWAY_FACING = 0.15;
export const WALL_CAP_HEIGHT = 0.03;
export const FLOOR_THICKNESS = 0.06;
export const PLINTH_HEIGHT = 0.3;
export const PLINTH_OVERHANG = 0.7;
/** Metres covered by one floor-texture tile. */
export const FLOOR_TILE_METRES = 2.4;

export interface PlanDirection {
  x: number;
  z: number;
}

/**
 * Plan-space direction pointing from the house toward the camera. The model
 * camera starts at `MODEL_YAW`; the orbit camera starts from world +Z, which
 * `planToWorld` maps to plan −Z. `planToWorld` flips Z, hence the signs.
 */
export function cameraFacing(cameraMode: "orbit" | "model"): PlanDirection {
  if (cameraMode === "model")
    return { x: Math.sin(MODEL_YAW), z: -Math.cos(MODEL_YAW) };
  return { x: 0, z: -1 };
}
