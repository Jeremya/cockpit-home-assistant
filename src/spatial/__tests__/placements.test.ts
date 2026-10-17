import { useCockpit } from "../../core/store";
import { session } from "../../services/runtime";
import {
  floorViewBox,
  planToScreen,
  pressLocation,
  screenToPlan,
} from "../viewport";
import { parseHousePlan } from "../model";
import { housePlanFor } from "../plans";
import { placementGeometryIssue, savedPlacements } from "../placements";
import { savePlacement, removePlacement } from "../placementActions";
import {
  fixtureEntity,
  fixtureSnapshot,
  fixturePreferences,
  location,
  publicPlan,
} from "./placementFixtures";

jest.mock("../../services/runtime", () => {
  const { useCockpit: store } = jest.requireActual("../../core/store");
  return {
    session: {
      updatePreferences: jest.fn((update) => {
        const state = store.getState();
        if (!state.profileId || state.profileId !== state.preferencesLoadedFor)
          return false;
        store.setState({ preferences: update(state.preferences) });
        return true;
      }),
      callService: jest.fn(),
    },
  };
});
beforeEach(() => {
  useCockpit.setState(useCockpit.getInitialState(), true);
  useCockpit.setState({
    profileId: "demo",
    mode: "demo",
    preferencesLoadedFor: "demo",
    snapshot: fixtureSnapshot(),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
    preferences: fixturePreferences(),
  });
});
const identity = () => housePlanFor(useCockpit.getState()).identity;
const placements = () => useCockpit.getState().preferences.spatial.placements;

test("native touch and DOM clicks both resolve to local overlay coordinates", () => {
  expect(
    pressLocation({ nativeEvent: { locationX: 40, locationY: 100 } }),
  ).toEqual({ x: 40, y: 100 });
  expect(
    pressLocation({
      nativeEvent: { clientX: 50, clientY: 500 },
      currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 400 }) },
    }),
  ).toEqual({ x: 40, y: 100 });
  expect(pressLocation({ nativeEvent: {} })).toBeNull();
});

test.each([
  { width: 320, height: 360 },
  { width: 430, height: 640 },
  { width: 768, height: 320 },
])("screen coordinates round-trip in meters at $width × $height", (size) => {
  const box = floorViewBox(publicPlan.floors[0]!);
  for (const point of [
    { x: 0, z: 0 },
    { x: 8, z: 6 },
    { x: 2.25, z: 4.5 },
  ]) {
    const pixel = planToScreen(point, box, size)!;
    const restored = screenToPlan(pixel, box, size)!;
    expect(restored.x).toBeCloseTo(point.x, 8);
    expect(restored.z).toBeCloseTo(point.z, 8);
  }
});
test("SVG padding and inverted Z match fixed known screen coordinates", () => {
  const box = floorViewBox(publicPlan.floors[0]!);
  expect(
    screenToPlan({ x: 28, y: 28 }, box, { width: 696, height: 536 }),
  ).toEqual({ x: 0, z: 6 });
  expect(
    screenToPlan({ x: 668, y: 508 }, box, { width: 696, height: 536 }),
  ).toEqual({ x: 8, z: 0 });
});
test("vertical/horizontal letterboxing and unmeasured layouts are not positions", () => {
  const box = floorViewBox(publicPlan.floors[0]!);
  expect(
    screenToPlan({ x: 348, y: 10 }, box, { width: 696, height: 1000 }),
  ).toBeNull();
  expect(
    screenToPlan({ x: 10, y: 200 }, box, { width: 1000, height: 536 }),
  ).toBeNull();
  expect(
    screenToPlan({ x: 10, y: 10 }, box, { width: 0, height: 360 }),
  ).toBeNull();
  expect(
    screenToPlan({ x: NaN, y: 10 }, box, { width: 320, height: 360 }),
  ).toBeNull();
});
test("a concave cutout and an outside chosen room are rejected separately", () => {
  const raw = structuredClone(publicPlan);
  raw.floors = [
    {
      ...raw.floors[0]!,
      outline: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 2 },
        { x: 2, z: 2 },
        { x: 2, z: 4 },
        { x: 0, z: 4 },
      ],
      rooms: [
        {
          ...raw.floors[0]!.rooms[0]!,
          polygon: [
            { x: 0, z: 0 },
            { x: 2, z: 0 },
            { x: 2, z: 4 },
            { x: 0, z: 4 },
          ],
          label: { x: 1, z: 2 },
        },
      ],
      lines: [],
    },
  ];
  const plan = parseHousePlan(raw)!;
  expect(plan).not.toBeNull();
  expect(
    placementGeometryIssue(plan, { ...location, position: { x: 3, z: 3 } }),
  ).toBe("outside_floor");
  expect(
    placementGeometryIssue(plan, {
      ...location,
      roomId: "sample-1-0",
      position: { x: 3, z: 1 },
    }),
  ).toBe("outside_room");
  expect(
    placementGeometryIssue(plan, { ...location, position: { x: 3, z: 1 } }),
  ).toBeNull();
  expect(
    placementGeometryIssue(plan, {
      ...location,
      roomId: "sample-1-0",
      position: { x: 2, z: 1 },
    }),
  ).toBeNull();
});
test("hidden, missing and unresolved geometry are retained rather than remapped", () => {
  const prefs = fixturePreferences({
    stable: location,
    removed: { ...location, floorId: "old-floor" },
  });
  prefs.visibility.stable = "hidden";
  const result = savedPlacements(fixtureSnapshot(), prefs, publicPlan, true);
  expect(result.find((p) => p.key === "stable")?.issues).toEqual([
    "entity_hidden",
  ]);
  expect(result.find((p) => p.key === "removed")?.issues).toEqual([
    "floor_missing",
    "entity_missing",
  ]);
  expect(Object.keys(prefs.spatial.placements)).toEqual(["stable", "removed"]);
  expect(savedPlacements(null, prefs, publicPlan, false)[0]?.issues).toContain(
    "entity_unverified",
  );
});
test("unavailable entities keep their location; disconnected ones are explicitly stale", () => {
  const prefs = fixturePreferences({ stable: location });
  const unavailable = savedPlacements(
    fixtureSnapshot([fixtureEntity({ state: "unavailable" })]),
    prefs,
    publicPlan,
    true,
  )[0]!;
  expect(unavailable.issues).toEqual([]);
  expect(unavailable.condition).toBe("unavailable");
  expect(
    savedPlacements(fixtureSnapshot(), prefs, publicPlan, false)[0]?.condition,
  ).toBe("stale");
});
test("aliases follow a stable identity and canonical placement wins", () => {
  const prefs = fixturePreferences({
    old: { ...location, position: { x: 2, z: 2 } },
    stable: location,
  });
  prefs.identities.aliases.old = "stable";
  const result = savedPlacements(fixtureSnapshot(), prefs, publicPlan, true);
  expect(result).toHaveLength(1);
  expect(result[0]?.placement).toEqual(location);
});
test("rename follows the same key; a recreated entityId never inherits a placement", () => {
  const prefs = fixturePreferences({ stable: location });
  const renamed = savedPlacements(
    fixtureSnapshot([fixtureEntity({ entityId: "switch.renamed" })]),
    prefs,
    publicPlan,
    true,
  )[0]!;
  expect(renamed.entity?.entityId).toBe("switch.renamed");
  const recreated = savedPlacements(
    fixtureSnapshot([fixtureEntity({ key: "new-uuid" })]),
    prefs,
    publicPlan,
    true,
  )[0]!;
  expect(recreated.entity).toBeNull();
  expect(recreated.issues).toContain("entity_missing");
});
test("local placement can be saved from cached observations without a device command", () => {
  useCockpit.setState({ status: { kind: "reconnecting", lastReadyAt: null } });
  expect(savePlacement(identity(), "stable", location)).toBeNull();
  expect(placements().stable).toEqual(location);
  expect(
    (session as unknown as { callService: jest.Mock }).callService,
  ).not.toHaveBeenCalled();
});
test("save revalidates room geometry, visibility and current entity presence", () => {
  expect(
    savePlacement(identity(), "stable", { ...location, roomId: "sample-1-1" }),
  ).toMatch(/outside/);
  useCockpit.setState({
    snapshot: fixtureSnapshot([fixtureEntity({ hiddenInHA: true })]),
  });
  expect(savePlacement(identity(), "stable", location)).toMatch(/no longer/);
  useCockpit.setState({ snapshot: fixtureSnapshot([]) });
  expect(savePlacement(identity(), "stable", location)).toMatch(/no longer/);
  expect(placements()).toEqual({});
});
test("a context or unloaded-profile change refuses both save and removal", () => {
  const previous = identity();
  useCockpit.setState({
    profileId: "ha:https://other.test",
    preferencesLoadedFor: "ha:https://other.test",
  });
  expect(savePlacement(previous, "stable", location)).toMatch(/changed/);
  expect(removePlacement(previous, "stable")).toMatch(/changed/);
  useCockpit.setState({ preferencesLoadedFor: null });
  expect(savePlacement(identity(), "stable", location)).toMatch(/not loaded/);
  expect(placements()).toEqual({});
});
test("compound context IDs cannot collide through colons in origins and plan IDs", () => {
  const preferences = fixturePreferences();
  preferences.spatial.plan!.id = "123:home";
  useCockpit.setState({
    profileId: "ha:http://example.test",
    preferencesLoadedFor: "ha:http://example.test",
    preferences,
  });
  const old = identity();
  useCockpit.setState({
    profileId: "ha:http://example.test:123",
    preferencesLoadedFor: "ha:http://example.test:123",
    preferences: {
      ...preferences,
      spatial: {
        ...preferences.spatial,
        plan: { ...preferences.spatial.plan!, id: "home" },
      },
    },
  });
  expect(identity()).not.toBe(old);
  expect(savePlacement(old, "stable", location)).toMatch(/changed/);
});
test("removal keeps unrelated preferences and works for missing entity placements", () => {
  const preferences = fixturePreferences({
    stable: location,
    removed: location,
  });
  preferences.favorites = ["stable"];
  useCockpit.setState({ preferences });
  expect(removePlacement(identity(), "removed")).toBeNull();
  expect(placements()).toEqual({ stable: location });
  expect(useCockpit.getState().preferences.favorites).toEqual(["stable"]);
});
