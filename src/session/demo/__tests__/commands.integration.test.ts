import { DemoBackend, type DemoOptions } from "../DemoBackend";
import { HomeAssistantBackend } from "../../homeAssistant/HomeAssistantBackend";
import { SessionManager } from "../../SessionManager";
import { Credentials } from "../../../services/credentials";
import { PreferencesStorage } from "../../../preferences/storage";
import { useCockpit } from "../../../core/store";
import type { CommandResult, DeferredResult } from "../../../commands/types";

// Only inject constructor options. Transport, fixtures, mapping, facade, manager,
// scheduler, revisions and tracker all execute their real implementation.
let mockOptions: DemoOptions;
let mockInstances: DemoBackend[];
jest.mock("../DemoBackend", () => {
  const actual = jest.requireActual("../DemoBackend");
  return {
    ...actual,
    DemoBackend: jest.fn((id: string) => {
      const backend = new actual.DemoBackend(id, mockOptions);
      mockInstances.push(backend);
      return backend;
    }),
  };
});
jest.mock("../../homeAssistant/HomeAssistantBackend", () => ({
  HomeAssistantBackend: jest.fn(() => {
    throw new Error("Demo must remain offline");
  }),
}));
class MemoryStorage {
  readonly values = new Map<string, string>();
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
let manager: SessionManager;
let local: MemoryStorage;
let secure: MemoryStorage;
let prefs: MemoryStorage;
const lamp = "demo-switch.living_lamp";
const vent = "demo-fan.office_vent";
const thermostat = "demo-climate.downstairs";
const side = "demo-lock.side_door";
const front = "demo-lock.front_door";
const observed = (id: string) => useCockpit.getState().snapshot!.entities[id]!;
const records = () => manager.commandStore.getState().records;
const latest = () => records().at(-1)!;
function started(result: CommandResult | DeferredResult) {
  expect(result.kind).toBe("started");
  if (result.kind !== "started")
    throw new Error(`Expected started, got ${result.kind}`);
  return result;
}
function queued(result: CommandResult) {
  expect(result.kind).toBe("queued");
  if (result.kind !== "queued")
    throw new Error(`Expected queued, got ${result.kind}`);
  return result.completion;
}
async function setup(options: DemoOptions = {}) {
  mockOptions = options;
  local = new MemoryStorage();
  secure = new MemoryStorage();
  prefs = new MemoryStorage();
  manager = new SessionManager(
    new Credentials(secure, local, () => "demo-storage"),
    new PreferencesStorage(prefs),
  );
  await manager.connect({ demo: true });
  return mockInstances.at(-1)!;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  mockInstances = [];
  useCockpit.setState(useCockpit.getInitialState(), true);
});
afterEach(() => {
  manager?.disconnect();
  expect(HomeAssistantBackend).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test.each([true, false])(
  "keeps acknowledgement and observation independent (ack first: %s)",
  async (ackFirst) => {
    await setup({
      scenario: () => ({
        acknowledgement: "accepted",
        acknowledgementAfterMs: ackFirst ? 100 : 900,
        observationAfterMs: ackFirst ? 900 : 100,
      }),
    });
    const action = started(manager.commands.setSwitch(lamp, true));
    expect(latest().status).toBe("sending");
    expect(observed("switch.living_lamp").state).toBe("off");
    await jest.advanceTimersByTimeAsync(100);
    expect(latest().status).toBe(ackFirst ? "accepted" : "sending");
    expect(observed("switch.living_lamp").state).toBe(ackFirst ? "off" : "on");
    await jest.advanceTimersByTimeAsync(800);
    await expect(action.result).resolves.toEqual({ kind: "accepted" });
    expect(latest()).toMatchObject({
      status: "confirmed",
      confirmation: { kind: "observed", assumed: false },
    });
    expect(useCockpit.getState()).toMatchObject({
      mode: "demo",
      profileId: "demo",
      status: { kind: "ready", haVersion: "Demo" },
    });
  },
);
test.each([50, 500])(
  "rejection stays failed even with an observed simulated effect at %s ms",
  async (effectAfter) => {
    await setup({
      scenario: () => ({
        acknowledgement: "rejected",
        acknowledgementAfterMs: 200,
        observationAfterMs: effectAfter,
      }),
    });
    const action = started(manager.commands.setSwitch(lamp, true));
    await jest.advanceTimersByTimeAsync(600);
    await expect(action.result).resolves.toMatchObject({ kind: "rejected" });
    expect(latest().status).toBe("failed");
    expect(observed("switch.living_lamp").state).toBe("on");
  },
);
test.each(["timeout", "connection_lost"] as const)(
  "unknown %s can reconcile a later observation",
  async (reason) => {
    await setup({
      scenario: () => ({
        acknowledgement: reason,
        acknowledgementAfterMs: 100,
        observationAfterMs: 1000,
      }),
    });
    const action = started(manager.commands.setSwitch(lamp, true));
    await jest.advanceTimersByTimeAsync(100);
    await expect(action.result).resolves.toEqual({ kind: "unknown", reason });
    expect(latest()).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: reason,
    });
    expect(observed("switch.living_lamp").state).toBe("off");
    await jest.advanceTimersByTimeAsync(900);
    expect(latest()).toMatchObject({
      status: "confirmed",
      confirmation: { kind: "reconciled" },
    });
  },
);
test("accepted without effect expires; late observation confirms without sending again", async () => {
  const scenario = jest.fn(() => ({
    acknowledgement: "accepted" as const,
    acknowledgementAfterMs: 100,
    observationAfterMs: 20_000,
  }));
  await setup({ scenario });
  const action = started(manager.commands.setSwitch(lamp, true));
  await jest.advanceTimersByTimeAsync(15_000);
  await action.result;
  expect(latest()).toMatchObject({
    status: "unconfirmed",
    unconfirmedReason: "deadline",
  });
  await jest.advanceTimersByTimeAsync(5000);
  expect(latest()).toMatchObject({
    status: "confirmed",
    confirmation: { kind: "reconciled" },
  });
  expect(scenario).toHaveBeenCalledTimes(1);
});
test("unknown without effect remains unconfirmed across refresh/foreground and never replays", async () => {
  const scenario = jest.fn(() => ({
    acknowledgement: "timeout" as const,
    acknowledgementAfterMs: 100,
    observationAfterMs: null,
  }));
  await setup({ scenario });
  const action = started(manager.commands.setSwitch(lamp, true));
  await jest.advanceTimersByTimeAsync(100);
  await action.result;
  await manager.refresh();
  await manager.setForeground(false);
  await manager.setForeground(true);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(latest().status).toBe("unconfirmed");
  expect(observed("switch.living_lamp").state).toBe("off");
  expect(scenario).toHaveBeenCalledTimes(1);
});
test("debounces continuous values and confirms attribute-only targets", async () => {
  const backend = await setup();
  const dispatch = jest.spyOn(backend, "callService");
  const first = queued(
    manager.commands.setClimateTarget(thermostat, { low: 66, high: 76 }),
  );
  await jest.advanceTimersByTimeAsync(300);
  const second = queued(
    manager.commands.setClimateTarget(thermostat, { low: 67, high: 77 }),
  );
  await expect(first).resolves.toEqual({
    kind: "cancelled",
    reason: "superseded",
  });
  await jest.advanceTimersByTimeAsync(599);
  expect(dispatch).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  const action = started(await second);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith({
    domain: "climate",
    service: "set_temperature",
    entityId: "climate.downstairs",
    data: { target_temp_low: 67, target_temp_high: 77 },
  });
  await jest.advanceTimersByTimeAsync(450);
  await action.result;
  expect(observed("climate.downstairs")).toMatchObject({
    state: "heat_cool",
    attributes: { target_temp_low: 67, target_temp_high: 77 },
  });
  expect(latest().status).toBe("confirmed");
  await jest.advanceTimersByTimeAsync(24_000);
  await manager.refresh();
  expect(observed("climate.downstairs").attributes).toMatchObject({
    target_temp_low: 67,
    target_temp_high: 77,
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test("serializes actual demo acknowledgements while preserving the latest compensating value", async () => {
  const backend = await setup({
    scenario: () => ({
      acknowledgement: "accepted",
      acknowledgementAfterMs: 2000,
      observationAfterMs: 500,
    }),
  });
  const dispatch = jest.spyOn(backend, "callService");
  const first = queued(manager.commands.setFanPercentage(vent, 80));
  await jest.advanceTimersByTimeAsync(600);
  const sent = started(await first);
  const second = queued(manager.commands.setFanPercentage(vent, 60));
  await jest.advanceTimersByTimeAsync(1999);
  expect(dispatch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  await sent.result;
  const compensating = started(await second);
  expect(dispatch).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(2000);
  await compensating.result;
  expect(observed("fan.office_vent").attributes.percentage).toBe(60);
  expect(records().map((r) => r.status)).toEqual(["superseded", "confirmed"]);
});
test("lock open keeps transient evidence when acknowledgement arrives after opening ends", async () => {
  await setup({
    scenario: () => ({
      acknowledgement: "accepted",
      acknowledgementAfterMs: 2000,
      observationAfterMs: 100,
    }),
  });
  const action = started(
    manager.commands.setLockState(side, "open", "secret-pin-4812"),
  );
  await jest.advanceTimersByTimeAsync(100);
  expect(observed("lock.side_door").state).toBe("opening");
  await jest.advanceTimersByTimeAsync(900);
  expect(observed("lock.side_door").state).toBe("unlocked");
  expect(latest().status).toBe("sending");
  await jest.advanceTimersByTimeAsync(1000);
  await action.result;
  expect(latest().status).toBe("confirmed");
  expect(
    JSON.stringify({
      records: records(),
      state: useCockpit.getState(),
      local: [...local.values],
      secure: [...secure.values],
      prefs: [...prefs.values],
      backend: mockInstances[0],
    }),
  ).not.toContain("secret-pin");
});
test("periodic snapshots do not manufacture the fresh lock observation needed after unknown", async () => {
  const backend = await setup({
    scenario: () => ({
      acknowledgement: "timeout",
      acknowledgementAfterMs: 100,
      observationAfterMs: null,
    }),
  });
  const dispatch = jest.spyOn(backend, "callService");
  const action = started(manager.commands.setLockState(front, "unlocked"));
  await jest.advanceTimersByTimeAsync(48_000);
  await action.result;
  expect(manager.commands.setLockState(front, "locked")).toMatchObject({
    kind: "refused",
    reason: "fresh_observation_required",
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
  await manager.refresh();
  expect(manager.commands.setLockState(front, "locked").kind).toBe("no-op");
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test.each(["unavailable", "unsupported"])(
  "facade refuses %s before calling the backend",
  async (kind) => {
    const backend = await setup({
      initialState:
        kind === "unavailable"
          ? { "switch.living_lamp": { state: "unavailable" } }
          : {},
    });
    const dispatch = jest.spyOn(backend, "callService");
    const result =
      kind === "unavailable"
        ? manager.commands.setSwitch(lamp, true)
        : manager.commands.setLockState(front, "open");
    expect(result).toMatchObject({ kind: "refused", reason: kind });
    expect(dispatch).not.toHaveBeenCalled();
    expect(records()).toHaveLength(0);
  },
);
test.each(["background", "refresh", "replacement"])(
  "cancels unsent continuous work on %s and never replays",
  async (change) => {
    const backend = await setup();
    const dispatch = jest.spyOn(backend, "callService");
    const completion = queued(manager.commands.setFanPercentage(vent, 80));
    const captured = manager.commands.capture(vent);
    if (captured.kind !== "captured") throw new Error("Expected captured");
    if (change === "background") await manager.setForeground(false);
    else if (change === "refresh") await manager.refresh();
    else await manager.connect({ demo: true });
    await expect(completion).resolves.toEqual({
      kind: "cancelled",
      reason:
        change === "background"
          ? "background"
          : change === "refresh"
            ? "not_ready"
            : "session_changed",
    });
    if (change === "background") {
      expect(manager.commands.setFanOn(vent, false)).toMatchObject({
        kind: "refused",
        reason: "background",
      });
      await manager.setForeground(true);
    }
    expect(manager.commands.setFanOn(captured.target, false)).toMatchObject({
      kind: "refused",
      reason: "session_changed",
    });
    await jest.advanceTimersByTimeAsync(24_000);
    expect(dispatch).not.toHaveBeenCalled();
    expect(observed("fan.office_vent").attributes.percentage).toBe(60);
  },
);
test("a sent effect may finish in background; foreground preserves it without replay", async () => {
  const backend = await setup();
  const dispatch = jest.spyOn(backend, "callService");
  const action = started(manager.commands.setSwitch(lamp, true));
  await manager.setForeground(false);
  await jest.advanceTimersByTimeAsync(1000);
  await action.result;
  expect(latest().status).toBe("confirmed");
  await manager.setForeground(true);
  await manager.refresh();
  expect(observed("switch.living_lamp").state).toBe("on");
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test("replacement settles old results and cancels all old effect timers", async () => {
  const oldBackend = await setup({
    scenario: () => ({
      acknowledgement: "accepted",
      acknowledgementAfterMs: 1000,
      observationAfterMs: 2000,
    }),
  });
  const oldSnapshots = jest.fn();
  oldBackend.onSnapshot(oldSnapshots);
  const action = started(manager.commands.setSwitch(lamp, true));
  const pending = queued(manager.commands.setFanPercentage(vent, 80));
  await manager.connect({ demo: true });
  await expect(action.result).resolves.toEqual({
    kind: "unknown",
    reason: "connection_lost",
  });
  await expect(pending).resolves.toEqual({
    kind: "cancelled",
    reason: "session_changed",
  });
  await jest.advanceTimersByTimeAsync(60_000);
  expect(oldSnapshots).not.toHaveBeenCalled();
  expect(observed("switch.living_lamp").state).toBe("off");
  expect(observed("fan.office_vent").attributes.percentage).toBe(60);
  expect(latest().status).toBe("unconfirmed");
  expect(DemoBackend).toHaveBeenCalledTimes(2);
});

test.each(["no-op", "refused"] as const)(
  "queued completion can resolve to %s after a new demo observation",
  async (decision) => {
    const backend = await setup();
    // An independent simulated report arrives while the facade's target is unsent.
    const completion = queued(
      decision === "no-op"
        ? manager.commands.setFanPercentage(vent, 80)
        : manager.commands.setClimateTarget(thermostat, { low: 66, high: 76 }),
    );
    const external = backend.callService(
      decision === "no-op"
        ? {
            domain: "fan",
            service: "set_percentage",
            entityId: "fan.office_vent",
            data: { percentage: 80 },
          }
        : {
            domain: "climate",
            service: "set_hvac_mode",
            entityId: "climate.downstairs",
            data: { hvac_mode: "off" },
          },
    );
    await jest.advanceTimersByTimeAsync(600);
    await external;
    await expect(completion).resolves.toMatchObject({
      kind: decision,
      ...(decision === "refused" ? { reason: "unsupported" } : {}),
    });
    expect(records()).toHaveLength(0);
  },
);

test.each(["lock", "unlock", "fan-off", "fan-preset", "hvac", "single-target"])(
  "confirms %s through semantic facade and observed demo state",
  async (kind) => {
    await setup(
      kind === "single-target"
        ? { initialState: { "climate.downstairs": { state: "heat" } } }
        : {},
    );
    const result =
      kind === "lock"
        ? manager.commands.setLockState(side, "locked")
        : kind === "unlock"
          ? manager.commands.setLockState(front, "unlocked")
          : kind === "fan-off"
            ? manager.commands.setFanOn(vent, false)
            : kind === "fan-preset"
              ? manager.commands.setFanPreset(vent, "sleep")
              : kind === "hvac"
                ? manager.commands.setHvacMode(thermostat, "cool")
                : manager.commands.setClimateTarget(thermostat, {
                    temperature: 76,
                  });
    let decision: CommandResult | DeferredResult = result;
    if (result.kind === "queued") {
      await jest.advanceTimersByTimeAsync(600);
      decision = await result.completion;
    }
    const action = started(decision);
    await jest.advanceTimersByTimeAsync(450);
    await action.result;
    expect(latest().status).toBe("confirmed");
  },
);
