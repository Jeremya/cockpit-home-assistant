import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { emptyPreferences, emptySpatial } from "../../preferences/types";
import { parseHousePlan, type HousePlan } from "../model";
import {
  areaLinkStatus,
  entitiesByPlanRoom,
  planRoomForEntity,
  setAreaLink,
} from "../selectors";

const square = (x: number) => [
  { x, z: 0 },
  { x: x + 2, z: 0 },
  { x: x + 2, z: 2 },
  { x, z: 2 },
];
const room = (id: string, name: string, x: number) => ({
  id,
  name,
  shortName: name,
  kind: "bedroom" as const,
  polygon: square(x),
  label: { x: x + 1, z: 1 },
});
// Two floors, each with a room called "Bedroom".
const plan: HousePlan = parseHousePlan({
  schemaVersion: 1,
  id: "test-home",
  revision: 1,
  name: "Test home",
  source: "sample",
  scale: "approximate",
  floors: [
    {
      id: "f1",
      name: "Floor 1",
      outline: square(0).map((p) => ({ x: p.x * 3, z: p.z })),
      rooms: [room("f1-bed", "Bedroom", 0), room("f1-living", "Living", 2)],
      lines: [],
    },
    {
      id: "f2",
      name: "Floor 2",
      outline: square(0).map((p) => ({ x: p.x * 3, z: p.z })),
      rooms: [room("f2-bed", "Bedroom", 0)],
      lines: [],
    },
  ],
})!;

const entity = (
  key: string,
  areaId: string | null,
  deviceId: string | null = null,
): EntityRecord => ({
  key,
  entityId: `switch.${key}`,
  domain: "switch",
  state: "off",
  attributes: {},
  lastChanged: "",
  lastUpdated: "",
  deviceId,
  areaId,
  entityCategory: null,
  hiddenInHA: false,
  disabledInHA: false,
  name: key,
});
const fresh = { kind: "fresh" as const, loadedAt: "" };
const snapshot = (
  entities: EntityRecord[],
  areas: string[],
  areasMetadata: HomeSnapshot["metadata"]["areas"] = fresh,
): HomeSnapshot => ({
  sessionId: "s",
  syncEpoch: 1,
  receivedAt: "",
  entities: Object.fromEntries(entities.map((e) => [e.entityId, e])),
  devices: { plug: { id: "plug", name: "Plug", areaId: "nursery" } } as never,
  areas: Object.fromEntries(areas.map((id) => [id, { id, name: id }])),
  registryEntries: [],
  config: { temperatureUnit: "°C", haVersion: "2026.10.1" },
  identities: { schemaVersion: 1, entityKeys: {}, aliases: {} },
  metadata: { entities: fresh, devices: fresh, areas: areasMetadata },
});
const prefs = (
  areaLinks: Record<string, string>,
  roomOverrides: Record<string, string> = {},
) => ({
  ...emptyPreferences(),
  roomOverrides,
  spatial: { ...emptySpatial(), plan, areaLinks },
});

test("same-name rooms on different floors resolve by stable room ID", () => {
  const home = snapshot(
    [entity("lamp", "parents"), entity("nightlight", "kids")],
    ["parents", "kids"],
  );
  const p = prefs({ "f1-bed": "parents", "f2-bed": "kids" });
  expect(
    planRoomForEntity(home.entities["switch.lamp"]!, home, p, plan),
  ).toEqual({
    floorId: "f1",
    roomId: "f1-bed",
  });
  expect(
    planRoomForEntity(home.entities["switch.nightlight"]!, home, p, plan),
  ).toEqual({ floorId: "f2", roomId: "f2-bed" });
});

test("the app room override wins over entity and device areas before links apply", () => {
  const home = snapshot(
    [entity("lamp", "parents", "plug")],
    ["parents", "kids", "nursery"],
  );
  const links = {
    "f1-bed": "parents",
    "f2-bed": "kids",
    "f1-living": "nursery",
  };
  const lamp = home.entities["switch.lamp"]!;
  expect(planRoomForEntity(lamp, home, prefs(links), plan)?.roomId).toBe(
    "f1-bed",
  );
  expect(
    planRoomForEntity(lamp, home, prefs(links, { lamp: "kids" }), plan)?.roomId,
  ).toBe("f2-bed");
  const deviceOnly = { ...lamp, areaId: null };
  expect(planRoomForEntity(deviceOnly, home, prefs(links), plan)?.roomId).toBe(
    "f1-living",
  );
});

test("unlinked and unassigned entities stay listed instead of disappearing", () => {
  const home = snapshot(
    [entity("lamp", "parents"), entity("fan", "garage"), entity("loose", null)],
    ["parents", "garage"],
  );
  const grouped = entitiesByPlanRoom(
    home,
    prefs({ "f1-bed": "parents" }),
    plan,
  );
  expect(grouped.byRoom).toEqual({ "f1-bed": ["switch.lamp"] });
  expect(grouped.unlinked.sort()).toEqual(["switch.fan", "switch.loose"]);
});

test("hidden entities are not counted in a room", () => {
  const hidden = { ...entity("lamp", "parents"), hiddenInHA: true };
  const home = snapshot([hidden], ["parents"]);
  expect(
    entitiesByPlanRoom(home, prefs({ "f1-bed": "parents" }), plan),
  ).toEqual({
    byRoom: {},
    unlinked: [],
  });
});

test("a link to an area removed from HA is kept and reported, never mapped", () => {
  const home = snapshot([entity("lamp", "parents")], ["kids"]);
  const p = prefs({ "f1-bed": "parents" });
  expect(areaLinkStatus("f1-bed", p.spatial.areaLinks, home)).toEqual({
    kind: "missing",
    areaId: "parents",
  });
  expect(
    planRoomForEntity(home.entities["switch.lamp"]!, home, p, plan),
  ).toBeNull();
  expect(areaLinkStatus("f2-bed", p.spatial.areaLinks, home)).toEqual({
    kind: "unlinked",
  });
  expect(areaLinkStatus("f1-bed", { "f1-bed": "kids" }, home)).toEqual({
    kind: "linked",
    area: { id: "kids", name: "kids" },
    verified: true,
  });
});

test("without area metadata a link is unverified, not reported as removed", () => {
  const stale = {
    kind: "stale" as const,
    lastLoadedAt: null,
    reason: "forbidden" as const,
  };
  const home = snapshot([entity("lamp", "parents")], [], stale);
  expect(areaLinkStatus("f1-bed", { "f1-bed": "parents" }, home)).toEqual({
    kind: "unverified",
    areaId: "parents",
  });
  expect(areaLinkStatus("f1-bed", { "f1-bed": "parents" }, null)).toEqual({
    kind: "unverified",
    areaId: "parents",
  });
});

test("an area links to one room: choosing it again moves the link", () => {
  const links = { "f1-bed": "parents", "f2-bed": "kids" };
  expect(setAreaLink(links, "f1-living", "parents")).toEqual({
    "f1-living": "parents",
    "f2-bed": "kids",
  });
  expect(setAreaLink(links, "f2-bed", null)).toEqual({ "f1-bed": "parents" });
  expect(links).toEqual({ "f1-bed": "parents", "f2-bed": "kids" });
});

test("plan room IDs that collide with object prototype names are handled as data", () => {
  const tricky: HousePlan = parseHousePlan({
    ...plan,
    floors: [
      {
        ...plan.floors[0]!,
        rooms: [room("constructor", "Odd", 0), room("__proto__", "Odder", 2)],
      },
      { ...plan.floors[1]!, rooms: [room("toString", "Oddest", 0)] },
    ],
  })!;
  expect(tricky).not.toBeNull();
  const home = snapshot(
    [entity("lamp", "parents"), entity("fan", "kids")],
    ["parents", "kids"],
  );
  let links = setAreaLink({}, "__proto__", "parents");
  links = setAreaLink(links, "constructor", "kids");
  expect(Object.keys(links).sort()).toEqual(["__proto__", "constructor"]);
  const p = {
    ...prefs(links),
    spatial: { ...emptySpatial(), plan: tricky, areaLinks: links },
  };
  const grouped = entitiesByPlanRoom(home, p, tricky);
  expect(grouped.byRoom["__proto__"]).toEqual(["switch.lamp"]);
  expect(grouped.byRoom["constructor"]).toEqual(["switch.fan"]);
  expect(areaLinkStatus("toString", links, home)).toEqual({ kind: "unlinked" });
  expect(areaLinkStatus("constructor", links, home)).toMatchObject({
    kind: "linked",
  });
});

test("a link resolved from a stale area registry keeps its cached qualification", () => {
  const stale = {
    kind: "stale" as const,
    lastLoadedAt: "earlier",
    reason: "timeout" as const,
  };
  const home = snapshot([entity("lamp", "parents")], ["parents"], stale);
  expect(areaLinkStatus("f1-bed", { "f1-bed": "parents" }, home)).toEqual({
    kind: "linked",
    area: { id: "parents", name: "parents" },
    verified: false,
  });
  const freshHome = snapshot([entity("lamp", "parents")], ["parents"]);
  expect(areaLinkStatus("f1-bed", { "f1-bed": "parents" }, freshHome)).toEqual({
    kind: "linked",
    area: { id: "parents", name: "parents" },
    verified: true,
  });
});
