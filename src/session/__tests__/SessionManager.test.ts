import { HomeAssistantBackend } from "../homeAssistant/HomeAssistantBackend";
import { DemoBackend } from "../demo/DemoBackend";
import { SessionManager } from "../SessionManager";
import { BackendEvents } from "../types";
import { Credentials } from "../../services/credentials";
import { PreferencesStorage } from "../../preferences/storage";
import { useCockpit } from "../../core/store";
import type {
  ConnectionSettings,
  HomeSnapshot,
  SessionError,
  SessionStatus,
} from "../../core/types";
import type { ServiceCall, ServiceCallResult } from "../types";
import {
  climate,
  config,
  entity,
  fan,
  lock,
  snapshot,
} from "../../commands/__tests__/fixtures";
import type {
  CommandTarget,
  CommandResult,
  DeferredResult,
} from "../../commands/types";
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
  snapshot(value?: HomeSnapshot) {
    if (value) {
      this.emitSnapshot(value);
      return;
    }
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
  changeStatus(value: SessionStatus) {
    this.emitStatus(value);
  }
  callService = jest.fn<Promise<ServiceCallResult>, [ServiceCall]>(
    async () => ({ kind: "accepted" }),
  );
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

test("room links persist across an app restart", async () => {
  const { credentials, preferences, backends } = setup();
  await manager.connect(a);
  backends[0]!.snapshot();
  expect(
    manager.updatePreferences((p) => ({
      ...p,
      spatial: { ...p.spatial, areaLinks: { "sample-1-0": "salon" } },
    })),
  ).toBe(true);
  await flush();
  manager.disconnect();
  useCockpit.setState(useCockpit.getInitialState(), true);
  manager = new SessionManager(credentials, preferences);
  await manager.connect(a);
  expect(useCockpit.getState().preferences.spatial.areaLinks).toEqual({
    "sample-1-0": "salon",
  });
});

test("metric placements survive restart, reposition and removal without changing other preferences", async () => {
  const { credentials, preferences, backends } = setup();
  await manager.connect(a);
  backends[0]!.snapshot();
  const placement = {
    floorId: "fixture-floor",
    roomId: null,
    position: { x: 1.25, z: 2.5 },
  };
  manager.updatePreferences((p) => ({
    ...p,
    favorites: ["stable"],
    spatial: { ...p.spatial, placements: { stable: placement } },
  }));
  await flush();
  manager.disconnect();
  useCockpit.setState(useCockpit.getInitialState(), true);
  manager = new SessionManager(credentials, preferences);
  await manager.connect(a);
  expect(useCockpit.getState().preferences.spatial.placements.stable).toEqual(
    placement,
  );
  const moved = { ...placement, position: { x: 3.5, z: 4 } };
  manager.updatePreferences((p) => ({
    ...p,
    spatial: { ...p.spatial, placements: { stable: moved } },
  }));
  await flush();
  expect(
    (await preferences.load()).file.profiles[profileIdFor(a.url)]?.spatial
      .placements.stable,
  ).toEqual(moved);
  manager.updatePreferences((p) => ({
    ...p,
    spatial: { ...p.spatial, placements: {} },
  }));
  await flush();
  const saved = (await preferences.load()).file.profiles[profileIdFor(a.url)]!;
  expect(saved.spatial.placements).toEqual({});
  expect(saved.favorites).toEqual(["stable"]);
});

function capture(key = "stable-lamp") {
  const result = manager.commands.capture(key);
  if (result.kind !== "captured") throw new Error(result.reason);
  return result.target;
}
async function connected() {
  const setupResult = setup();
  await manager.connect(a);
  const backend = setupResult.backends[0]!;
  backend.snapshot(snapshot());
  return { ...setupResult, backend };
}
test("semantic facade dispatches synchronously, returns acknowledgement separately and never changes observed state", async () => {
  const { backend } = await connected();
  const result = manager.commands.setSwitch("stable-lamp", true);
  expect(backend.callService).toHaveBeenCalledWith({
    domain: "switch",
    service: "turn_on",
    entityId: "switch.lamp",
  });
  expect(result.kind).toBe("started");
  if (result.kind === "started")
    await expect(result.result).resolves.toEqual({ kind: "accepted" });
  expect(useCockpit.getState().snapshot?.entities["switch.lamp"]?.state).toBe(
    "off",
  );
  expect(Object.keys(manager.commands)).toEqual([
    "capture",
    "setLockState",
    "setClimateTarget",
    "setHvacMode",
    "setFanOn",
    "setFanPercentage",
    "setFanPreset",
    "setSwitch",
  ]);
});
test("an already-satisfied request sends no backend call", async () => {
  const { backend } = await connected();
  expect(manager.commands.setSwitch("stable-lamp", false)).toEqual({
    kind: "no-op",
    message: "Already off.",
  });
  expect(backend.callService).not.toHaveBeenCalled();
  expect(manager.commandStore.getState().records).toEqual([]);
});
test.each<SessionStatus>([
  { kind: "idle" },
  { kind: "connecting" },
  { kind: "authenticating" },
  { kind: "synchronizing" },
  { kind: "reconnecting", lastReadyAt: null },
  { kind: "error", error: { code: "auth_invalid" }, retrying: false },
])("a delayed action rechecks non-ready status %j", async (status) => {
  const { backend } = await connected();
  const target = capture();
  backend.changeStatus(status);
  expect(manager.commands.setSwitch(target, true)).toMatchObject({
    kind: "refused",
    reason: "not_ready",
  });
  expect(backend.callService).not.toHaveBeenCalled();
});
test("foreground status and capability are rechecked after a dialog", async () => {
  const { backend } = await connected();
  backend.snapshot(snapshot([fan()]));
  const target = capture("vent");
  await manager.setForeground(false);
  expect(manager.commands.setFanOn(target, true)).toMatchObject({
    kind: "refused",
    reason: "background",
  });
  await manager.setForeground(true);
  backend.ready();
  backend.snapshot(snapshot([fan({ supported_features: 8 })]));
  expect(manager.commands.setFanOn(target, true)).toMatchObject({
    kind: "refused",
    reason: "session_changed",
  });
  expect(manager.commands.setFanOn("vent", true)).toMatchObject({
    kind: "refused",
    reason: "unsupported",
  });
  expect(backend.callService).not.toHaveBeenCalled();
});
test.each([
  "unavailable",
  "unknown",
  "disabled",
  "removed",
  "renamed",
  "recreated",
])("a delayed action rechecks the entity after it is %s", async (change) => {
  const { backend } = await connected();
  const target = capture();
  backend.snapshot(
    snapshot(
      change === "removed"
        ? []
        : [
            entity({
              ...(change === "unavailable" || change === "unknown"
                ? { state: change }
                : {}),
              ...(change === "disabled" ? { disabledInHA: true } : {}),
              ...(change === "renamed" ? { entityId: "switch.renamed" } : {}),
              ...(change === "recreated" ? { key: "different-uuid" } : {}),
            }),
          ],
    ),
  );
  expect(manager.commands.setSwitch(target, true).kind).toBe("refused");
  expect(backend.callService).not.toHaveBeenCalled();
});
test("the latest observation can turn a delayed action into a no-op", async () => {
  const { backend } = await connected();
  const target = capture();
  backend.snapshot(snapshot([entity({ state: "on" })]));
  expect(manager.commands.setSwitch(target, true).kind).toBe("no-op");
  expect(backend.callService).not.toHaveBeenCalled();
});
test.each([a, b])(
  "a new backend, even for the same profile, invalidates a captured action: $url",
  async (settings) => {
    const { backends, backend } = await connected();
    const target = capture();
    await manager.connect(settings);
    backends[1]!.snapshot(snapshot());
    expect(manager.commands.setSwitch(target, true)).toMatchObject({
      kind: "refused",
      reason: "session_changed",
    });
    expect(backend.callService).not.toHaveBeenCalled();
    expect(backends[1]!.callService).not.toHaveBeenCalled();
  },
);
test("cached observations after disconnect cannot send commands or create targets", async () => {
  const { backend } = await connected();
  const target = capture();
  manager.disconnect();
  expect(manager.commands.setSwitch(target, true).kind).toBe("refused");
  expect(manager.commands.capture("stable-lamp")).toMatchObject({
    kind: "refused",
    reason: "not_ready",
  });
  expect(backend.callService).not.toHaveBeenCalled();
});
test("a copied or foreign target cannot authorize another entity", async () => {
  const { backend } = await connected();
  const target = capture();
  expect(Object.isFrozen(target)).toBe(true);
  expect(
    manager.commands.setSwitch({ ...target, entityId: "switch.other" }, true)
      .kind,
  ).toBe("refused");
  expect(manager.commands.setSwitch({ ...target }, true).kind).toBe("refused");
  expect(
    manager.commands.setSwitch(null as unknown as CommandTarget, true).kind,
  ).toBe("refused");
  expect(backend.callService).not.toHaveBeenCalled();
});
test("identity aliases may promote a stable key only while the entity ID remains the same", async () => {
  const { backend } = await connected();
  const target = capture();
  const promoted = snapshot([entity({ key: "registry-uuid" })]);
  promoted.identities.aliases["stable-lamp"] = "registry-uuid";
  backend.snapshot(promoted);
  const first = manager.commands.setSwitch(target, true);
  expect(first.kind).toBe("started");
  expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
    kind: "refused",
    reason: "in_flight",
  });
  if (first.kind !== "started") throw new Error("Expected dispatch");
  await first.result;
  expect(manager.commands.setSwitch("stable-lamp", true).kind).toBe("started");
  expect(backend.callService).toHaveBeenCalledTimes(2);
});
test("ambiguous stable identities fail closed", async () => {
  const { backend } = await connected();
  const target = capture();
  backend.snapshot(
    snapshot([entity(), entity({ entityId: "switch.duplicate" })]),
  );
  expect(manager.commands.setSwitch(target, true)).toMatchObject({
    kind: "refused",
    reason: "entity_changed",
  });
  expect(manager.commands.capture("stable-lamp").kind).toBe("refused");
  expect(backend.callService).not.toHaveBeenCalled();
});
test("obsolete acknowledgements are scoped to the old backend and never update the store", async () => {
  const { backend, backends } = await connected();
  let resolve!: (value: ServiceCallResult) => void;
  backend.callService.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const result = manager.commands.setSwitch("stable-lamp", true);
  await manager.connect(b);
  backends[1]!.snapshot(snapshot());
  const state = useCockpit.getState();
  resolve({ kind: "accepted" });
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await expect(result.result).resolves.toEqual({
    kind: "unknown",
    reason: "connection_lost",
  });
  expect(useCockpit.getState()).toBe(state);
  expect(backends[1]!.callService).not.toHaveBeenCalled();
});
test("transient lock codes are sent once and are absent from facade results, preferences, notices and observed state", async () => {
  const { backend, prefStore } = await connected();
  backend.snapshot(snapshot([lock()]));
  const result = manager.commands.setLockState("door", "unlocked", "0017");
  expect(backend.callService).toHaveBeenCalledWith({
    domain: "lock",
    service: "unlock",
    entityId: "lock.door",
    data: { code: "0017" },
  });
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await result.result;
  await flush();
  expect(
    JSON.stringify({
      result,
      state: useCockpit.getState(),
      persisted: [...prefStore.values],
    }),
  ).not.toContain("0017");
});
test("unexpected backend exceptions are sanitized without retrying", async () => {
  const { backend } = await connected();
  backend.callService.mockRejectedValue(new Error("sensitive payload"));
  const result = manager.commands.setSwitch("stable-lamp", true);
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await expect(result.result).resolves.toEqual({
    kind: "unknown",
    reason: "connection_lost",
  });
  expect(backend.callService).toHaveBeenCalledTimes(1);
  expect(useCockpit.getState().notices).toEqual([]);
});

test("C02 registers sending before a synchronous backend observation and retains it before acknowledgement", async () => {
  const { backend } = await connected();
  let resolve!: (value: ServiceCallResult) => void;
  backend.callService.mockImplementation(() => {
    expect(manager.commandStore.getState().records.at(-1)?.status).toBe(
      "sending",
    );
    backend.snapshot(snapshot([entity({ state: "on" })]));
    return new Promise((done) => {
      resolve = done;
    });
  });
  const result = manager.commands.setSwitch("stable-lamp", true);
  if (result.kind !== "started") throw new Error("Expected dispatch");
  expect(manager.commandStore.getState().records.at(-1)).toMatchObject({
    id: result.commandId,
    status: "sending",
  });
  resolve({ kind: "accepted" });
  await result.result;
  expect(manager.commandStore.getState().records.at(-1)?.status).toBe(
    "confirmed",
  );
});
test("C02 observes outcomes before publishing the corresponding cockpit snapshot", async () => {
  const { backend } = await connected();
  const result = manager.commands.setSwitch("stable-lamp", true);
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await result.result;
  const observedStatuses: string[] = [];
  const unsubscribe = useCockpit.subscribe((state, before) => {
    if (
      state.snapshot !== before.snapshot &&
      state.snapshot?.entities["switch.lamp"]?.state === "on"
    )
      observedStatuses.push(
        manager.commandStore.getState().records.at(-1)!.status,
      );
  });
  try {
    backend.snapshot(snapshot([entity({ state: "on" })]));
  } finally {
    unsubscribe();
  }
  expect(observedStatuses).toEqual(["confirmed"]);
});
test("C02 preserves synchronization evidence and confirms only when the session becomes ready", async () => {
  const { backend } = await connected();
  const result = manager.commands.setSwitch("stable-lamp", true);
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await result.result;
  backend.changeStatus({ kind: "reconnecting", lastReadyAt: null });
  backend.changeStatus({ kind: "synchronizing" });
  backend.snapshot({ ...snapshot([entity({ state: "on" })]), syncEpoch: 2 });
  expect(manager.commandStore.getState().records.at(-1)?.status).toBe(
    "unconfirmed",
  );
  backend.ready();
  expect(manager.commandStore.getState().records.at(-1)).toMatchObject({
    status: "confirmed",
    confirmation: { kind: "reconciled" },
  });
});
test("C02 reconciles suspended deadlines before backend foreground work starts", async () => {
  jest.useFakeTimers();
  try {
    const { backend } = await connected();
    const result = manager.commands.setSwitch("stable-lamp", true);
    if (result.kind !== "started") throw new Error("Expected dispatch");
    await result.result;
    await manager.setForeground(false);
    jest.setSystemTime(Date.now() + 60_000);
    jest.spyOn(backend, "setForeground").mockImplementation(async () => {
      expect(manager.commandStore.getState().records.at(-1)?.status).toBe(
        "unconfirmed",
      );
    });
    await manager.setForeground(true);
    expect(
      manager.commandStore.getState().records.at(-1)?.unconfirmedReason,
    ).toBe("deadline");
  } finally {
    manager.disconnect();
    jest.useRealTimers();
  }
});
test("C02 same-origin Retry preserves late reconciliation, but ignores all callbacks from the replaced backend", async () => {
  const { backends, backend } = await connected();
  let resolve!: (value: ServiceCallResult) => void;
  backend.callService.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const result = manager.commands.setSwitch("stable-lamp", true);
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await manager.retry();
  const before = manager.commandStore.getState();
  backend.snapshot(snapshot([entity({ state: "on" })]));
  backend.ready();
  resolve({ kind: "accepted" });
  await result.result;
  expect(manager.commandStore.getState()).toBe(before);
  expect(before.records.at(-1)?.status).toBe("unconfirmed");
  backends[1]!.snapshot({
    ...snapshot([entity({ state: "on" })]),
    sessionId: "replacement",
  });
  expect(manager.commandStore.getState().records.at(-1)).toMatchObject({
    id: result.commandId,
    status: "confirmed",
    confirmation: { kind: "reconciled" },
  });
  expect(backends[1]!.callService).not.toHaveBeenCalled();
});
test("C02 exposes only transient outcomes, keeps codes out, and Forget clears the command scope", async () => {
  const { backend, prefStore } = await connected();
  backend.snapshot(snapshot([lock()]));
  const result = manager.commands.setLockState("door", "unlocked", "0017");
  if (result.kind !== "started") throw new Error("Expected dispatch");
  await result.result;
  expect(
    manager.commandStore.getState().records.at(-1)?.desired.intent,
  ).toEqual({ kind: "setLockState", state: "unlocked" });
  expect(JSON.stringify(manager.commandStore.getState())).not.toContain("0017");
  await flush();
  expect(JSON.stringify([...prefStore.values])).not.toMatch(
    /0017|baselineRevision|commandId|sending|accepted/,
  );
  await manager.forget();
  expect(manager.commandStore.getState()).toEqual({
    profileId: null,
    scopeId: null,
    records: [],
  });
});

function queued(result: CommandResult) {
  if (result.kind !== "queued")
    throw new Error(`Expected queued, got ${result.kind}`);
  return result;
}
function started(result: DeferredResult | CommandResult) {
  if (result.kind !== "started")
    throw new Error(`Expected started, got ${result.kind}`);
  return result;
}
function deferredService() {
  let resolve!: (result: ServiceCallResult) => void;
  const promise = new Promise<ServiceCallResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("C03 command policy", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  });
  afterEach(() => {
    manager.disconnect();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
  async function house() {
    const result = await connected();
    result.backend.snapshot(snapshot([entity(), fan(), climate(), lock()]));
    return result;
  }
  test("rapid targets send only the latest after 600 ms of quiet, without unsent command records", async () => {
    const { backend } = await house();
    const first = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 20 }),
    );
    await jest.advanceTimersByTimeAsync(400);
    const last = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 23.2 }),
    );
    await expect(first.completion).resolves.toEqual({
      kind: "cancelled",
      reason: "superseded",
    });
    await jest.advanceTimersByTimeAsync(599);
    expect(backend.callService).not.toHaveBeenCalled();
    expect(manager.commandStore.getState().records).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    const sent = started(await last.completion);
    await sent.result;
    expect(backend.callService.mock.calls).toEqual([
      [
        {
          domain: "climate",
          service: "set_temperature",
          entityId: "climate.home",
          data: { temperature: 23 },
        },
      ],
    ]);
    expect(manager.commandStore.getState().records).toHaveLength(1);
  });
  test("new continuous targets wait for the previous promise, suppress its outcome and keep only the latest intent", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const first = queued(manager.commands.setFanPercentage("vent", 30));
    await jest.advanceTimersByTimeAsync(600);
    const sentFirst = started(await first.completion);
    const middle = queued(manager.commands.setFanPercentage("vent", 50));
    const last = queued(manager.commands.setFanPercentage("vent", 80));
    expect(manager.commandStore.getState().records[0]?.status).toBe(
      "superseded",
    );
    backend.snapshot(
      snapshot([entity(), fan({ percentage: 30 }), climate(), lock()]),
    );
    await jest.advanceTimersByTimeAsync(30_000);
    expect(backend.callService).toHaveBeenCalledTimes(1);
    await expect(middle.completion).resolves.toEqual({
      kind: "cancelled",
      reason: "superseded",
    });
    pending.resolve({ kind: "accepted" });
    await sentFirst.result;
    const sentLast = started(await last.completion);
    await sentLast.result;
    expect(backend.callService).toHaveBeenCalledTimes(2);
    expect(backend.callService).toHaveBeenLastCalledWith({
      domain: "fan",
      service: "set_percentage",
      entityId: "fan.vent",
      data: { percentage: 80 },
    });
    expect(manager.commandStore.getState().records[0]?.status).toBe(
      "superseded",
    );
  });
  test("promise settlement before the debounce deadline does not send early, and other entities remain independent", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const one = queued(manager.commands.setFanPercentage("vent", 30));
    await jest.advanceTimersByTimeAsync(600);
    const first = started(await one.completion);
    const next = queued(manager.commands.setFanPercentage("vent", 70));
    const lamp = started(manager.commands.setSwitch("stable-lamp", true));
    await lamp.result;
    await jest.advanceTimersByTimeAsync(200);
    pending.resolve({ kind: "accepted" });
    await first.result;
    await jest.advanceTimersByTimeAsync(399);
    expect(backend.callService).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    await started(await next.completion).result;
    expect(backend.callService).toHaveBeenCalledTimes(3);
  });
  test("a latest target matching the baseline still corrects an earlier in-flight request", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const one = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 22 }),
    );
    await jest.advanceTimersByTimeAsync(600);
    const first = started(await one.completion);
    const last = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 18 }),
    );
    await jest.advanceTimersByTimeAsync(600);
    expect(backend.callService).toHaveBeenCalledTimes(1);
    pending.resolve({ kind: "accepted" });
    await first.result;
    await started(await last.completion).result;
    expect(backend.callService).toHaveBeenLastCalledWith({
      domain: "climate",
      service: "set_temperature",
      entityId: "climate.home",
      data: { temperature: 18 },
    });
  });
  test("an already-accepted target awaiting observation also requires a compensating latest baseline target", async () => {
    const { backend } = await house();
    const one = queued(manager.commands.setFanPercentage("vent", 30));
    await jest.advanceTimersByTimeAsync(600);
    await started(await one.completion).result;
    const last = queued(manager.commands.setFanPercentage("vent", 0));
    await jest.advanceTimersByTimeAsync(600);
    await started(await last.completion).result;
    expect(backend.callService).toHaveBeenCalledTimes(2);
    expect(backend.callService.mock.calls[1]?.[0].data).toEqual({
      percentage: 0,
    });
  });
  test("returning to an already-satisfied value cancels an older unsent target without sending either", async () => {
    const { backend } = await house();
    const old = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 22 }),
    );
    expect(
      manager.commands.setClimateTarget("thermostat", { temperature: 18 }).kind,
    ).toBe("no-op");
    await expect(old.completion).resolves.toMatchObject({
      kind: "cancelled",
      reason: "superseded",
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(backend.callService).not.toHaveBeenCalled();
  });
  test.each<SessionStatus>([
    { kind: "idle" },
    { kind: "connecting" },
    { kind: "authenticating" },
    { kind: "synchronizing" },
    { kind: "reconnecting", lastReadyAt: null },
    {
      kind: "error",
      error: { code: "sync_timeout", phase: "resync" },
      retrying: true,
    },
    { kind: "error", error: { code: "auth_invalid" }, retrying: false },
  ])(
    "leaving ready immediately drops unsent work and invalidates dialog targets: %j",
    async (status) => {
      const { backend } = await house();
      const target = capture("door");
      const value = queued(manager.commands.setFanPercentage("vent", 50));
      backend.changeStatus(status);
      await expect(value.completion).resolves.toEqual({
        kind: "cancelled",
        reason: "not_ready",
      });
      backend.ready();
      expect(manager.commands.setLockState(target, "unlocked")).toMatchObject({
        kind: "refused",
        reason: "session_changed",
      });
      await jest.advanceTimersByTimeAsync(2000);
      expect(backend.callService).not.toHaveBeenCalled();
    },
  );
  test("background cancels waiting-behind-call intents, preserves the call and never replays on foreground", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const first = queued(manager.commands.setFanPercentage("vent", 30));
    await jest.advanceTimersByTimeAsync(600);
    const sent = started(await first.completion);
    const next = queued(manager.commands.setFanPercentage("vent", 80));
    const target = capture("door");
    await manager.setForeground(false);
    await expect(next.completion).resolves.toEqual({
      kind: "cancelled",
      reason: "background",
    });
    pending.resolve({ kind: "accepted" });
    await sent.result;
    await manager.setForeground(true);
    backend.ready();
    expect(manager.commands.setLockState(target, "unlocked")).toMatchObject({
      kind: "refused",
      reason: "session_changed",
    });
    await jest.advanceTimersByTimeAsync(2000);
    expect(backend.callService).toHaveBeenCalledTimes(1);
  });
  test.each([a, b])(
    "replacement cancels old work and an old promise cannot release a newer lane: $url",
    async (settings) => {
      const { backend, backends } = await house();
      const oldPending = deferredService();
      backend.callService.mockReturnValueOnce(oldPending.promise);
      const oldValue = queued(manager.commands.setFanPercentage("vent", 30));
      await jest.advanceTimersByTimeAsync(600);
      const oldSent = started(await oldValue.completion);
      const dropped = queued(manager.commands.setFanPercentage("vent", 70));
      await manager.connect(settings);
      await expect(dropped.completion).resolves.toEqual({
        kind: "cancelled",
        reason: "session_changed",
      });
      const replacement = backends[1]!;
      replacement.snapshot(snapshot([entity(), fan(), climate(), lock()]));
      const freshPending = deferredService();
      replacement.callService.mockReturnValueOnce(freshPending.promise);
      const freshValue = queued(manager.commands.setFanPercentage("vent", 60));
      await jest.advanceTimersByTimeAsync(600);
      const freshSent = started(await freshValue.completion);
      oldPending.resolve({ kind: "accepted" });
      await oldSent.result;
      expect(manager.commands.setFanOn("vent", true)).toMatchObject({
        kind: "refused",
        reason: "in_flight",
      });
      expect(replacement.callService).toHaveBeenCalledTimes(1);
      freshPending.resolve({ kind: "accepted" });
      await freshSent.result;
      expect(backend.callService).toHaveBeenCalledTimes(1);
    },
  );
  test.each([
    "unavailable",
    "missing",
    "renamed",
    "recreated",
    "unsupported",
    "unit",
    "limits",
  ])("debounced dispatch revalidates changed %s", async (change) => {
    const { backend } = await house();
    const value = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 22 }),
    );
    const e = climate({
      ...(change === "unsupported" ? { supported_features: 0 } : {}),
      ...(change === "limits" ? { max_temp: 20 } : {}),
    });
    if (change === "unavailable") e.state = "unavailable";
    if (change === "renamed") e.entityId = "climate.renamed";
    if (change === "recreated") e.key = "new-uuid";
    const changed = snapshot(change === "missing" ? [] : [e]);
    if (change === "unit")
      changed.config = { ...config, temperatureUnit: "°F" };
    backend.snapshot(changed);
    await jest.advanceTimersByTimeAsync(600);
    await expect(value.completion).resolves.toMatchObject({ kind: "refused" });
    expect(backend.callService).not.toHaveBeenCalled();
  });
  test("pending data is copied and original values are quantized only against dispatch-time limits", async () => {
    const { backend } = await house();
    const target = { temperature: 20.26 };
    const value = queued(
      manager.commands.setClimateTarget("thermostat", target),
    );
    target.temperature = 30;
    backend.snapshot(snapshot([climate({ target_temp_step: 1 })]));
    await jest.advanceTimersByTimeAsync(600);
    await started(await value.completion).result;
    expect(backend.callService).toHaveBeenLastCalledWith({
      domain: "climate",
      service: "set_temperature",
      entityId: "climate.home",
      data: { temperature: 20 },
    });
  });
  test("locks block while sending or accepted, including a request that would otherwise be a no-op", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const first = started(
      manager.commands.setLockState("door", "unlocked", "0017"),
    );
    expect(manager.commands.setLockState("door", "locked")).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    pending.resolve({ kind: "accepted" });
    await first.result;
    expect(manager.commands.setLockState("door", "locked")).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    backend.snapshot(snapshot([{ ...lock(), state: "unlocked" }]));
    await started(manager.commands.setLockState("door", "locked")).result;
    expect(backend.callService).toHaveBeenCalledTimes(2);
  });
  test.each(["deadline", "timeout", "connection_lost"] as const)(
    "unconfirmed lock %s needs fresh observation even when dismissed",
    async (reason) => {
      const { backend } = await house();
      if (reason !== "deadline")
        backend.callService.mockResolvedValueOnce({ kind: "unknown", reason });
      const first = started(manager.commands.setLockState("door", "unlocked"));
      await first.result;
      if (reason === "deadline") await jest.advanceTimersByTimeAsync(45_000);
      manager.dismissCommand(first.commandId);
      expect(manager.commands.setLockState("door", "locked")).toMatchObject({
        kind: "refused",
        reason: "fresh_observation_required",
      });
      expect(manager.commands.setLockState("door", "unlocked")).toMatchObject({
        kind: "refused",
        reason: "fresh_observation_required",
      });
      backend.snapshot({ ...snapshot([lock()]), syncEpoch: 2 });
      await started(manager.commands.setLockState("door", "unlocked")).result;
      expect(backend.callService).toHaveBeenCalledTimes(2);
    },
  );
  test("confirmation before a late service result does not release an in-flight lock", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const first = started(manager.commands.setLockState("door", "unlocked"));
    await jest.advanceTimersByTimeAsync(45_000);
    backend.snapshot(snapshot([{ ...lock(), state: "unlocked" }]));
    expect(manager.commandStore.getState().records.at(-1)?.status).toBe(
      "confirmed",
    );
    expect(manager.commands.setLockState("door", "locked")).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    pending.resolve({ kind: "accepted" });
    await first.result;
  });
  test("binary, mode and preset actions are ignored while any call for that entity is in flight", async () => {
    const { backend } = await house();
    const fanPending = deferredService();
    backend.callService.mockReturnValueOnce(fanPending.promise);
    const value = queued(manager.commands.setFanPercentage("vent", 50));
    await jest.advanceTimersByTimeAsync(600);
    const sent = started(await value.completion);
    expect(manager.commands.setFanOn("vent", false)).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    expect(manager.commands.setFanPreset("vent", "sleep")).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    fanPending.resolve({ kind: "accepted" });
    await sent.result;
    const climatePending = deferredService();
    backend.callService.mockReturnValueOnce(climatePending.promise);
    const mode = started(manager.commands.setHvacMode("thermostat", "cool"));
    expect(manager.commands.setHvacMode("thermostat", "heat")).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    climatePending.resolve({ kind: "accepted" });
    await mode.result;
  });
  test("binary/mode actions cancel an older unsent continuous value, including an already-off no-op", async () => {
    const { backend } = await house();
    const value = queued(manager.commands.setFanPercentage("vent", 50));
    expect(manager.commands.setFanOn("vent", false).kind).toBe("no-op");
    await expect(value.completion).resolves.toEqual({
      kind: "cancelled",
      reason: "superseded",
    });
    const temp = queued(
      manager.commands.setClimateTarget("thermostat", { temperature: 22 }),
    );
    await started(manager.commands.setHvacMode("thermostat", "cool")).result;
    await expect(temp.completion).resolves.toEqual({
      kind: "cancelled",
      reason: "superseded",
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(backend.callService).toHaveBeenCalledTimes(1);
  });
  test("an invalid immediate request does not erase a valid unsent target", async () => {
    const { backend } = await house();
    const value = queued(manager.commands.setFanPercentage("vent", 50));
    expect(manager.commands.setFanPreset("vent", "undeclared").kind).toBe(
      "refused",
    );
    await jest.advanceTimersByTimeAsync(600);
    await started(await value.completion).result;
    expect(backend.callService).toHaveBeenCalledTimes(1);
  });
  test("alias promotion preserves one in-flight lane and deferred identity validation", async () => {
    const { backend } = await house();
    const pending = deferredService();
    backend.callService.mockReturnValueOnce(pending.promise);
    const one = queued(manager.commands.setFanPercentage("vent", 30));
    await jest.advanceTimersByTimeAsync(600);
    const first = started(await one.completion);
    const promoted = snapshot([{ ...fan(), key: "fan-registry-uuid" }]);
    promoted.identities.aliases.vent = "fan-registry-uuid";
    backend.snapshot(promoted);
    expect(manager.commands.setFanOn("fan-registry-uuid", true)).toMatchObject({
      kind: "refused",
      reason: "in_flight",
    });
    const last = queued(
      manager.commands.setFanPercentage("fan-registry-uuid", 70),
    );
    await jest.advanceTimersByTimeAsync(600);
    expect(backend.callService).toHaveBeenCalledTimes(1);
    pending.resolve({ kind: "accepted" });
    await first.result;
    await started(await last.completion).result;
    expect(backend.callService).toHaveBeenCalledTimes(2);
  });
  test.each(["background", "not_ready"])(
    "a sending-record subscriber that causes %s prevents the still-unsent service and removes its registration",
    async (reason) => {
      const { backend } = await house();
      const unsubscribe = manager.commandStore.subscribe((state) => {
        if (state.records.at(-1)?.status === "sending") {
          if (reason === "background") void manager.setForeground(false);
          else
            backend.changeStatus({ kind: "reconnecting", lastReadyAt: null });
        }
      });
      try {
        expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
          kind: "refused",
          reason,
        });
        expect(backend.callService).not.toHaveBeenCalled();
        expect(manager.commandStore.getState().records).toEqual([]);
      } finally {
        unsubscribe();
      }
    },
  );
  test("command subscribers cannot use stale ready state while a status transition is being published", async () => {
    const { backend } = await house();
    await started(manager.commands.setSwitch("stable-lamp", true)).result;
    const attempts: CommandResult[] = [];
    const unsubscribe = manager.commandStore.subscribe((state) => {
      if (state.records.at(-1)?.status === "unconfirmed")
        attempts.push(manager.commands.setFanPercentage("vent", 50));
    });
    try {
      backend.changeStatus({ kind: "reconnecting", lastReadyAt: null });
    } finally {
      unsubscribe();
    }
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ kind: "refused", reason: "not_ready" });
    backend.ready();
    await jest.advanceTimersByTimeAsync(1000);
    expect(backend.callService).toHaveBeenCalledTimes(1);
  });
  test("deadline reconciliation cannot enqueue after a subscriber has already left ready", async () => {
    const { backend } = await house();
    await started(manager.commands.setSwitch("stable-lamp", true)).result;
    jest.setSystemTime(Date.now() + 20_000);
    const unsubscribe = manager.commandStore.subscribe((state) => {
      if (state.records.at(-1)?.status === "unconfirmed")
        backend.changeStatus({ kind: "synchronizing" });
    });
    try {
      expect(manager.commands.setFanPercentage("vent", 50)).toMatchObject({
        kind: "refused",
        reason: "not_ready",
      });
    } finally {
      unsubscribe();
    }
    backend.ready();
    await jest.advanceTimersByTimeAsync(1000);
    expect(backend.callService).toHaveBeenCalledTimes(1);
  });
  test("command subscribers validate the newest snapshot before it is published to the cockpit store", async () => {
    const { backend } = await house();
    backend.callService.mockResolvedValueOnce({
      kind: "rejected",
      message: "HA error",
    });
    await started(manager.commands.setSwitch("stable-lamp", true)).result;
    const attempts: CommandResult[] = [];
    const unsubscribe = manager.commandStore.subscribe((state) => {
      if (state.records.at(-1)?.dismissed)
        attempts.push(manager.commands.setSwitch("stable-lamp", true));
    });
    try {
      backend.snapshot(snapshot([entity({ state: "unavailable" })]));
    } finally {
      unsubscribe();
    }
    expect(attempts[0]).toMatchObject({
      kind: "refused",
      reason: "unavailable",
    });
    expect(backend.callService).toHaveBeenCalledTimes(1);
  });
});
