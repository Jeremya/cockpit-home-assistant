import { PerspectiveCamera, Vector3 } from "three";
import { ModelCameraController } from "../ModelCameraController";
import {
  MODEL_YAW,
  MODEL_YAW_RANGE,
  MODEL_ELEVATION,
  MODEL_TRANSITION_MS,
  fitModelCamera,
} from "../modelCamera";
const floor = {
  min: [-4, 0, -3] as [number, number, number],
  max: [4, 0.9, 3] as [number, number, number],
};
const room = {
  min: [2, 0, -3] as [number, number, number],
  max: [4, 0.9, -1] as [number, number, number],
};
function setup() {
  const camera = new PerspectiveCamera();
  const controls = {
    target: new Vector3(),
    update: jest.fn(() => true),
    getAzimuthalAngle: () =>
      Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z,
      ),
    enablePan: true,
    enableZoom: true,
    enableDamping: true,
    autoRotate: true,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
  };
  const invalidate = jest.fn();
  let reduced = false;
  const controller = new ModelCameraController(
    camera,
    controls,
    () => reduced,
    invalidate,
  );
  controller.setBounds(floor, true, false, 0);
  controller.resize(900, 500);
  return {
    camera,
    controls,
    invalidate,
    controller,
    reduce: () => {
      reduced = true;
    },
  };
}
function expected(
  bounds = room,
  yaw = MODEL_YAW,
  zoomFactor = 1,
  viewport = { width: 900, height: 500 },
) {
  return fitModelCamera({ bounds, yaw, zoomFactor, viewport })!;
}
test("selection transitions terminate and remain at a fixed elevation; observations need no camera work", () => {
  const { controller, camera, controls, invalidate } = setup();
  const start = camera.position.clone();
  controller.setBounds(room, false, true, 100);
  expect(camera.position).toEqual(start);
  expect(controller.tick(210)).toBe(true);
  const direction = camera.position.clone().sub(controls.target).normalize();
  expect(Math.asin(direction.y)).toBeCloseTo(MODEL_ELEVATION, 10);
  expect(controller.tick(100 + MODEL_TRANSITION_MS)).toBe(false);
  expect(
    camera.position.distanceTo(new Vector3(...expected().position)),
  ).toBeLessThan(1e-8);
  invalidate.mockClear();
  expect(controller.tick(900)).toBe(false);
  expect(invalidate).not.toHaveBeenCalled();
});
test("reselection retargets from the current pose and manual input cancels animation", () => {
  const { controller, camera } = setup();
  controller.setBounds(room, false, true, 0);
  controller.tick(90);
  const at = camera.position.clone();
  controller.setBounds(floor, true, true, 90);
  expect(camera.position).toEqual(at);
  controller.rotate(0.1);
  expect(controller.probe.animating).toBe(false);
  expect(controller.probe.yaw).toBeCloseTo(MODEL_YAW + 0.1);
  const manual = camera.position.clone();
  controller.tick(400);
  expect(camera.position).toEqual(manual);
});
test("resize keeps normalized yaw and zoom, while overview explicitly resets them", () => {
  const { controller, camera } = setup();
  controller.rotate(0.25);
  controller.zoom(1.15);
  controller.setBounds(room, false, true, 0);
  controller.resize(430, 300);
  expect(controller.probe).toMatchObject({
    animating: false,
    yaw: MODEL_YAW + 0.25,
    zoomFactor: 1.15,
  });
  expect(
    camera.position.distanceTo(
      new Vector3(
        ...expected(room, MODEL_YAW + 0.25, 1.15, { width: 430, height: 300 })
          .position,
      ),
    ),
  ).toBeLessThan(1e-8);
  controller.setBounds(floor, true, false, 0);
  expect(controller.probe).toMatchObject({ yaw: MODEL_YAW, zoomFactor: 1 });
});
test("orbit, keyboard and wheel obey bounds with a single owner, reduced motion applies immediately", () => {
  const { controller, camera, controls, reduce } = setup();
  expect(controls).toMatchObject({
    enablePan: false,
    enableZoom: false,
    enableDamping: false,
    autoRotate: false,
  });
  controller.rotate(100);
  controller.zoom(100);
  expect(controller.probe).toMatchObject({
    yaw: MODEL_YAW + MODEL_YAW_RANGE,
    zoomFactor: 1.25,
  });
  controller.rotate(-200);
  controller.zoom(0.01);
  expect(controller.probe).toMatchObject({
    yaw: MODEL_YAW - MODEL_YAW_RANGE,
    zoomFactor: 1,
  });
  reduce();
  controller.setBounds(room, true, true, 0);
  expect(controller.probe.animating).toBe(false);
  expect(
    camera.position.distanceTo(new Vector3(...expected().position)),
  ).toBeLessThan(1e-8);
  controller.dispose();
  expect(controller.tick(400)).toBe(false);
});
