import { HomeAssistantBackend } from "../homeAssistant/HomeAssistantBackend";
import { DemoBackend } from "../demo/DemoBackend";
import { SessionManager } from "../SessionManager";
import { BackendEvents } from "../types";
import { Credentials } from "../../services/credentials";
import { PreferencesStorage } from "../../preferences/storage";
import { useCockpit } from "../../core/store";
import type { ConnectionSettings, SessionError } from "../../core/types";
import { profileIdFor } from "../homeAssistant/url";
import sample from "../../spatial/sample-plan.json";
import { parseHousePlan, type HousePlan } from "../../spatial/model";
import { emptyIdentity, emptyPreferences } from "../../preferences/types";

jest.mock("../homeAssistant/HomeAssistantBackend", () => ({
  HomeAssistantBackend: jest.fn(),
}));
jest.mock("../demo/DemoBackend", () => ({ DemoBackend: jest.fn() }));
const mockSampleHouse = parseHousePlan(sample)!;
let mockHaDefault: HousePlan;
jest.mock("../../spatial/plans", () => ({
  houseForMode: (mode: string) =>
    mode === "demo" ? mockSampleHouse : mockHaDefault,
}));
class MemoryStorage {
  values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}
class ControlledBackend extends BackendEvents {
  constructor(private failure?: SessionError) {
    super();
  }
  async start() {
    if (this.failure) {
      this.emitStatus({ kind: "error", error: this.failure, retrying: false });
      throw this.failure;
    }
    this.ready();
  }
  ready() {
    this.emitStatus({ kind: "ready", haVersion: "2026.10.1", readySince: "" });
  }
  snapshot() {
    this.emitSnapshot({
      sessionId: "s",
      syncEpoch: 1,
      receivedAt: "",
      entities: {},
      devices: {},
      areas: {},
      registryEntries: [],
      config: { temperatureUnit: "°C", haVersion: "2026.10.1" },
      identities: emptyIdentity(),
      metadata: {
        entities: { kind: "fresh", loadedAt: "" },
        devices: { kind: "fresh", loadedAt: "" },
        areas: { kind: "fresh", loadedAt: "" },
      },
    });
  }
  stop() {}
  async resync() {}
  ping = jest.fn(async () => false);
  recover = jest.fn();
  async setForeground() {}
}
const a: ConnectionSettings = {
  url: "https://a.example",
  token: "token-a",
  allowInsecureHttp: false,
};
const b: ConnectionSettings = {
  url: "https://b.example",
  token: "token-b",
  allowInsecureHttp: false,
};
let manager: SessionManager;
function setup(failures: (SessionError | undefined)[] = []) {
  const credentials = new Credentials(
    new MemoryStorage(),
    new MemoryStorage(),
    (() => {
      let n = 0;
      return () => `id${++n}`;
    })(),
  );
  const prefStore = new MemoryStorage();
  const preferences = new PreferencesStorage(prefStore);
  const backends: ControlledBackend[] = [];
  jest.mocked(HomeAssistantBackend).mockImplementation(() => {
    const backend = new ControlledBackend(failures.shift());
    backends.push(backend);
    return backend as unknown as HomeAssistantBackend;
  });
  jest
    .mocked(DemoBackend)
    .mockImplementation(
      () => new ControlledBackend() as unknown as DemoBackend,
    );
  manager = new SessionManager(credentials, preferences);
  return { credentials, preferences, prefStore, backends };
}
beforeEach(() => {
  jest.resetAllMocks();
  mockHaDefault = { ...structuredClone(mockSampleHouse), id: "personal-home" };
  useCockpit.setState(useCockpit.getInitialState(), true);
});
afterEach(() => manager?.disconnect());

test.each<SessionError>([
  { code: "auth_invalid" },
  { code: "ha_version_unsupported", haVersion: "2025.1" },
])(
  "foreground preserves terminal errors and recovery actions: %j",
  async (error) => {
    setup([error]);
    await expect(manager.connect(a)).rejects.toEqual(error);
    const before = useCockpit.getState().status;
    await manager.setForeground(false);
    await manager.setForeground(true);
    expect(useCockpit.getState().status).toEqual(before);
  },
);
test("Forget removes saved A after an unsuccessful attempt to connect to B", async () => {
  const { credentials } = setup([undefined, { code: "auth_invalid" }]);
  await manager.connect(a);
  await expect(manager.connect(b)).rejects.toMatchObject({
    code: "auth_invalid",
  });
  await manager.forget();
  expect(await credentials.load()).toBeNull();
});
test("Retry targets the requested HA when preferences failed before backend construction", async () => {
  const { preferences } = setup();
  jest
    .spyOn(preferences, "load")
    .mockRejectedValueOnce(new Error("disk failure"));
  await expect(manager.connect(b)).rejects.toThrow("disk failure");
  await manager.retry();
  expect(HomeAssistantBackend).toHaveBeenCalledWith(
    b,
    expect.any(String),
    expect.any(Object),
  );
  expect(DemoBackend).not.toHaveBeenCalled();
});
test("a saved connection recovering after failed start is persisted without a misleading storage notice", async () => {
  const { credentials, backends } = setup([
    { code: "unreachable", likelyCauses: ["not_on_network"] },
  ]);
  await credentials.save(a);
  await manager.bootstrap();
  expect(useCockpit.getState().notices).toEqual([]);
  backends[0]!.ready();
  expect(await credentials.load()).toEqual(a);
  expect(useCockpit.getState().status.kind).toBe("ready");
});
test("a newly requested connection recovering after failed start saves the new credentials", async () => {
  const { credentials, backends } = setup([
    { code: "unreachable", likelyCauses: ["not_on_network"] },
  ]);
  await expect(manager.connect(b)).rejects.toMatchObject({
    code: "unreachable",
  });
  expect(await credentials.load()).toBeNull();
  backends[0]!.ready();
  expect(await credentials.load()).toEqual(b);
});
test("Retry never chooses demo without an explicit demo attempt", async () => {
  setup();
  await manager.retry();
  expect(DemoBackend).not.toHaveBeenCalled();
  expect(HomeAssistantBackend).not.toHaveBeenCalled();
});

test("existing v1 preferences migrate on connect and spatial data stays per profile", async () => {
  const { prefStore } = setup();
  const v1 = (favorite: string) => ({
    favorites: [favorite],
    visibility: {},
    roomOverrides: {},
    cameraEventOverrides: {},
    identities: { schemaVersion: 1, entityKeys: {}, aliases: {} },
  });
  prefStore.values.set(
    "prefs",
    JSON.stringify({
      schemaVersion: 1,
      profiles: { [profileIdFor(a.url)]: v1("lock-a"), demo: v1("demo-fan") },
    }),
  );
  await manager.connect(a);
  expect(useCockpit.getState().preferences.favorites).toEqual(["lock-a"]);
  expect(useCockpit.getState().preferences.spatial.placements).toEqual({});
  manager.updatePreferences((p) => ({
    ...p,
    spatial: {
      ...p.spatial,
      placements: {
        "device:lamp": {
          floorId: "floor-1",
          roomId: "floor-1-living",
          position: { x: 7, z: 3 },
        },
      },
    },
  }));
  await manager.connect({ demo: true });
  expect(useCockpit.getState().preferences.favorites).toEqual(["demo-fan"]);
  expect(useCockpit.getState().preferences.spatial.placements).toEqual({});
  const stored = JSON.parse(prefStore.values.get("prefs")!);
  expect(stored.schemaVersion).toBe(2);
  expect(
    Object.keys(stored.profiles[profileIdFor(a.url)].spatial.placements),
  ).toEqual(["device:lamp"]);
  expect(stored.profiles.demo.favorites).toEqual(["demo-fan"]);
});

const stored = (store: MemoryStorage) =>
  JSON.parse(store.values.get("prefs") ?? '{"profiles":{}}').profiles;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("demo is seeded from the public sample and saved with the first snapshot", async () => {
  const { prefStore } = setup();
  await manager.connect({ demo: true });
  expect(useCockpit.getState().preferences.spatial.plan?.id).toBe(
    "sample-home",
  );
  expect(stored(prefStore).demo).toBeUndefined();
  const backend = jest.mocked(DemoBackend).mock.results[0]!
    .value as ControlledBackend;
  backend.snapshot();
  await flush();
  expect(stored(prefStore).demo.spatial.seededFrom).toEqual({
    planId: "sample-home",
    revision: 1,
  });
});

test("a failed attempt does not create a profile; each HA origin gets its own plan data", async () => {
  const { prefStore, backends } = setup([undefined, { code: "auth_invalid" }]);
  await manager.connect(a);
  backends[0]!.snapshot();
  manager.updatePreferences((p) => ({
    ...p,
    spatial: {
      ...p.spatial,
      placements: {
        lamp: { floorId: "f", roomId: null, position: { x: 1, z: 1 } },
      },
    },
  }));
  await expect(manager.connect(b)).rejects.toMatchObject({
    code: "auth_invalid",
  });
  expect(useCockpit.getState().preferences.spatial.placements).toEqual({});
  await flush();
  const profiles = stored(prefStore);
  expect(profiles[profileIdFor(b.url)]).toBeUndefined();
  expect(profiles[profileIdFor(a.url)].spatial.plan.id).toBe("personal-home");
  expect(Object.keys(profiles[profileIdFor(a.url)].spatial.placements)).toEqual(
    ["lamp"],
  );
});

test("a new bundled revision keeps the saved plan and is reported", async () => {
  const { prefStore, backends } = setup();
  const saved = { ...structuredClone(mockHaDefault), name: "Edited home" };
  prefStore.values.set(
    "prefs",
    JSON.stringify({
      schemaVersion: 2,
      profiles: {
        [profileIdFor(a.url)]: {
          ...emptyPreferences(),
          spatial: {
            plan: saved,
            seededFrom: { planId: "personal-home", revision: 1 },
            areaLinks: {},
            placements: {},
          },
        },
      },
    }),
  );
  mockHaDefault = { ...mockHaDefault, revision: 2, name: "New default" };
  await manager.connect(a);
  backends[0]!.snapshot();
  await flush();
  expect(useCockpit.getState().preferences.spatial.plan?.name).toBe(
    "Edited home",
  );
  expect(stored(prefStore)[profileIdFor(a.url)].spatial.plan.name).toBe(
    "Edited home",
  );
});

test("reset replaces only the plan, links and placements", async () => {
  const { prefStore, backends } = setup();
  await manager.connect(a);
  backends[0]!.snapshot();
  manager.updatePreferences((p) => ({
    ...p,
    favorites: ["lock"],
    roomOverrides: { lock: "hall" },
    spatial: {
      ...p.spatial,
      plan: { ...p.spatial.plan!, name: "Edited" },
      areaLinks: { room: "area" },
      placements: {
        lamp: { floorId: "f", roomId: null, position: { x: 1, z: 1 } },
      },
    },
  }));
  mockHaDefault = { ...mockHaDefault, revision: 4 };
  manager.resetSpatial();
  await flush();
  const profile = stored(prefStore)[profileIdFor(a.url)];
  expect(profile.favorites).toEqual(["lock"]);
  expect(profile.roomOverrides).toEqual({ lock: "hall" });
  expect(profile.spatial).toEqual({
    plan: mockHaDefault,
    seededFrom: { planId: "personal-home", revision: 4 },
    areaLinks: {},
    placements: {},
  });
});

test("reset and preference edits are refused until the active profile's preferences are loaded", async () => {
  const { prefStore, preferences } = setup();
  const saved = {
    ...emptyPreferences(),
    favorites: ["lock"],
    visibility: { lock: "hidden" },
  };
  prefStore.values.set(
    "prefs",
    JSON.stringify({
      schemaVersion: 2,
      profiles: { [profileIdFor(a.url)]: saved },
    }),
  );
  jest
    .spyOn(preferences, "load")
    .mockRejectedValueOnce(new Error("disk failure"));
  await expect(manager.connect(a)).rejects.toThrow("disk failure");
  expect(useCockpit.getState().preferencesLoadedFor).toBeNull();
  manager.resetSpatial();
  manager.updatePreferences((p) => ({ ...p, favorites: [] }));
  await flush();
  expect(stored(prefStore)[profileIdFor(a.url)].favorites).toEqual(["lock"]);
  expect(stored(prefStore)[profileIdFor(a.url)].visibility).toEqual({
    lock: "hidden",
  });
});

test("a failed first plan save is retried on the next snapshot", async () => {
  const { prefStore, preferences, backends } = setup();
  const save = jest
    .spyOn(preferences, "saveProfile")
    .mockRejectedValueOnce(new Error("disk full"));
  await manager.connect(a);
  backends[0]!.snapshot();
  await flush();
  expect(stored(prefStore)[profileIdFor(a.url)]).toBeUndefined();
  backends[0]!.snapshot();
  await flush();
  expect(save).toHaveBeenCalledTimes(2);
  expect(stored(prefStore)[profileIdFor(a.url)].spatial.plan.id).toBe(
    "personal-home",
  );
  backends[0]!.snapshot();
  await flush();
  expect(save).toHaveBeenCalledTimes(2);
});
