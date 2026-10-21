import { PerspectiveCamera, Vector3 } from "three";
import {
  fitModelCamera,
  clampModelYaw,
  MODEL_FOV,
  MODEL_YAW,
  MODEL_YAW_RANGE,
  MODEL_MARGIN_PX,
  MODEL_MARGIN_FRACTION,
  type ModelCameraInput,
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
  { width: 430, height: 300 },
  { width: 900, height: 500 },
  { width: 1600, height: 700 },
];
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
  const projected = [];
  for (let corner = 0; corner < 8; corner++) {
    const p = new Vector3(
      ...input.bounds.min.map((value, i) =>
        corner & (1 << i) ? input.bounds.max[i]! : value,
      ),
    );
    const depth = -p.clone().applyMatrix4(camera.matrixWorldInverse).z;
    expect(depth).toBeGreaterThan(pose!.near);
    expect(depth).toBeLessThan(pose!.far);
    p.project(camera);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(
      1 - 2 * (MODEL_MARGIN_FRACTION + MODEL_MARGIN_PX / width) + 1e-9,
    );
    expect(Math.abs(p.y)).toBeLessThanOrEqual(
      1 - 2 * (MODEL_MARGIN_FRACTION + MODEL_MARGIN_PX / height) + 1e-9,
    );
    expect(Math.abs(p.z)).toBeLessThan(1);
    projected.push(p);
  }
  return { pose: pose!, projected };
}

test.each(viewports)(
  "all corners remain inside the useful canvas and clipping planes at $width × $height",
  (viewport) => {
    for (const bounds of boxes)
      for (const offset of [-40, -25, 0, 18, 40])
        for (const zoomFactor of [1, 1.25]) {
          project({
            bounds,
            viewport,
            yaw: MODEL_YAW + (offset * Math.PI) / 180,
            zoomFactor,
          });
        }
  },
);

test("rotation and zoom clamp without mutating input; resize preserves normalized choices", () => {
  const input: ModelCameraInput = {
    bounds: boxes[0]!,
    viewport: viewports[0]!,
    yaw: MODEL_YAW + 0.2,
    zoomFactor: 1.18,
  };
  const before = JSON.stringify(input);
  const a = project(input).pose;
  const b = project({ ...input, viewport: viewports[3]! }).pose;
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
    viewport: viewports[1]!,
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
  for (const value of [0, -1, 49, 50, NaN, Infinity])
    for (const key of ["width", "height"] as const)
      expect(
        fitModelCamera({
          ...valid,
          viewport: { ...valid.viewport, [key]: value },
        }),
      ).toBeNull();
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(fitModelCamera({ ...valid, yaw: value })).toBeNull();
    expect(fitModelCamera({ ...valid, zoomFactor: value })).toBeNull();
    expect(
      fitModelCamera({
        ...valid,
        bounds: { min: [value, 0, 0], max: [1, 1, 1] },
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
