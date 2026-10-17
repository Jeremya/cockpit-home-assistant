import * as THREE from "three";
import { syncMarkers, type MarkerNodes } from "../sceneMarkers";
import { toSceneFloor, type SceneMarker } from "../sceneModel";
import { publicPlan } from "../../spatial/__tests__/placementFixtures";
import { colors } from "../../theme";

const floor = toSceneFloor(publicPlan.floors[0]!);
const marker = (key = "stable"): SceneMarker => ({
  key,
  floorId: floor.id,
  position: { x: 1, z: 1 },
  icon: "lock",
  label: "Public lock",
  condition: "normal",
});
const setup = () => {
  const group = new THREE.Group();
  const nodes: MarkerNodes = new Map();
  const makeLabel = jest.fn(
    () =>
      new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() })),
  );
  const sync = (markers: SceneMarker[]) =>
    syncMarkers(group, nodes, floor, markers, makeLabel);
  return { group, nodes, makeLabel, sync };
};

test("equal bridge values preserve every marker resource without any update", () => {
  const { nodes, makeLabel, sync } = setup();
  expect(sync([marker()])).toEqual({ created: 1, updated: 0, removed: 0 });
  const first = nodes.get("stable")!;
  expect(sync([JSON.parse(JSON.stringify(marker()))])).toEqual({
    created: 0,
    updated: 0,
    removed: 0,
  });
  expect(nodes.get("stable")).toBe(first);
  expect(makeLabel).toHaveBeenCalledTimes(1);
});

test("a changed condition updates the existing material, retaining its label and every other marker", () => {
  const { nodes, sync } = setup();
  sync([marker(), marker("other")]);
  const first = nodes.get("stable")!,
    other = nodes.get("other")!;
  const geometry = first.pin.geometry,
    material = first.pin.material,
    label = first.label;
  expect(first.pin.material.color.getHexString()).toBe(
    colors.security.slice(1),
  );
  for (const [condition, tint] of [
    ["alert", colors.danger],
    ["unknown", colors.warning],
    ["unavailable", colors.muted],
    ["stale", colors.muted],
  ] as const) {
    expect(sync([{ ...marker(), condition }, marker("other")]).updated).toBe(1);
    expect(first.pin.material.color.getHexString()).toBe(tint.slice(1));
    expect(first.pin.geometry).toBe(geometry);
    expect(first.pin.material).toBe(material);
    expect(first.label).toBe(label);
    expect(nodes.get("other")).toBe(other);
    expect(other.pin.material.color.getHexString()).toBe(
      colors.security.slice(1),
    );
  }
});

test("renaming/reclassifying replaces only the label; moving keeps the stable marker", () => {
  const { nodes, sync, makeLabel } = setup();
  sync([marker()]);
  const node = nodes.get("stable")!,
    label = node.label;
  const textureDisposed = jest.fn(),
    materialDisposed = jest.fn();
  label.material.map!.addEventListener("dispose", textureDisposed);
  label.material.addEventListener("dispose", materialDisposed);
  sync([
    {
      ...marker(),
      label: "Renamed plug",
      icon: "switch",
      position: { x: 2, z: 3 },
    },
  ]);
  expect(nodes.get("stable")).toBe(node);
  expect(node.label).not.toBe(label);
  expect(makeLabel).toHaveBeenLastCalledWith("Renamed plug", "switch");
  expect(textureDisposed).toHaveBeenCalledTimes(1);
  expect(materialDisposed).toHaveBeenCalledTimes(1);
  expect(node.pin.material.color.getHexString()).toBe(colors.warning.slice(1));
  expect(node.group.position.x).toBe(2 - floor.center.x);
  expect(node.group.position.z).toBeCloseTo(floor.center.z - 3);
});

test("removal disposes owned resources once without disposing the shared sprite quad", () => {
  const { nodes, sync, group } = setup();
  sync([marker(), marker("other")]);
  const node = nodes.get("stable")!,
    other = nodes.get("other")!;
  const geometryDisposed = jest.fn(),
    labelDisposed = jest.fn(),
    quadDisposed = jest.fn();
  node.pin.geometry.addEventListener("dispose", geometryDisposed);
  node.label.material.map!.addEventListener("dispose", labelDisposed);
  node.label.geometry.addEventListener("dispose", quadDisposed);
  expect(sync([marker("other")])).toEqual({
    created: 0,
    updated: 0,
    removed: 1,
  });
  expect(group.children).toEqual([other.group]);
  expect(geometryDisposed).toHaveBeenCalledTimes(1);
  expect(labelDisposed).toHaveBeenCalledTimes(1);
  expect(quadDisposed).not.toHaveBeenCalled();
  sync([marker("other")]);
  expect(geometryDisposed).toHaveBeenCalledTimes(1);
});
