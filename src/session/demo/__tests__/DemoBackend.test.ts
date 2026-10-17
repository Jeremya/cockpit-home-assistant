import { DemoBackend, type DemoOptions } from "../DemoBackend";
import type { HomeSnapshot } from "../../../core/types";
import type { ServiceCall } from "../../types";

let backend: DemoBackend;
let snapshots: HomeSnapshot[];
const latest = () => snapshots.at(-1)!;
const observed = (id: string) => latest().entities[id]!;
const call = (
  domain: string,
  service: string,
  entityId: string,
  data?: Record<string, unknown>,
): ServiceCall => ({
  domain,
  service,
  entityId,
  ...(data === undefined ? {} : { data }),
});
async function start(options: DemoOptions = {}) {
  backend = new DemoBackend("simulated", options);
  snapshots = [];
  backend.onSnapshot((snapshot) => snapshots.push(snapshot));
  await backend.start();
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});
afterEach(() => {
  backend?.stop();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test.each<[ServiceCall, DemoOptions, string, unknown]>([
  [call("switch", "turn_on", "switch.living_lamp"), {}, "state", "on"],
  [
    call("switch", "turn_off", "switch.fridge_power_cool"),
    { initialState: { "switch.fridge_power_cool": { state: "on" } } },
    "state",
    "off",
  ],
  [call("lock", "lock", "lock.side_door"), {}, "state", "locked"],
  [
    call("lock", "unlock", "lock.front_door", { code: "1234" }),
    {},
    "state",
    "unlocked",
  ],
  [call("lock", "open", "lock.side_door"), {}, "state", "opening"],
  [
    call("climate", "set_temperature", "climate.downstairs", {
      target_temp_low: 67.4,
      target_temp_high: 76.2,
    }),
    {},
    "attributes",
    { target_temp_low: 67, target_temp_high: 76 },
  ],
  [
    call("climate", "set_temperature", "climate.downstairs", {
      temperature: 75.6,
    }),
    { initialState: { "climate.downstairs": { state: "heat" } } },
    "attributes",
    { temperature: 76 },
  ],
  [
    call("climate", "set_hvac_mode", "climate.downstairs", {
      hvac_mode: "cool",
    }),
    {},
    "state",
    "cool",
  ],
  [call("fan", "turn_off", "fan.office_vent"), {}, "state", "off"],
  [
    call("fan", "turn_on", "fan.office_vent"),
    { initialState: { "fan.office_vent": { state: "off" } } },
    "state",
    "on",
  ],
  [
    call("fan", "set_percentage", "fan.office_vent", { percentage: 43 }),
    {},
    "attributes",
    { percentage: 40 },
  ],
  [
    call("fan", "set_percentage", "fan.office_vent", { percentage: 0 }),
    {},
    "state",
    "off",
  ],
  [
    call("fan", "set_preset_mode", "fan.office_vent", { preset_mode: "sleep" }),
    {},
    "attributes",
    { preset_mode: "sleep" },
  ],
])(
  "simulates only the addressed service: %j",
  async (request, options, field, expected) => {
    await start(options);
    const baseline = latest();
    const result = backend.callService(request);
    expect(latest()).toBe(baseline);
    await jest.advanceTimersByTimeAsync(120);
    await expect(result).resolves.toEqual({ kind: "accepted" });
    expect(latest()).toBe(baseline);
    await jest.advanceTimersByTimeAsync(330);
    if (field === "attributes")
      expect(observed(request.entityId).attributes).toMatchObject(
        expected as object,
      );
    else expect(observed(request.entityId).state).toBe(expected);
    expect(latest().syncEpoch).toBe(baseline.syncEpoch);
    for (const [id, entity] of Object.entries(baseline.entities))
      if (id !== request.entityId) expect(latest().entities[id]).toBe(entity);
  },
);

test.each<unknown>([
  null,
  [],
  call("homeassistant", "turn_on", "switch.living_lamp"),
  call("switch", "toggle", "switch.living_lamp"),
  call("switch", "turn_on", "lock.front_door"),
  call("switch", "turn_on", "switch.missing"),
  call("switch", "turn_on", "switch.living_lamp", { entity_id: "all" }),
  call("switch", "turn_on", "switch.living_lamp", { extra: true }),
  { ...call("switch", "turn_on", "switch.living_lamp"), target: "all" },
  {
    ...call("switch", "turn_on", "switch.living_lamp"),
    entityId: ["switch.living_lamp"],
  },
  { ...call("switch", "turn_on", "switch.living_lamp"), data: null },
  { ...call("switch", "turn_on", "switch.living_lamp"), data: [] },
  call("lock", "open", "lock.front_door"),
  call("lock", "unlock", "lock.front_door", { code: 1234 }),
  call("lock", "unlock", "lock.front_door", { code: " " }),
  call("lock", "unlock", "lock.front_door", { code: "1234", user: "admin" }),
  call("climate", "set_temperature", "climate.downstairs", { temperature: 70 }),
  call("climate", "set_temperature", "climate.downstairs", {
    target_temp_low: 80,
    target_temp_high: 60,
  }),
  call("climate", "set_temperature", "climate.downstairs", {
    target_temp_low: 49,
    target_temp_high: 75,
  }),
  call("climate", "set_temperature", "climate.downstairs", {
    target_temp_low: 65,
  }),
  call("climate", "set_temperature", "climate.downstairs", {
    target_temp_low: NaN,
    target_temp_high: 75,
  }),
  call("climate", "set_temperature", "climate.downstairs", {
    target_temp_low: 65,
    target_temp_high: 75,
    temperature: 70,
  }),
  call("climate", "set_hvac_mode", "climate.downstairs", {
    hvac_mode: "unsupported",
  }),
  call("climate", "set_hvac_mode", "climate.downstairs", {}),
  call("fan", "set_percentage", "fan.office_vent", { percentage: Infinity }),
  call("fan", "set_percentage", "fan.office_vent", { percentage: "50" }),
  call("fan", "set_percentage", "fan.office_vent", { percentage: 101 }),
  call("fan", "set_preset_mode", "fan.office_vent", {
    preset_mode: "unsupported",
  }),
  call("sensor", "turn_on", "sensor.feeder_today"),
  call("button", "press", "button.feeder_manual_feed"),
])(
  "refuses malformed or unsupported descriptors without effects: %j",
  async (request) => {
    await start();
    const before = latest();
    await expect(
      backend.callService(request as ServiceCall),
    ).resolves.toMatchObject({ kind: "rejected" });
    await jest.advanceTimersByTimeAsync(2000);
    expect(latest()).toBe(before);
    expect(jest.getTimerCount()).toBe(1);
  },
);

test.each(["unavailable", "unknown"])(
  "refuses an %s simulated entity",
  async (state) => {
    await start({ initialState: { "switch.living_lamp": { state } } });
    await expect(
      backend.callService(call("switch", "turn_on", "switch.living_lamp")),
    ).resolves.toMatchObject({ kind: "rejected" });
  },
);
test("respects removed capabilities and malformed control limits", async () => {
  await start({
    initialState: {
      "fan.office_vent": { attributes: { supported_features: 0 } },
      "climate.downstairs": { attributes: { min_temp: "bad" } },
    },
  });
  for (const request of [
    call("fan", "turn_off", "fan.office_vent"),
    call("fan", "set_percentage", "fan.office_vent", { percentage: 30 }),
    call("climate", "set_temperature", "climate.downstairs", {
      target_temp_low: 65,
      target_temp_high: 75,
    }),
  ])
    await expect(backend.callService(request)).resolves.toMatchObject({
      kind: "rejected",
    });
});
test("rejects inherited and symbol data fields", async () => {
  await start();
  const symbol = Symbol("extra");
  for (const data of [Object.create({ extra: true }), { [symbol]: true }])
    await expect(
      backend.callService(
        call("switch", "turn_on", "switch.living_lamp", data),
      ),
    ).resolves.toMatchObject({ kind: "rejected" });
});

test("commands survive ticks, resync and foreground; fixed identities and feeder readings stay intact", async () => {
  await start();
  const baseline = latest();
  const result = backend.callService(
    call("switch", "turn_on", "switch.living_lamp"),
  );
  await jest.advanceTimersByTimeAsync(450);
  await result;
  const lamp = observed("switch.living_lamp");
  const lock = observed("lock.side_door");
  await jest.advanceTimersByTimeAsync(48_000);
  expect(observed("switch.living_lamp")).toBe(lamp);
  expect(observed("lock.side_door")).toBe(lock);
  expect(latest().syncEpoch).toBe(baseline.syncEpoch);
  await backend.resync();
  expect(latest().syncEpoch).toBe(baseline.syncEpoch + 1);
  await backend.setForeground(false);
  const count = snapshots.length;
  await jest.advanceTimersByTimeAsync(48_000);
  expect(snapshots).toHaveLength(count);
  await backend.setForeground(true);
  expect(observed("switch.living_lamp")).toBe(lamp);
  expect(latest().registryEntries).toEqual(baseline.registryEntries);
  expect(latest().devices).toEqual(baseline.devices);
  expect(latest().areas).toEqual(baseline.areas);
  for (const id of baseline.devices["demo-feeder"]!.entityIds)
    expect(observed(id)).toBe(baseline.entities[id]);
  expect(latest().config.haVersion).toBe("Demo");
});
test("attribute effects preserve last_changed and update last_updated", async () => {
  await start();
  const before = observed("climate.downstairs");
  const result = backend.callService(
    call("climate", "set_temperature", "climate.downstairs", {
      target_temp_low: 66,
      target_temp_high: 77,
    }),
  );
  await jest.advanceTimersByTimeAsync(450);
  await result;
  expect(observed("climate.downstairs").lastChanged).toBe(before.lastChanged);
  expect(observed("climate.downstairs").lastUpdated).not.toBe(
    before.lastUpdated,
  );
  await jest.advanceTimersByTimeAsync(24_000);
  expect(observed("climate.downstairs").attributes).toMatchObject({
    target_temp_low: 66,
    target_temp_high: 77,
  });
});
test("open is transient and its completion cannot undo a newer lock effect", async () => {
  await start();
  const open = backend.callService(call("lock", "open", "lock.side_door"));
  await jest.advanceTimersByTimeAsync(450);
  await open;
  expect(observed("lock.side_door").state).toBe("opening");
  const lock = backend.callService(call("lock", "lock", "lock.side_door"));
  await jest.advanceTimersByTimeAsync(900);
  await lock;
  expect(observed("lock.side_door").state).toBe("locked");
});
test("stop settles pending calls, cancels observations and prevents revival", async () => {
  await start();
  const result = backend.callService(
    call("switch", "turn_on", "switch.living_lamp"),
  );
  backend.stop();
  await expect(result).resolves.toEqual({
    kind: "unknown",
    reason: "connection_lost",
  });
  const count = snapshots.length;
  await backend.start();
  backend.recover();
  await backend.resync();
  await backend.setForeground(true);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(snapshots).toHaveLength(count);
  expect(await backend.ping()).toBe(false);
  expect(backend.status.kind).toBe("idle");
  await expect(
    backend.callService(call("switch", "turn_on", "switch.living_lamp")),
  ).resolves.toMatchObject({ kind: "rejected" });
});
test("copies payloads; injected scenarios and retained state never receive a PIN", async () => {
  const scenario = jest.fn<
    ReturnType<NonNullable<DemoOptions["scenario"]>>,
    Parameters<NonNullable<DemoOptions["scenario"]>>
  >(() => ({
    acknowledgement: "accepted" as const,
    acknowledgementAfterMs: 100,
    observationAfterMs: 200,
  }));
  await start({ scenario });
  const request = call("lock", "unlock", "lock.front_door", {
    code: "private-pin-7391",
  });
  const result = backend.callService(request);
  request.data!.code = "changed";
  request.entityId = "lock.side_door";
  await jest.advanceTimersByTimeAsync(200);
  await result;
  expect(observed("lock.front_door").state).toBe("unlocked");
  expect(observed("lock.side_door").state).toBe("unlocked");
  expect(scenario.mock.calls[0]![0]).toEqual({
    entityId: "lock.front_door",
    intent: { kind: "setLockState", state: "unlocked" },
    sequence: 1,
  });
  expect(
    JSON.stringify({ backend, snapshots, calls: scenario.mock.calls }),
  ).not.toContain("private-pin");
});
test("uses the injected clock and makes duplicate starts harmless", async () => {
  const clock = {
    now: () => Date.now() + 3600_000,
    setTimeout: jest.fn((fn: () => void, ms: number) => setTimeout(fn, ms)),
    clearTimeout: jest.fn((id: ReturnType<typeof setTimeout>) =>
      clearTimeout(id),
    ),
  };
  await start({ clock });
  await backend.start();
  expect(latest().receivedAt).toBe("2026-10-16T13:00:00.000Z");
  expect(snapshots).toHaveLength(1);
  expect(clock.setTimeout).toHaveBeenCalledTimes(1);
  backend.stop();
  expect(clock.clearTimeout).toHaveBeenCalledTimes(1);
});
test.each([NaN, -1, Infinity, 600_001])(
  "refuses invalid injected timing %s without a timer or effect",
  async (delay) => {
    await start({
      scenario: () => ({
        acknowledgement: "accepted",
        acknowledgementAfterMs: delay,
        observationAfterMs: 10,
      }),
    });
    const before = latest();
    await expect(
      backend.callService(call("switch", "turn_on", "switch.living_lamp")),
    ).resolves.toMatchObject({ kind: "rejected" });
    await jest.advanceTimersByTimeAsync(1000);
    expect(latest()).toBe(before);
  },
);
