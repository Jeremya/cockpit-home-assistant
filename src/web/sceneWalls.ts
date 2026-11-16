import {
  pointInPolygon,
  type PlanLine,
  type PlanPoint,
} from "../spatial/model";
import {
  CUTAWAY_FACING,
  CUTAWAY_WALL_HEIGHT,
  EXTERIOR_WALL_THICKNESS,
  INTERIOR_WALL_HEIGHT,
  INTERIOR_WALL_THICKNESS,
  WINDOW_THICKNESS,
  WINDOW_HEIGHT,
  type PlanDirection,
} from "./sceneStyle";

/**
 * Geometry-only wall plan derived from the floor outline and saved partition
 * lines. No door/window semantics are invented: a `window` line is a glazed
 * partition, `step` lines stay out of the 3D scene, and gaps in saved lines
 * remain gaps (doorways).
 */
export interface WallPiece {
  from: PlanPoint;
  to: PlanPoint;
  height: number;
  thickness: number;
  kind: "wall" | "window";
  exterior: boolean;
  /** Envelope wall facing the camera; rendered at curb height. */
  cutaway: boolean;
}

export interface WallOptions {
  exteriorHeight: number;
  facing: PlanDirection;
}

const EPSILON = 1e-6;

function length(a: PlanPoint, b: PlanPoint) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Outward normal of an outline edge, chosen by probing just outside the polygon. */
function outwardNormal(
  a: PlanPoint,
  b: PlanPoint,
  outline: readonly PlanPoint[],
) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const size = Math.hypot(dx, dz);
  if (size < EPSILON) return null;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  for (const [nx, nz] of [
    [-dz / size, dx / size],
    [dz / size, -dx / size],
  ] as const) {
    if (
      !pointInPolygon({ x: mid.x + nx * 0.05, z: mid.z + nz * 0.05 }, outline)
    )
      return { x: nx, z: nz };
  }
  return { x: dx / size, z: dz / size };
}

function envelope(
  outline: readonly PlanPoint[],
  options: WallOptions,
): WallPiece[] {
  const pieces: WallPiece[] = [];
  if (outline.length < 3) return pieces;
  for (let index = 0; index < outline.length; index++) {
    const from = outline[index]!;
    const to = outline[(index + 1) % outline.length]!;
    if (length(from, to) < EPSILON) continue;
    const normal = outwardNormal(from, to, outline);
    if (!normal) continue;
    const cutaway =
      normal.x * options.facing.x + normal.z * options.facing.z >
      CUTAWAY_FACING;
    pieces.push({
      from,
      to,
      height: cutaway ? CUTAWAY_WALL_HEIGHT : options.exteriorHeight,
      thickness: EXTERIOR_WALL_THICKNESS,
      kind: "wall",
      exterior: true,
      cutaway,
    });
  }
  return pieces;
}

function partitions(lines: readonly PlanLine[]): WallPiece[] {
  const pieces: WallPiece[] = [];
  for (const line of lines) {
    if (line.kind === "step") continue;
    if (length(line.from, line.to) < EPSILON) continue;
    if (line.kind === "window") {
      pieces.push({
        from: line.from,
        to: line.to,
        height: WINDOW_HEIGHT,
        thickness: WINDOW_THICKNESS,
        kind: "window",
        exterior: false,
        cutaway: false,
      });
      continue;
    }
    pieces.push({
      from: line.from,
      to: line.to,
      height: INTERIOR_WALL_HEIGHT,
      thickness: INTERIOR_WALL_THICKNESS,
      kind: "wall",
      exterior: false,
      cutaway: false,
    });
  }
  return pieces;
}

export function wallPieces(
  outline: readonly PlanPoint[],
  lines: readonly PlanLine[],
  options: WallOptions,
): WallPiece[] {
  return [...envelope(outline, options), ...partitions(lines)];
}
