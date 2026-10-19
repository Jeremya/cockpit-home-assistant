import { PreferencesStorage } from "../storage";
import sample from "../../spatial/sample-plan.json";
import { parseHousePlan } from "../../spatial/model";
import {
  emptyIdentity,
  emptyPreferences,
  emptySpatial,
  reconcilePreferences,
} from "../types";
test("corrupt preferences are backed up and do not prevent startup", async () => {
  const values = new Map([["prefs", "{bad-json"]]);
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
  const result = await new PreferencesStorage(storage).load();
  expect(result.file.profiles).toEqual({});
  expect(result.notice).toBeTruthy();
  expect(
    [...values.keys()].some((key) => key.startsWith("prefs.corrupt.")),
  ).toBe(true);
});
test("aliases migrate favorites, rooms, visibility and camera associations without overwriting newer preferences", () => {
  const prefs = {
    ...emptyPreferences(),
    favorites: ["entity:lock.door", "stable"],
    roomOverrides: { "entity:lock.door": "old-room", stable: "new-room" },
    visibility: { "entity:lock.door": "hidden" as const },
    cameraEventOverrides: { "entity:lock.door": ["entity:lock.door"] },
  };
  const migrated = reconcilePreferences(prefs, {
    ...emptyIdentity(),
    aliases: { "entity:lock.door": "stable" },
  });
  expect(migrated.favorites).toEqual(["stable"]);
  expect(migrated.roomOverrides.stable).toBe("new-room");
  expect(migrated.visibility.stable).toBe("hidden");
  expect(migrated.cameraEventOverrides.stable).toEqual(["stable"]);
});

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    },
  };
};
const backups = (values: Map<string, string>) =>
  [...values.keys()].filter((key) => key.startsWith("prefs.corrupt."));
const v1Profile = (favorite: string) => ({
  favorites: [favorite],
  visibility: { [favorite]: "hidden" },
  roomOverrides: { [favorite]: "area-1" },
  cameraEventOverrides: { "camera:door": [favorite] },
  identities: {
    schemaVersion: 1,
    entityKeys: { [`lock.${favorite}`]: favorite },
    aliases: { [`entity:lock.${favorite}`]: favorite },
  },
});
const spatial = () => ({
  plan: parseHousePlan(sample)!,
  seededFrom: { planId: "sample-home", revision: 1 },
  areaLinks: { "sample-1-0": "living_room", "deleted-room": "old_area" },
  placements: {
    "device:lamp": {
      floorId: "sample-floor-1",
      roomId: "sample-1-0",
      position: { x: 1.25, z: -2.5 },
    },
    "device:removed": {
      floorId: "missing-floor",
      roomId: null,
      position: { x: 0, z: 0 },
    },
  },
});

test("a valid v1 file migrates to v3 with every profile and field preserved", async () => {
  const v1 = {
    schemaVersion: 1,
    profiles: {
      "ha:https://a.example:8123": v1Profile("a"),
      "ha:http://192.168.1.2:8123": v1Profile("b"),
      demo: v1Profile("demo"),
    },
  };
  const { storage, values } = memory({ prefs: JSON.stringify(v1) });
  const { file, notice } = await new PreferencesStorage(storage).load();
  expect(notice).toBeUndefined();
  expect(backups(values)).toEqual([]);
  expect(file.schemaVersion).toBe(3);
  for (const [id, profile] of Object.entries(v1.profiles))
    expect(file.profiles[id]).toEqual({
      ...profile,
      spatial: emptySpatial(),
      switchEnrollments: {},
    });
});

test("v2 spatial preferences round-trip, keeping unresolved references", async () => {
  const { storage, values } = memory();
  const preferences = new PreferencesStorage(storage);
  const profile = { ...emptyPreferences(), spatial: spatial() };
  await preferences.saveProfile("demo", profile);
  expect(JSON.parse(values.get("prefs")!).schemaVersion).toBe(3);
  const { file, notice } = await new PreferencesStorage(storage).load();
  expect(notice).toBeUndefined();
  expect(file.profiles.demo).toEqual(profile);
});

test("only known preference fields are persisted", async () => {
  const { storage, values } = memory();
  const profile = {
    ...emptyPreferences(),
    status: { kind: "ready" },
    token: "secret-token",
  } as ReturnType<typeof emptyPreferences>;
  await new PreferencesStorage(storage).saveProfile("demo", profile);
  expect(values.get("prefs")).not.toContain("secret-token");
  expect(values.get("prefs")).not.toContain("status");
});

test.each([
  ["a non-finite placement", { position: { x: "1", z: 0 } }],
  ["a missing floor ID", { floorId: "" }],
  ["a numeric room ID", { roomId: 3 }],
])("malformed v2 spatial data (%s) is backed up", async (_, override) => {
  const data = spatial();
  Object.assign(data.placements["device:lamp"], override);
  const raw = JSON.stringify({
    schemaVersion: 2,
    profiles: { demo: { ...emptyPreferences(), spatial: data } },
  });
  const { storage, values } = memory({ prefs: raw });
  const { file, notice } = await new PreferencesStorage(storage).load();
  expect(file).toEqual({ schemaVersion: 3, profiles: {} });
  expect(notice).toBeTruthy();
  expect(backups(values).map((key) => values.get(key))).toEqual([raw]);
});

test("an invalid stored plan, area link or v1 profile is not migrated as valid", async () => {
  const badPlan = { ...spatial(), plan: { ...spatial().plan, floors: [] } };
  const badLink = { ...spatial(), areaLinks: { room: 4 } };
  for (const raw of [
    {
      schemaVersion: 2,
      profiles: { demo: { ...emptyPreferences(), spatial: badPlan } },
    },
    {
      schemaVersion: 2,
      profiles: { demo: { ...emptyPreferences(), spatial: badLink } },
    },
    { schemaVersion: 2, profiles: { demo: v1Profile("a") } }, // v2 without spatial
    {
      schemaVersion: 1,
      profiles: { demo: { ...v1Profile("a"), favorites: [1] } },
    },
  ]) {
    const { storage } = memory({ prefs: JSON.stringify(raw) });
    const { file, notice } = await new PreferencesStorage(storage).load();
    expect(file.profiles).toEqual({});
    expect(notice).toBeTruthy();
  }
});

test("an unknown future version is backed up instead of being overwritten silently", async () => {
  const raw = JSON.stringify({ schemaVersion: 4, profiles: { demo: {} } });
  const { storage, values } = memory({ prefs: raw });
  const { file, notice } = await new PreferencesStorage(storage).load();
  expect(file).toEqual({ schemaVersion: 3, profiles: {} });
  expect(notice).toMatch(/newer version/i);
  expect(backups(values).map((key) => values.get(key))).toEqual([raw]);
});

test("queued writes from several profiles all persist as v3", async () => {
  const { storage, values } = memory({
    prefs: JSON.stringify({
      schemaVersion: 1,
      profiles: { demo: v1Profile("d") },
    }),
  });
  const preferences = new PreferencesStorage(storage);
  const a = { ...emptyPreferences(), favorites: ["a"] };
  const b = { ...emptyPreferences(), spatial: spatial() };
  await Promise.all([
    preferences.saveProfile("ha:a", a),
    preferences.saveProfile("ha:b", b),
  ]);
  const stored = JSON.parse(values.get("prefs")!);
  expect(stored.schemaVersion).toBe(3);
  expect(stored.profiles["ha:a"]).toEqual(a);
  expect(stored.profiles["ha:b"]).toEqual(b);
  expect(stored.profiles.demo.favorites).toEqual(["d"]);
});

test("placements follow aliases; the canonical entry wins and missing entities keep theirs", () => {
  const placement = (x: number) => ({
    floorId: "f",
    roomId: null,
    position: { x, z: 0 },
  });
  const prefs = {
    ...emptyPreferences(),
    spatial: {
      ...emptySpatial(),
      placements: {
        "entity:light.old": placement(1),
        stable: placement(2),
        "entity:switch.renamed": placement(3),
        "device:gone": placement(4),
      },
    },
  };
  const migrated = reconcilePreferences(prefs, {
    ...emptyIdentity(),
    aliases: {
      "entity:light.old": "stable",
      "entity:switch.renamed": "device:plug",
    },
  });
  expect(migrated.spatial.placements).toEqual({
    stable: placement(2),
    "device:plug": placement(3),
    "device:gone": placement(4),
  });
});

test("unknown fields nested inside a stored plan are never persisted", async () => {
  const { storage, values } = memory();
  const plan = structuredClone(parseHousePlan(sample)!) as Record<string, any>;
  plan.runtime = { token: "secret-token" };
  plan.floors[0].extra = "secret-floor";
  plan.floors[0].rooms[0].label.observed = "secret-point";
  plan.floors[0].lines.push({
    from: { x: 0, z: 0 },
    to: { x: 1, z: 0 },
    kind: "wall",
    state: "secret-line",
  });
  const profile = {
    ...emptyPreferences(),
    spatial: { ...emptySpatial(), plan: plan as never },
  };
  await new PreferencesStorage(storage).saveProfile("demo", profile);
  const raw = values.get("prefs")!;
  expect(raw).not.toMatch(/secret|runtime/);
  const expected = structuredClone(parseHousePlan(sample)!);
  expected.floors[0]!.lines.push({
    from: { x: 0, z: 0 },
    to: { x: 1, z: 0 },
    kind: "wall",
  });
  expect(
    (await new PreferencesStorage(storage).load()).file.profiles.demo!.spatial
      .plan,
  ).toEqual(expected);
});
test("v2 migration never inherits an undeclared power permission", async () => {
  const profile = {
    ...emptyPreferences(),
    favorites: ["lamp"],
    spatial: spatial(),
    switchEnrollments: { lamp: { arbitrary: true } },
  };
  const { storage } = memory({
    prefs: JSON.stringify({ schemaVersion: 2, profiles: { home: profile } }),
  });
  const loaded = await new PreferencesStorage(storage).load();
  expect(loaded.notice).toBeUndefined();
  expect(loaded.file.profiles.home!.switchEnrollments).toEqual({});
  expect(loaded.file.profiles.home!.favorites).toEqual(["lamp"]);
  expect(loaded.file.profiles.home!.spatial).toEqual(profile.spatial);
});
test("v3 validates and allowlists exact power permissions without alias promotion", async () => {
  const grant = {
    profileId: "home",
    entityKey: "lamp",
    deviceId: "plug",
    platform: "tplink" as const,
    manufacturer: "TP-Link" as const,
    model: "HS103",
    capability: "switch" as const,
    token: "must-not-persist",
  };
  const profile = { ...emptyPreferences(), switchEnrollments: { lamp: grant } };
  const { storage, values } = memory();
  const store = new PreferencesStorage(storage);
  await store.saveProfile("home", profile);
  expect(values.get("prefs")).not.toContain("must-not-persist");
  const loaded = (await store.load()).file.profiles.home!;
  const reconciled = reconcilePreferences(loaded, {
    ...emptyIdentity(),
    aliases: { lamp: "new-uuid" },
  });
  expect(reconciled.switchEnrollments).toEqual(loaded.switchEnrollments);
  for (const field of [
    "entityKey",
    "deviceId",
    "platform",
    "model",
    "capability",
  ]) {
    const bad = {
      ...profile,
      switchEnrollments: { lamp: { ...grant, [field]: "invalid" } },
    };
    if (field === "deviceId") bad.switchEnrollments.lamp.deviceId = "";
    await expect(store.saveProfile("home", bad)).rejects.toThrow(
      /invalid preferences/,
    );
  }
});
