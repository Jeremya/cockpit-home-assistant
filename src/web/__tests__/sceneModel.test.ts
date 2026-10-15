import sample from "../../spatial/sample-plan.json";
import { parseHousePlan } from "../../spatial/model";
import {
  FrameStats,
  classifyGesture,
  pickRoomAt,
  planToWorld,
  sanitizeMarkers,
  toSceneFloor,
  worldToPlan,
} from "../sceneModel";

const plan = parseHousePlan(sample)!;
const floor = plan.floors[0]!;

test("scene floors carry only geometry, never dimensions or other free text", () => {
  const scene = toSceneFloor(floor);
  expect(scene.id).toBe(floor.id);
  expect(scene.rooms.map((room) => room.id)).toEqual(
    floor.rooms.map((room) => room.id),
  );
  expect(JSON.stringify(scene)).not.toContain("dimensions");
  expect(scene.rooms[0]).toEqual({
    id: floor.rooms[0]!.id,
    shortName: floor.rooms[0]!.shortName,
    kind: floor.rooms[0]!.kind,
    polygon: floor.rooms[0]!.polygon,
    label: floor.rooms[0]!.label,
  });
  expect(scene.lines).toHaveLength(floor.lines.length);
});

test("plan and world coordinates round-trip around the floor center, larger Z drawn farther away", () => {
  const scene = toSceneFloor(floor);
  const point = { x: 1.25, z: 3.5 };
  const world = planToWorld(point, scene.center);
  expect(world.y).toBe(0);
  expect(worldToPlan(world, scene.center)).toEqual(point);
  const farther = planToWorld({ x: point.x, z: point.z + 1 }, scene.center);
  expect(farther.z).toBeLessThan(world.z);
});

test("room picking uses true polygons, so concave cutouts select nothing", () => {
  const concave = {
    ...toSceneFloor(floor),
    rooms: [
      {
        id: "l-room",
        shortName: "L",
        kind: "living" as const,
        polygon: [
          { x: 0, z: 0 },
          { x: 4, z: 0 },
          { x: 4, z: 2 },
          { x: 2, z: 2 },
          { x: 2, z: 4 },
          { x: 0, z: 4 },
        ],
        label: { x: 1, z: 1 },
      },
    ],
  };
  expect(pickRoomAt({ x: 1, z: 3 }, concave)).toBe("l-room");
  expect(pickRoomAt({ x: 3, z: 3 }, concave)).toBeNull();
});

test("only a short single-pointer press with little movement counts as a tap", () => {
  const base = { dx: 0, dy: 0, durationMs: 120, maxPointers: 1 };
  expect(classifyGesture(base)).toBe("tap");
  expect(classifyGesture({ ...base, dx: 6, dy: 6 })).toBe("tap");
  expect(classifyGesture({ ...base, dx: 14, dy: 0 })).toBe("drag");
  expect(classifyGesture({ ...base, maxPointers: 2 })).toBe("multi");
  expect(classifyGesture({ ...base, durationMs: 900 })).toBe("long");
});

test("markers are sanitized to the bridge contract and invalid entries are dropped", () => {
  const markers = sanitizeMarkers(
    [
      {
        key: "fixture:lock",
        floorId: floor.id,
        position: { x: 1, z: 1 },
        icon: "lock",
        label: "Front door",
        condition: "attention",
        token: "secret",
        attributes: { code: "1234" },
      },
      {
        key: "bad",
        floorId: floor.id,
        position: { x: Number.NaN, z: 1 },
        icon: "lock",
        label: "Broken",
        condition: "normal",
      },
      {
        key: "other-floor",
        floorId: "elsewhere",
        position: { x: 1, z: 1 },
        icon: "fan",
        label: "Fan",
        condition: "active",
      },
      {
        key: "weird",
        floorId: floor.id,
        position: { x: 1, z: 1 },
        icon: "fan",
        label: "x".repeat(200),
        condition: "exploded",
      },
    ],
    floor.id,
  );
  expect(markers).toEqual([
    {
      key: "fixture:lock",
      floorId: floor.id,
      position: { x: 1, z: 1 },
      icon: "lock",
      label: "Front door",
      condition: "attention",
    },
  ]);
});

test("frame stats report interaction fps, idle frames and hidden frames separately", () => {
  const stats = new FrameStats();
  stats.beginInteraction(1000);
  for (let t = 1000; t <= 2000; t += 20) stats.frame(t, true);
  stats.endInteraction(2000);
  stats.frame(2100, true);
  stats.frame(2200, false);
  const report = stats.report();
  expect(report.interaction.frames).toBe(51);
  expect(report.interaction.fps).toBeCloseTo(51, 0);
  expect(report.idleFrames).toBe(1);
  expect(report.hiddenFrames).toBe(1);
  expect(report.totalFrames).toBe(53);
});
