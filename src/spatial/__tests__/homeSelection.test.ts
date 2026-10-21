import {
  filterHomeSummaries,
  initialHomeView,
  reconcileHomeSelection,
  selectHomeArea,
  selectHomeFloor,
  selectHomeRoom,
  selectedHomeArea,
  selectedHomeRoom,
} from "../homeSelection";
import { deviceSummaries } from "../../core/deviceSummaries";
import {
  fixtureEntity,
  fixturePreferences,
  fixtureSnapshot,
  publicPlan,
} from "./placementFixtures";

const links = { "sample-1-1": "kitchen", "sample-2-1": "office" };
const initial = () => initialHomeView("profile-plan-revision", publicPlan);
const snapshot = () => ({
  ...fixtureSnapshot(),
  areas: {
    kitchen: { id: "kitchen", name: "Same name" },
    office: { id: "office", name: "Same name" },
  },
});

test("area IDs select only their explicit link, including another floor", () => {
  const start = initial();
  const office = selectHomeArea(start, "office", publicPlan, links);
  expect(office.floorId).toBe("sample-floor-2");
  expect(selectedHomeRoom(office, publicPlan, links)).toEqual({
    floorId: "sample-floor-2",
    roomId: "sample-2-1",
  });
  const unlinked = selectHomeArea(office, "Kitchen", publicPlan, links);
  expect(unlinked.floorId).toBe(office.floorId);
  expect(selectedHomeRoom(unlinked, publicPlan, links)).toBeNull();
  expect(
    selectedHomeRoom(office, publicPlan, { ...links, "sample-1-0": "office" }),
  ).toBeNull();
  expect(start).toEqual(initial());
});

test("room, floor, all and unassigned transitions never guess a link by name", () => {
  const room = selectHomeRoom(
    initial(),
    "sample-floor-2",
    "sample-2-1",
    publicPlan,
  );
  expect(selectedHomeArea(room, links)).toBe("office");
  expect(selectedHomeArea(room, {})).toBeUndefined();
  expect(selectHomeRoom(room, "sample-floor-1", "sample-2-1", publicPlan)).toBe(
    room,
  );
  expect(selectHomeFloor(room, "missing", publicPlan)).toBe(room);
  expect(selectHomeFloor(room, "sample-floor-3", publicPlan)).toMatchObject({
    floorId: "sample-floor-3",
    selection: { kind: "all" },
  });
  for (const kind of ["all", "unassigned"] as const) {
    const next = { ...room, selection: { kind } };
    expect(selectedHomeRoom(next, publicPlan, links)).toBeNull();
    expect(
      reconcileHomeSelection(
        next,
        publicPlan,
        snapshot(),
        next.identity,
        links,
      ),
    ).toBe(next);
  }
});

test("only a fresh area deletion clears intent; absent or stale registries preserve it", () => {
  const area = selectHomeArea(initial(), "office", publicPlan, links);
  const stale = fixtureSnapshot();
  stale.metadata.areas = {
    kind: "stale",
    reason: "timeout",
    lastLoadedAt: null,
  };
  for (const value of [null, stale, snapshot()]) {
    expect(
      reconcileHomeSelection(area, publicPlan, value, area.identity, links),
    ).toBe(area);
  }
  expect(
    reconcileHomeSelection(
      area,
      publicPlan,
      fixtureSnapshot(),
      area.identity,
      links,
    ),
  ).toMatchObject({ floorId: area.floorId, selection: { kind: "all" } });
  expect(
    reconcileHomeSelection(area, publicPlan, snapshot(), area.identity, {
      "sample-1-0": "office",
    }),
  ).toMatchObject({ floorId: "sample-floor-1", selection: area.selection });
});

test("scope changes reset floor and selection; missing rooms clear only the selection", () => {
  const room = selectHomeRoom(
    initial(),
    "sample-floor-2",
    "sample-2-1",
    publicPlan,
  );
  expect(
    reconcileHomeSelection(
      room,
      publicPlan,
      null,
      "new-profile-plan-revision",
      links,
    ),
  ).toEqual(initialHomeView("new-profile-plan-revision", publicPlan));
  const changed = {
    ...publicPlan,
    floors: publicPlan.floors.map((f) => ({
      ...f,
      rooms: f.rooms.filter((r) => r.id !== "sample-2-1"),
    })),
  };
  expect(
    reconcileHomeSelection(room, changed, null, room.identity, links),
  ).toMatchObject({ floorId: room.floorId, selection: { kind: "all" } });
  expect(
    reconcileHomeSelection(
      { ...room, floorId: "missing" },
      publicPlan,
      null,
      room.identity,
      links,
    ),
  ).toEqual(initial());
});

test("multi-area devices appear once in All and in each resolved area, without counting readings as devices", () => {
  const entities = [
    fixtureEntity(),
    fixtureEntity({
      key: "other",
      entityId: "sensor.other",
      domain: "sensor",
      areaId: "office",
    }),
    fixtureEntity({
      key: "loose",
      entityId: "sensor.loose",
      domain: "sensor",
      deviceId: null,
      areaId: null,
    }),
    fixtureEntity({
      key: "named",
      entityId: "sensor.named",
      domain: "sensor",
      deviceId: "named",
      areaId: "unassigned",
    }),
  ];
  const groups = deviceSummaries(
    {
      ...fixtureSnapshot(entities),
      areas: {
        ...snapshot().areas,
        unassigned: { id: "unassigned", name: "Unassigned" },
      },
    },
    fixturePreferences(),
    "demo",
    true,
  );
  expect(filterHomeSummaries(groups, initial(), links)).toBe(groups);
  for (const area of ["kitchen", "office"]) {
    const filtered = filterHomeSummaries(
      groups,
      selectHomeArea(initial(), area, publicPlan, links),
      links,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.members).toHaveLength(2);
  }
  expect(
    filterHomeSummaries(
      groups,
      { ...initial(), selection: { kind: "unassigned" } },
      links,
    ).map((g) => g.members[0]!.key),
  ).toEqual(["loose"]);
  expect(
    filterHomeSummaries(
      groups,
      selectHomeArea(initial(), "unassigned", publicPlan, links),
      links,
    ).map((g) => g.members[0]!.key),
  ).toEqual(["named"]);
  expect(
    filterHomeSummaries(
      groups,
      selectHomeRoom(initial(), "sample-floor-1", "sample-1-1", publicPlan),
      {},
    ),
  ).toEqual([]);
});

test("prototype properties are never links or registry entries", () => {
  const area = selectHomeArea(initial(), "constructor", publicPlan, {});
  expect(
    reconcileHomeSelection(
      area,
      publicPlan,
      fixtureSnapshot(),
      area.identity,
      {},
    ),
  ).toMatchObject({ selection: { kind: "all" } });
  const room = {
    ...initial(),
    selection: {
      kind: "planRoom" as const,
      floorId: "sample-floor-1",
      roomId: "__proto__",
    },
  };
  expect(selectedHomeArea(room, {})).toBeUndefined();
});
