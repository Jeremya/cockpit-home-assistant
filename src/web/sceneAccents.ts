import {
  pointInPolygon,
  type PlanLine,
  type PlanPoint,
} from "../spatial/model";
import {
  KEY_LIGHT_DIRECTION,
  windowLight,
  type PlanDirection,
} from "./sceneStyle";

/**
 * Pure planners for the scene's accents. They only read saved plan geometry:
 * nothing here invents a window, a door or a lit device.
 */

const EPSILON = 1e-6;
/** Sharp corners are clamped so a thin line never spikes across a room. */
const MITER_LIMIT = 0.35;

/** Shrinks a simple polygon toward its interior by `distance` metres. */
export function insetPolygon(
  polygon: readonly PlanPoint[],
  distance: number,
): PlanPoint[] {
  const points = polygon.filter((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    return Math.hypot(point.x - previous.x, point.z - previous.z) > EPSILON;
  });
  if (points.length < 3) return [];
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  if (Math.abs(area) < EPSILON) return [];
  const side = area > 0 ? 1 : -1;
  const inward = (from: PlanPoint, to: PlanPoint) => {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    return {
      x: (-(to.z - from.z) / length) * side,
      z: ((to.x - from.x) / length) * side,
    };
  };
  return points.map((point, index) => {
    const before = inward(
      points[(index + points.length - 1) % points.length]!,
      point,
    );
    const after = inward(point, points[(index + 1) % points.length]!);
    let x = before.x + after.x;
    let z = before.z + after.z;
    const size = Math.hypot(x, z);
    if (size < EPSILON) ({ x, z } = before);
    else {
      x /= size;
      z /= size;
    }
    const reach = distance / Math.max(MITER_LIMIT, x * before.x + z * before.z);
    return { x: point.x + x * reach, z: point.z + z * reach };
  });
}

/** Plan-space direction the key light travels along the ground. */
export function keyLightOnPlan(): PlanDirection {
  // `planToWorld` flips Z, and light travels away from its source.
  const x = -KEY_LIGHT_DIRECTION[0];
  const z = KEY_LIGHT_DIRECTION[2];
  const size = Math.hypot(x, z);
  return { x: x / size, z: z / size };
}

export interface WindowSpill {
  from: PlanPoint;
  to: PlanPoint;
  /** Unit vector from the glazing into the lit room. */
  inward: PlanDirection;
  /** How far the patch reaches into the room, metres. */
  depth: number;
  /** 1 where the key light shines through, lower for diffuse light. */
  strength: number;
}

/**
 * Daylight patches for saved `window` lines only. A patch is laid on each
 * side of the glazing that is inside the floor; the side the key light reaches
 * is stronger. Walls, steps and gaps between lines never produce light: the
 * plan has no door kind and an opening is not inferred from a gap.
 */
export function windowSpills(
  outline: readonly PlanPoint[],
  lines: readonly PlanLine[],
  light: PlanDirection = keyLightOnPlan(),
): WindowSpill[] {
  const spills: WindowSpill[] = [];
  for (const line of lines) {
    if (line.kind !== "window") continue;
    const dx = line.to.x - line.from.x;
    const dz = line.to.z - line.from.z;
    const length = Math.hypot(dx, dz);
    if (length < EPSILON) continue;
    const middle = {
      x: (line.from.x + line.to.x) / 2,
      z: (line.from.z + line.to.z) / 2,
    };
    for (const inward of [
      { x: -dz / length, z: dx / length },
      { x: dz / length, z: -dx / length },
    ]) {
      if (
        !pointInPolygon(
          { x: middle.x + inward.x * 0.25, z: middle.z + inward.z * 0.25 },
          outline,
        )
      )
        continue;
      const direct = inward.x * light.x + inward.z * light.z > 0.1;
      spills.push({
        from: line.from,
        to: line.to,
        inward,
        depth: direct ? windowLight.directDepth : windowLight.diffuseDepth,
        strength: direct
          ? windowLight.directStrength
          : windowLight.diffuseStrength,
      });
    }
  }
  return spills;
}
