import { PerspectiveCamera, Vector3 } from "three";
import {
  fitCameraToPoints,
  fitModelCamera,
  clampModelYaw,
  MODEL_ELEVATION,
  MODEL_FILL,
  MODEL_FOV,
  MODEL_YAW,
  MODEL_YAW_RANGE,
  type ModelCameraInput,
  type Point3,
} from "../modelCamera";

const boxes: ModelCameraInput["bounds"][] = [
  { min: [-4, -0.06, -3], max: [4, 0.6, 3] },
  { min: [15, 0, -80], max: [18, 1, -76] },
  { min: [-1, -20, -1], max: [1, 40, 1] },
  { min: [3, 3, 3], max: [3, 3, 3] },
  { min: [-300, -0.1, -100], max: [400, 1, 150] },
];
const viewports = [
  { width: 280, height: 320 },
  // Narrow phone card, tall phone and the wide 1440 desktop panel.
  { width: 350, height: 300 },
  { width: 390, height: 640 },
  { width: 430, height: 300 },
  { width: 900, height: 500 },
  { width: 1130, height: 380 },
  { width: 1600, height: 700 },
];
const corners = (bounds: ModelCameraInput["bounds"]) =>
  Array.from(
    { length: 8 },
    (_, corner) =>
      bounds.min.map((value, i) =>
        corner & (1 << i) ? bounds.max[i]! : value,
      ) as Point3,
  );
function project(input: ModelCameraInput) {
  const pose = fitModelCamera(input);
  expect(pose).not.toBeNull();
  const { width, height } = input.viewport;
  const camera = new PerspectiveCamera(
    MODEL_FOV,
    width / height,
    pose!.near,
    pose!.far,
  );
  camera.position.fromArray(pose!.position);
  camera.lookAt(new Vector3(...pose!.target));
  camera.updateMatrixWorld();
  const projected: Vector3[] = [];
  for (const point of input.bounds.points ?? corners(input.bounds)) {
    const p = new Vector3(...point);
    const depth = -p.clone().applyMatrix4(camera.matrixWorldInverse).z;
    expect(depth).toBeGreaterThan(pose!.near);
    expect(depth).toBeLessThan(pose!.far);
    p.project(camera);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(MODEL_FILL + 1e-9);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(MODEL_FILL + 1e-9);
    expect(Math.abs(p.z)).toBeLessThan(1);
    projected.push(p);
  }
  const span = (axis: "x" | "y") => {
    const values = projected.map((point) => point[axis]);
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  return { pose: pose!, projected, x: span("x"), y: span("y") };
}

test.each(viewports)(
  "the model fills the same share of the limiting dimension, centred, at $width × $height",
  (viewport) => {
    for (const bounds of boxes)
      for (const offset of [-40, -25, 0, 18, 40]) {
        const yaw = MODEL_YAW + (offset * Math.PI) / 180;
        const fitted = project({ bounds, viewport, yaw, zoomFactor: 1 });
        const width = (fitted.x.max - fitted.x.min) / 2;
        const height = (fitted.y.max - fitted.y.min) / 2;
        // A single point has no extent to fit; everything else owns the stage.
        if (bounds.min.some((value, i) => value !== bounds.max[i]))
          expect(Math.max(width, height)).toBeCloseTo(MODEL_FILL, 6);
        expect(fitted.x.max + fitted.x.min).toBeCloseTo(0, 6);
        expect(fitted.y.max + fitted.y.min).toBeCloseTo(0, 6);
        expect(fitted.pose.share.width).toBeCloseTo(width, 6);
        expect(fitted.pose.share.height).toBeCloseTo(height, 6);
        // Zooming out only ever leaves more margin.
        const far = project({ bounds, viewport, yaw, zoomFactor: 1.25 });
        expect(far.x.max - far.x.min).toBeLessThanOrEqual(2 * width + 1e-9);
      }
  },
);

test("a real silhouette is framed closer than its bounding box, and still entirely in view", () => {
  // A low plinth with one tall element in the middle: all four upper corners
  // of the box are empty space the camera should not have to frame.
  const points: Point3[] = [
    [-4, -0.3, -3],
    [4, -0.3, -3],
    [-4, -0.3, 3],
    [4, -0.3, 3],
    [-0.5, 1.86, -0.5],
    [0.5, 1.86, 0.5],
  ];
  const bounds = {
    min: [-4, -0.3, -3] as Point3,
    max: [4, 1.86, 3] as Point3,
  };
  for (const viewport of viewports) {
    const input = { viewport, yaw: MODEL_YAW, zoomFactor: 1 };
    const box = project({ ...input, bounds });
    const tight = project({ ...input, bounds: { ...bounds, points } });
    expect(tight.pose.fitDistance).toBeLessThan(box.pose.fitDistance);
    expect(
      Math.max(tight.pose.share.width, tight.pose.share.height),
    ).toBeCloseTo(MODEL_FILL, 6);
  }
});

test("the same fit serves another view: any elevation and field of view reach the requested share", () => {
  const points = corners(boxes[0]!);
  for (const viewport of viewports)
    for (const [elevation, fov, fill] of [
      [MODEL_ELEVATION, MODEL_FOV, 0.5],
      [Math.atan2(0.85, 0.75), 45, 0.8],
      [1.2, 60, 1],
    ] as const) {
      const fit = fitCameraToPoints({
        points,
        viewport,
        yaw: 0,
        elevation,
        fov,
        fill,
      })!;
      expect(Math.max(fit.share.width, fit.share.height)).toBeCloseTo(fill, 6);
      expect(Math.min(fit.share.width, fit.share.height)).toBeLessThanOrEqual(
        fill + 1e-9,
      );
      expect(fit.nearDepth).toBeGreaterThan(0);
      const direction = new Vector3(...fit.position)
        .sub(new Vector3(...fit.target))
        .normalize();
      expect(Math.asin(direction.y)).toBeCloseTo(elevation, 10);
    }
  expect(
    fitCameraToPoints({
      points: [],
      viewport: viewports[0]!,
      yaw: 0,
      elevation: 1,
      fov: 45,
      fill: 0.8,
    }),
  ).toBeNull();
  for (const fill of [0, -1, 1.2, NaN])
    expect(
      fitCameraToPoints({
        points,
        viewport: viewports[0]!,
        yaw: 0,
        elevation: 1,
        fov: 45,
        fill,
      }),
    ).toBeNull();
});

test("rotation and zoom clamp without mutating input; resize preserves normalized choices", () => {
  const input: ModelCameraInput = {
    bounds: boxes[0]!,
    viewport: viewports[0]!,
    yaw: MODEL_YAW + 0.2,
    zoomFactor: 1.18,
  };
  const before = JSON.stringify(input);
  const a = project(input).pose;
  const b = project({ ...input, viewport: viewports[6]! }).pose;
  expect(b.yaw).toBe(a.yaw);
  expect(b.zoomFactor).toBe(a.zoomFactor);
  expect(b.fitDistance).not.toBe(a.fitDistance);
  expect(JSON.stringify(input)).toBe(before);
  expect(clampModelYaw(-100)).toBe(MODEL_YAW - MODEL_YAW_RANGE);
  expect(clampModelYaw(100)).toBe(MODEL_YAW + MODEL_YAW_RANGE);
  expect(project({ ...input, yaw: -100, zoomFactor: 0.6 }).pose).toMatchObject({
    yaw: MODEL_YAW - MODEL_YAW_RANGE,
    zoomFactor: 1,
  });
  expect(project({ ...input, yaw: 100, zoomFactor: 5 }).pose).toMatchObject({
    yaw: MODEL_YAW + MODEL_YAW_RANGE,
    zoomFactor: 1.25,
  });
});

test("translation of the geometry leaves the projection unchanged", () => {
  const bounds = boxes[0]!;
  const translation = [100, -40, 900];
  const input = {
    bounds,
    viewport: viewports[3]!,
    yaw: MODEL_YAW,
    zoomFactor: 1,
  };
  const a = project(input);
  const b = project({
    ...input,
    bounds: {
      min: bounds.min.map((v, i) => v + translation[i]!) as [
        number,
        number,
        number,
      ],
      max: bounds.max.map((v, i) => v + translation[i]!) as [
        number,
        number,
        number,
      ],
    },
  });
  expect(b.pose.fitDistance).toBeCloseTo(a.pose.fitDistance, 10);
  for (let i = 0; i < 8; i++)
    expect(b.projected[i]!.distanceTo(a.projected[i]!)).toBeLessThan(1e-10);
});

test("invalid or unrepresentable inputs never produce a pose with NaN/Infinity", () => {
  const valid: ModelCameraInput = {
    bounds: boxes[0]!,
    viewport: viewports[0]!,
    yaw: MODEL_YAW,
    zoomFactor: 1,
  };
  for (const value of [0, -1, NaN, Infinity])
    for (const key of ["width", "height"] as const)
      expect(
        fitModelCamera({
          ...valid,
          viewport: { ...valid.viewport, [key]: value },
        }),
      ).toBeNull();
  // The margin is proportional, so any positive viewport stays representable.
  expect(
    fitModelCamera({ ...valid, viewport: { width: 49, height: 50 } }),
  ).not.toBeNull();
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(fitModelCamera({ ...valid, yaw: value })).toBeNull();
    expect(fitModelCamera({ ...valid, zoomFactor: value })).toBeNull();
    expect(
      fitModelCamera({
        ...valid,
        bounds: { min: [value, 0, 0], max: [1, 1, 1] },
      }),
    ).toBeNull();
    expect(
      fitModelCamera({
        ...valid,
        bounds: { ...valid.bounds, points: [[0, value, 0]] },
      }),
    ).toBeNull();
  }
  expect(
    fitModelCamera({ ...valid, bounds: { min: [1, 0, 0], max: [0, 0, 0] } }),
  ).toBeNull();
  expect(
    fitModelCamera({
      ...valid,
      bounds: { min: [-1e308, 0, 0], max: [1e308, 0, 0] },
    }),
  ).toBeNull();
});
