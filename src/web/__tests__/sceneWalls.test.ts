import type { PlanLine, PlanPoint } from "../../spatial/model";
import { MODEL_YAW } from "../modelCamera";
import {
  cameraFacing,
  CUTAWAY_FACING,
  CUTAWAY_WALL_HEIGHT,
  EXTERIOR_WALL_THICKNESS,
  INTERIOR_WALL_HEIGHT,
  INTERIOR_WALL_THICKNESS,
  WINDOW_HEIGHT,
  WINDOW_THICKNESS,
} from "../sceneStyle";
import { wallPieces } from "../sceneWalls";

const rectangle: PlanPoint[] = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 3 },
];
const exteriorHeight = 1.8;
const model = { exteriorHeight, facing: cameraFacing("model") };

test("the envelope is closed and its cutaway does not depend on outline winding", () => {
  for (const outline of [rectangle, [...rectangle].reverse()]) {
    const pieces = wallPieces(outline, [], model);
    expect(pieces).toHaveLength(4);
    expect(pieces.every((piece) => piece.exterior)).toBe(true);
    expect(pieces.every((piece) => piece.kind === "wall")).toBe(true);
    expect(
      pieces.every((piece) => piece.thickness === EXTERIOR_WALL_THICKNESS),
    ).toBe(true);
    const cut = pieces.filter((piece) => piece.cutaway);
    expect(cut).toHaveLength(2);
    expect(cut.every((piece) => piece.height === CUTAWAY_WALL_HEIGHT)).toBe(
      true,
    );
    const full = pieces.filter((piece) => !piece.cutaway);
    expect(full.every((piece) => piece.height === exteriorHeight)).toBe(true);
  }
});

test("only envelope walls facing the camera are cut away", () => {
  const model = wallPieces(rectangle, [], {
    exteriorHeight,
    facing: cameraFacing("model"),
  });
  const orbit = wallPieces(rectangle, [], {
    exteriorHeight,
    facing: cameraFacing("orbit"),
  });
  const modelFacing = cameraFacing("model");
  expect(modelFacing.x).toBeCloseTo(Math.sin(MODEL_YAW), 10);
  expect(modelFacing.z).toBeCloseTo(-Math.cos(MODEL_YAW), 10);
  expect(
    modelFacing.x * modelFacing.x + modelFacing.z * modelFacing.z,
  ).toBeCloseTo(1, 10);
  expect(cameraFacing("orbit")).toEqual({ x: 0, z: -1 });
  // Model view looks at the +X / −Z corner; orbit looks straight down −Z.
  expect(model.filter((piece) => piece.cutaway)).toHaveLength(2);
  expect(orbit.filter((piece) => piece.cutaway)).toHaveLength(1);
  expect(CUTAWAY_FACING).toBeGreaterThan(0);
  expect(CUTAWAY_FACING).toBeLessThan(1);
});

test("saved partition lines keep door gaps and preview heights", () => {
  const lines: PlanLine[] = [
    { kind: "wall", from: { x: 4, z: 0 }, to: { x: 4, z: 2 } },
    { kind: "wall", from: { x: 4, z: 3 }, to: { x: 4, z: 6 } },
    { kind: "window", from: { x: 1, z: 3 }, to: { x: 3, z: 3 } },
    { kind: "step", from: { x: 0, z: 0 }, to: { x: 0, z: 1 } },
  ];
  const pieces = wallPieces(rectangle, lines, model);
  const partitions = pieces.filter((piece) => !piece.exterior);
  expect(partitions).toHaveLength(3);
  expect(
    partitions.filter(
      (piece) => piece.kind === "wall" && piece.height === INTERIOR_WALL_HEIGHT,
    ),
  ).toHaveLength(2);
  expect(
    partitions.filter(
      (piece) =>
        piece.kind === "wall" && piece.thickness === INTERIOR_WALL_THICKNESS,
    ),
  ).toHaveLength(2);
  const glazing = partitions.find((piece) => piece.kind === "window")!;
  expect(glazing.height).toBe(WINDOW_HEIGHT);
  expect(glazing.thickness).toBe(WINDOW_THICKNESS);
  expect(glazing.cutaway).toBe(false);
  expect(partitions.every((piece) => piece.height !== exteriorHeight)).toBe(
    true,
  );
});

test("degenerate geometry produces no wall pieces", () => {
  expect(wallPieces([], [], model)).toEqual([]);
  expect(
    wallPieces(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
      [],
      model,
    ),
  ).toEqual([]);
});
