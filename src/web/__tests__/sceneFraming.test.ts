import { publicPlan } from "../../spatial/__tests__/placementFixtures";
import { fitModelCamera, MODEL_FILL, MODEL_YAW } from "../modelCamera";
import { sceneSilhouette } from "../sceneFraming";
import { planToWorld, toSceneFloor, type SceneFloor } from "../sceneModel";
import {
  CUTAWAY_WALL_HEIGHT,
  EXTERIOR_WALL_HEIGHT,
  FLOOR_THICKNESS,
  PLINTH_HEIGHT,
  PLINTH_OVERHANG,
} from "../sceneStyle";

const floor = toSceneFloor(publicPlan.floors[0]!);
const options = {
  wallHeight: EXTERIOR_WALL_HEIGHT,
  cameraMode: "model",
} as const;
/** Highest silhouette point within reach of a plan corner. */
function topNear(
  silhouette: ReturnType<typeof sceneSilhouette>,
  x: number,
  z: number,
) {
  const at = planToWorld({ x, z }, floor.center);
  return Math.max(
    ...silhouette.points
      .filter((point) => Math.hypot(point[0] - at.x, point[2] - at.z) < 0.3)
      .map((point) => point[1]),
  );
}

test("the framed silhouette is what is drawn: plinth below, cutaway walls as curbs, far walls at full height", () => {
  const silhouette = sceneSilhouette(floor, options);
  expect(silhouette.min[1]).toBe(-PLINTH_HEIGHT);
  expect(silhouette.max[1]).toBeCloseTo(
    FLOOR_THICKNESS + EXTERIOR_WALL_HEIGHT,
    10,
  );
  // The sample is 8 × 6 m; the plinth overhangs it on every side.
  expect(silhouette.max[0] - silhouette.min[0]).toBeCloseTo(
    8 + PLINTH_OVERHANG,
    10,
  );
  expect(silhouette.max[2] - silhouette.min[2]).toBeCloseTo(
    6 + PLINTH_OVERHANG,
    10,
  );
  // The model camera looks from plan (+x, −z): that corner is only a curb,
  // the opposite one keeps the full envelope.
  expect(topNear(silhouette, 8, 0)).toBeCloseTo(
    FLOOR_THICKNESS + CUTAWAY_WALL_HEIGHT,
    10,
  );
  expect(topNear(silhouette, 0, 6)).toBeCloseTo(
    FLOOR_THICKNESS + EXTERIOR_WALL_HEIGHT,
    10,
  );
  // Every point lies inside the reported box, which drives clipping.
  for (const point of silhouette.points)
    point.forEach((value, axis) => {
      expect(value).toBeGreaterThanOrEqual(silhouette.min[axis]!);
      expect(value).toBeLessThanOrEqual(silhouette.max[axis]!);
    });
});

test("the cutaway follows the camera mode, so each view frames its own open side", () => {
  const orbit = sceneSilhouette(floor, { ...options, cameraMode: "orbit" });
  // The orbit view opens only the plan −z side, so the +x wall stays tall
  // where the model view has cut both walls of that corner to a curb.
  expect(topNear(orbit, 8, 0)).toBeCloseTo(
    FLOOR_THICKNESS + EXTERIOR_WALL_HEIGHT,
    10,
  );
  expect(topNear(sceneSilhouette(floor, options), 8, 0)).toBeLessThan(
    topNear(orbit, 8, 0),
  );
});

test("furniture taller than the walls is kept in frame; an unfurnished floor is not padded for it", () => {
  const tall: SceneFloor = {
    ...floor,
    furniture: [
      {
        id: "wardrobe",
        kind: "storage",
        variant: "wardrobe",
        shape: "rect",
        center: { x: 1, z: 5 },
        width: 1.2,
        depth: 0.6,
        rotation: 30,
        fitToFootprint: false,
      },
    ],
  };
  expect(sceneSilhouette(tall, options).max[1]).toBeCloseTo(
    FLOOR_THICKNESS + 1.9,
    10,
  );
  expect(
    sceneSilhouette({ ...floor, furniture: [] }, options).max[1],
  ).toBeCloseTo(FLOOR_THICKNESS + EXTERIOR_WALL_HEIGHT, 10);
});

test("a selected room is framed on its own footprint, standing on its floor", () => {
  const room = floor.rooms[1]!;
  const silhouette = sceneSilhouette(floor, { ...options, roomId: room.id });
  const xs = room.polygon.map((point) => planToWorld(point, floor.center).x);
  const zs = room.polygon.map((point) => planToWorld(point, floor.center).z);
  expect(silhouette.min[0]).toBeCloseTo(Math.min(...xs) - 0.04, 10);
  expect(silhouette.max[0]).toBeCloseTo(Math.max(...xs) + 0.04, 10);
  expect(silhouette.min[2]).toBeCloseTo(Math.min(...zs) - 0.04, 10);
  expect(silhouette.max[2]).toBeCloseTo(Math.max(...zs) + 0.04, 10);
  expect(silhouette.min[1]).toBe(0);
  expect(silhouette.max[1]).toBeGreaterThanOrEqual(0.9);
  // An unknown room falls back to the whole floor instead of an empty frame.
  expect(sceneSilhouette(floor, { ...options, roomId: "missing" })).toEqual(
    sceneSilhouette(floor, options),
  );
});

test.each([
  { width: 350, height: 300 },
  { width: 390, height: 640 },
  { width: 1130, height: 380 },
])(
  "the furnished sample floor owns $width × $height: the limiting dimension is filled to the agreed share",
  (viewport) => {
    const pose = fitModelCamera({
      bounds: sceneSilhouette(floor, options),
      viewport,
      yaw: MODEL_YAW,
      zoomFactor: 1,
    })!;
    expect(Math.max(pose.share.width, pose.share.height)).toBeCloseTo(
      MODEL_FILL,
      6,
    );
    expect(Math.min(pose.share.width, pose.share.height)).toBeGreaterThan(0.3);
  },
);
