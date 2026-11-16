import { planBounds } from "../spatial/model";
import { furnitureCatalog } from "./furnitureCatalog";
import type { Point3 } from "./modelCamera";
import { planToWorld, type SceneFloor } from "./sceneModel";
import {
  cameraFacing,
  FLOOR_THICKNESS,
  PLINTH_HEIGHT,
  PLINTH_OVERHANG,
} from "./sceneStyle";
import { wallPieces } from "./sceneWalls";

/** Room focus keeps at least a partition's height in frame around the floor. */
const ROOM_MIN_TOP = 0.9;
const ROOM_PAD = 0.04;

export interface SceneSilhouette {
  min: Point3;
  max: Point3;
  /** The points the camera must keep in frame; tighter than the box corners. */
  points: Point3[];
}

/**
 * World-space points describing what is actually drawn: the plinth, each wall
 * at its rendered height (camera-facing walls are only a curb) and the tops of
 * furniture. Labels and markers are excluded so an observation never moves the
 * camera. Heights are rendering previews, never measurements.
 */
export function sceneSilhouette(
  floor: SceneFloor,
  options: {
    wallHeight: number;
    cameraMode: "orbit" | "model";
    roomId?: string | null;
  },
): SceneSilhouette {
  const points: Point3[] = [];
  const add = (x: number, y: number, z: number) => points.push([x, y, z]);
  const tallest = floor.furniture.reduce(
    (height, item) =>
      Math.max(height, furnitureCatalog[item.variant]?.height ?? 0),
    0,
  );
  const room = floor.rooms.find((item) => item.id === options.roomId);
  if (room) {
    const top = Math.max(
      ROOM_MIN_TOP,
      FLOOR_THICKNESS + Math.max(options.wallHeight, tallest),
    );
    const xs = room.polygon.map((point) => planToWorld(point, floor.center).x);
    const zs = room.polygon.map((point) => planToWorld(point, floor.center).z);
    for (const x of [Math.min(...xs) - ROOM_PAD, Math.max(...xs) + ROOM_PAD])
      for (const z of [Math.min(...zs) - ROOM_PAD, Math.max(...zs) + ROOM_PAD])
        for (const y of [0, top]) add(x, y, z);
  } else {
    const bounds = planBounds(floor.outline);
    const low = planToWorld({ x: bounds.minX, z: bounds.maxZ }, floor.center);
    const high = planToWorld({ x: bounds.maxX, z: bounds.minZ }, floor.center);
    const overhang = PLINTH_OVERHANG / 2;
    for (const x of [low.x - overhang, high.x + overhang])
      for (const z of [low.z - overhang, high.z + overhang])
        for (const y of [-PLINTH_HEIGHT, 0]) add(x, y, z);
    for (const piece of wallPieces(floor.outline, floor.lines, {
      exteriorHeight: options.wallHeight,
      facing: cameraFacing(options.cameraMode),
    })) {
      const half = piece.thickness / 2;
      for (const end of [piece.from, piece.to]) {
        const at = planToWorld(end, floor.center);
        // Rounded wall ends extend half a thickness beyond the saved line.
        for (const dx of [-half, half])
          for (const dz of [-half, half])
            add(at.x + dx, FLOOR_THICKNESS + piece.height, at.z + dz);
      }
    }
    for (const item of floor.furniture) {
      const height = furnitureCatalog[item.variant]?.height ?? 0;
      if (!height) continue;
      const at = planToWorld(item.center, floor.center);
      // World yaw equals the plan rotation (counter-clockwise from above).
      const angle = (item.rotation * Math.PI) / 180;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      for (const x of [-item.width / 2, item.width / 2])
        for (const z of [-item.depth / 2, item.depth / 2])
          add(
            at.x + x * cos + z * sin,
            FLOOR_THICKNESS + height,
            at.z - x * sin + z * cos,
          );
    }
  }
  const axis = (index: 0 | 1 | 2, pick: (...values: number[]) => number) =>
    pick(...points.map((point) => point[index]));
  return {
    min: [axis(0, Math.min), axis(1, Math.min), axis(2, Math.min)],
    max: [axis(0, Math.max), axis(1, Math.max), axis(2, Math.max)],
    points,
  };
}
