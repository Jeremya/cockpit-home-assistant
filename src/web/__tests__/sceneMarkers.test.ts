import * as THREE from "three";
import { syncMarkers, type MarkerNodes } from "../sceneMarkers";
import { toSceneFloor, type SceneMarker } from "../sceneModel";
import { publicPlan } from "../../spatial/__tests__/placementFixtures";
import { colors } from "../../theme";
import { MARKER_HEIGHT, markerStyle } from "../markerStyle";
import { MARKER_STEM_LENGTH } from "../sceneMarkers";
import { FLOOR_THICKNESS } from "../sceneStyle";
import type { Condition } from "../../core/types";

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

test("each condition shows exactly its own head silhouette on the same pin, and only live states glow", () => {
  const { nodes, sync } = setup();
  sync([marker()]);
  const node = nodes.get("stable")!;
  const material = node.pin.material;
  const conditions: Condition[] = [
    "active",
    "attention",
    "alert",
    "unknown",
    "unavailable",
    "stale",
    "normal",
  ];
  for (const condition of conditions) {
    sync([{ ...marker(), condition }]);
    const style = markerStyle(condition);
    expect({
      bead: node.pin.visible,
      diamond: node.diamond.visible,
      ring: node.ring.visible,
    }).toEqual({
      bead: style.head === "bead",
      diamond: style.head === "diamond",
      ring: style.head === "ring",
    });
    expect(node.slash.visible).toBe(style.mark === "slash");
    expect(node.dot.visible).toBe(style.mark === "dot");
    expect(node.glow.visible).toBe(style.glow > 0);
    expect(material.emissiveIntensity).toBe(style.emissive);
    // One material carries the U04 colour for every silhouette.
    for (const part of [node.diamond, node.ring, node.slash, node.dot])
      expect(part.material).toBe(material);
    expect(nodes.get("stable")).toBe(node);
  }
  for (const condition of ["unknown", "unavailable", "stale"] as const) {
    sync([{ ...marker(), condition }]);
    expect(node.pin.visible).toBe(false);
    expect(node.glow.visible).toBe(false);
  }
});

test("a pin stands on the finished floor of its plan point; its head and name are drawn over the house", () => {
  const { nodes, sync } = setup();
  sync([marker()]);
  const node = nodes.get("stable")!;
  expect(node.group.position.y).toBe(MARKER_HEIGHT);
  expect(node.group.position.y - MARKER_STEM_LENGTH).toBeCloseTo(
    FLOOR_THICKNESS,
    10,
  );
  // The stem belongs to the room (depth-tested); the state never hides.
  expect((node.stem.material as THREE.Material).depthTest).toBe(true);
  expect(node.pin.material.depthTest).toBe(false);
  expect(node.label.renderOrder).toBeGreaterThan(node.pin.renderOrder);
  expect(node.pin.renderOrder).toBeGreaterThan(node.glow.renderOrder);
  // Markers never cast shadows, so an observation cannot dirty the shadow map.
  node.group.traverse((object) => expect(object.castShadow).toBe(false));
});

test("removing a pin releases every part it owns, including its halo texture", () => {
  const { nodes, sync } = setup();
  sync([marker()]);
  const node = nodes.get("stable")!;
  const disposed = jest.fn();
  for (const resource of [
    node.pin.geometry,
    node.diamond.geometry,
    node.ring.geometry,
    node.slash.geometry,
    node.stem.geometry,
    node.pin.material,
    node.stem.material as THREE.Material,
    node.glow.material,
    node.glow.material.map!,
    node.leader.material,
  ])
    resource.addEventListener("dispose", disposed);
  sync([]);
  expect(disposed).toHaveBeenCalledTimes(10);
  expect(nodes.size).toBe(0);
});
