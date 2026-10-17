import { CommandTracker } from "../CommandTracker";
import { ObservationRevisions } from "../observations";
import { commandMessage } from "../presentation";
import { latestCommand, visibleCommand } from "../store";
import { desiredState, satisfiesDesired } from "../predicates";
import { COMMAND_LATE_WINDOW_MS } from "../../constants/config";
import type { CommandIntent, CommandRecord } from "../types";
import type { EntityRecord } from "../../core/types";
import { climate, config, entity, fan, lock, snapshot } from "./fixtures";

const ready = {
  kind: "ready",
  haVersion: "2026.10.1",
  readySince: "",
} as const;
const on = { kind: "setSwitch", on: true } as const;
let tracker: CommandTracker;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  tracker = new CommandTracker();
});
afterEach(() => {
  tracker.end(true);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
function start(entities = [entity()]) {
  tracker.start("ha:public", "scope-1");
  tracker.observe(snapshot(entities));
  tracker.onStatus(ready);
}
function begin(e = entity(), intent: CommandIntent = on) {
  const result = tracker.begin(e, intent, config);
  if (result.kind !== "tracked") throw new Error(result.reason);
  return result.commandId;
}
function record(id: string): CommandRecord {
  const found = tracker.store.getState().records.find((r) => r.id === id);
  if (!found) throw new Error("Missing record");
  return found;
}
const ack = (id: string) =>
  tracker.acknowledge(id, "scope-1", { kind: "accepted" });

test.each(["ack-first", "observation-first"])(
  "keeps acknowledgement separate from a qualifying observation: %s",
  (order) => {
    start();
    const id = begin();
    expect(record(id)).toMatchObject({
      status: "sending",
      profileId: "ha:public",
      entityId: "switch.lamp",
      baselineRevision: 1,
    });
    if (order === "ack-first") {
      ack(id);
      expect(record(id).status).toBe("accepted");
    }
    tracker.observe(snapshot([entity({ state: "on" })]));
    expect(record(id).status).toBe(
      order === "ack-first" ? "confirmed" : "sending",
    );
    if (order === "observation-first") ack(id);
    expect(record(id)).toMatchObject({
      status: "confirmed",
      confirmation: { kind: "observed", assumed: false },
    });
  },
);
test("a baseline match cannot confirm without a new observation revision", () => {
  const e = entity({ state: "on" });
  start([e]);
  const id = begin(e);
  ack(id);
  tracker.observe(snapshot([structuredClone(e)]));
  expect(record(id).status).toBe("accepted");
  tracker.observe({ ...snapshot([e]), syncEpoch: 2 });
  expect(record(id).status).toBe("confirmed");
});
test("a transient opening before acknowledgement survives the later closed state", () => {
  start([lock()]);
  const id = begin(lock(), {
    kind: "setLockState",
    state: "open",
    code: "0017",
  });
  tracker.observe(snapshot([{ ...lock(), state: "opening" }]));
  tracker.observe(snapshot([lock()]));
  expect(record(id).status).toBe("sending");
  ack(id);
  expect(record(id).status).toBe("confirmed");
});
test("open acceptance alone never claims that the door opened", () => {
  start([lock()]);
  const id = begin(lock(), { kind: "setLockState", state: "open" });
  ack(id);
  expect(commandMessage(record(id))).toBe("Open requested — HA accepted");
  jest.advanceTimersByTime(45_000);
  expect(record(id).status).toBe("unconfirmed");
  expect(commandMessage(record(id))).toContain("Check the door");
});
test.each<[EntityRecord, CommandIntent, EntityRecord]>([
  [
    climate(),
    { kind: "setClimateTarget", target: { temperature: 22 } },
    climate({ temperature: 22.2 }),
  ],
  [
    { ...climate(), state: "heat_cool" },
    { kind: "setClimateTarget", target: { low: 20, high: 23 } },
    {
      ...climate({ target_temp_low: 20, target_temp_high: 23 }),
      state: "heat_cool",
    },
  ],
  [
    climate(),
    { kind: "setHvacMode", mode: "cool" },
    { ...climate(), state: "cool" },
  ],
  [fan(), { kind: "setFanOn", on: true }, { ...fan(), state: "on" }],
  [
    fan(),
    { kind: "setFanPercentage", percentage: 50 },
    fan({ percentage: 50 }),
  ],
  [
    fan(),
    { kind: "setFanPreset", preset: "sleep" },
    fan({ preset_mode: "sleep" }),
  ],
  [
    lock(),
    { kind: "setLockState", state: "unlocked" },
    { ...lock(), state: "unlocked" },
  ],
])(
  "tracks all state/attribute predicates without relying on HA clock ordering %#",
  (before, intent, after) => {
    start([{ ...before, lastUpdated: "2099-01-01T00:00:00Z" }]);
    const id = begin(before, intent);
    ack(id);
    tracker.observe(
      snapshot([{ ...after, lastUpdated: "1990-01-01T00:00:00Z" }]),
    );
    expect(record(id).status).toBe("confirmed");
  },
);
test("confirmation uses dispatch-time tolerance and unit, never a later looser capability", () => {
  const desired = desiredState(
    { kind: "setClimateTarget", target: { temperature: 22 } },
    climate(),
    config,
  );
  expect(
    satisfiesDesired(
      desired,
      climate({ temperature: 19, target_temp_step: 10 }),
      config,
    ),
  ).toBe(false);
  expect(
    satisfiesDesired(desired, climate({ temperature: null }), config),
  ).toBe(false);
  expect(
    satisfiesDesired(desired, climate({ temperature: 22 }), {
      ...config,
      temperatureUnit: "°F",
    }),
  ).toBe(false);
});
test.each<[EntityRecord, CommandIntent, number]>([
  [lock(), { kind: "setLockState", state: "unlocked" }, 45_000],
  [
    climate(),
    { kind: "setClimateTarget", target: { temperature: 22 } },
    30_000,
  ],
  [fan(), { kind: "setFanOn", on: true }, 15_000],
  [entity(), on, 15_000],
])("uses the declared actuator deadline %#", (e, intent, duration) => {
  start([e]);
  const id = begin(e, intent);
  ack(id);
  expect(
    Date.parse(record(id).deadline) - Date.parse(record(id).issuedAt),
  ).toBe(duration);
  jest.advanceTimersByTime(duration - 1);
  expect(record(id).status).toBe("accepted");
  jest.advanceTimersByTime(1);
  expect(record(id)).toMatchObject({
    status: "unconfirmed",
    unconfirmedReason: "deadline",
  });
});
test.each(["timeout", "connection_lost"] as const)(
  "unknown %s is qualified and can reconcile with fresh state",
  (reason) => {
    start();
    const id = begin();
    tracker.acknowledge(id, "scope-1", { kind: "unknown", reason });
    expect(record(id)).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: reason,
    });
    tracker.observe(snapshot([entity({ state: "on" })]));
    expect(record(id)).toMatchObject({
      status: "confirmed",
      confirmation: { kind: "reconciled" },
    });
    expect(commandMessage(record(id))).toBe("Home Assistant now shows On.");
  },
);
test("an unknown acknowledgement cannot promote a duplicate pre-outcome observation", () => {
  start();
  const id = begin();
  const observed = snapshot([entity({ state: "on" })]);
  tracker.observe(observed);
  tracker.acknowledge(id, "scope-1", { kind: "unknown", reason: "timeout" });
  tracker.observe(structuredClone(observed));
  tracker.onStatus(ready);
  expect(record(id).status).toBe("unconfirmed");
  tracker.observe({ ...observed, syncEpoch: 2 });
  expect(record(id).status).toBe("confirmed");
});
test("an unknown acknowledgement after deadline discards a pre-deadline match, retaining the need for fresh evidence", () => {
  start();
  const id = begin();
  tracker.observe(snapshot([entity({ state: "on" })]));
  jest.advanceTimersByTime(15_000);
  tracker.acknowledge(id, "scope-1", { kind: "unknown", reason: "timeout" });
  tracker.onStatus(ready);
  expect(record(id).status).toBe("unconfirmed");
  tracker.observe({ ...snapshot([entity({ state: "on" })]), syncEpoch: 2 });
  expect(record(id).status).toBe("confirmed");
});
test("a pre-ack match does not erase an HA rejection or pretend that no physical effect occurred", () => {
  start();
  const id = begin();
  tracker.observe(snapshot([entity({ state: "on" })]));
  tracker.acknowledge(id, "scope-1", {
    kind: "rejected",
    message: "private message",
  });
  expect(record(id).status).toBe("failed");
  expect(commandMessage(record(id))).toContain(
    "physical effect may still have occurred",
  );
  expect(JSON.stringify(record(id))).not.toContain("private message");
});
test("dismissal with an invalid ID still publishes deadline reconciliation", () => {
  start();
  const id = begin();
  jest.setSystemTime(Date.now() + 60_000);
  expect(tracker.dismiss("missing")).toBe(false);
  expect(record(id).status).toBe("unconfirmed");
});
test.each([-1, 0, 1])(
  "late reconciliation is bounded by five minutes, offset %i",
  (offset) => {
    start();
    const id = begin();
    ack(id);
    jest.advanceTimersByTime(15_000);
    jest.setSystemTime(
      Date.parse(record(id).deadline) + COMMAND_LATE_WINDOW_MS + offset,
    );
    tracker.observe(snapshot([entity({ state: "on" })]));
    expect(record(id).status).toBe(offset < 0 ? "confirmed" : "unconfirmed");
  },
);
test("foreground reconciliation expires sent commands when suspended timers never fired", () => {
  start();
  const id = begin();
  jest.setSystemTime(Date.now() + 60_000);
  expect(record(id).status).toBe("sending");
  tracker.reconcileDeadlines();
  expect(record(id)).toMatchObject({
    status: "unconfirmed",
    unconfirmedReason: "deadline",
  });
  ack(id);
  expect(record(id).status).toBe("unconfirmed");
});
test.each(["update-before-ack", "ack-before-update"])(
  "fresh resync evidence is retained until ready after reconnect: %s",
  (order) => {
    start([lock()]);
    const id = begin(lock(), { kind: "setLockState", state: "unlocked" });
    if (order === "ack-before-update") ack(id);
    tracker.onStatus({ kind: "reconnecting", lastReadyAt: null });
    expect(record(id).status).toBe("unconfirmed");
    tracker.onStatus({ kind: "synchronizing" });
    tracker.observe({
      ...snapshot([{ ...lock(), state: "unlocked" }]),
      syncEpoch: 2,
    });
    if (order === "update-before-ack")
      tracker.acknowledge(id, "scope-1", {
        kind: "unknown",
        reason: "connection_lost",
      });
    expect(record(id).status).toBe("unconfirmed");
    tracker.onStatus(ready);
    expect(record(id).status).toBe("confirmed");
    expect(commandMessage(record(id))).toBe(
      "Home Assistant now shows Unlocked.",
    );
  },
);
test("healthy refresh retains a pre-ack transient match and waits for ready", () => {
  start([lock()]);
  const id = begin(lock(), { kind: "setLockState", state: "open" });
  tracker.onStatus({ kind: "synchronizing" });
  tracker.observe({
    ...snapshot([{ ...lock(), state: "opening" }]),
    syncEpoch: 2,
  });
  tracker.observe({ ...snapshot([lock()]), syncEpoch: 2 });
  ack(id);
  expect(record(id).status).toBe("accepted");
  tracker.onStatus(ready);
  expect(record(id).status).toBe("confirmed");
});
test("reconciliation cannot claim now shows On if the next sync observation contradicts it before ready", () => {
  start();
  const id = begin();
  ack(id);
  tracker.onStatus({ kind: "reconnecting", lastReadyAt: null });
  tracker.onStatus({ kind: "synchronizing" });
  tracker.observe({ ...snapshot([entity({ state: "on" })]), syncEpoch: 2 });
  tracker.observe({ ...snapshot(), syncEpoch: 2 });
  tracker.onStatus(ready);
  expect(record(id).status).toBe("unconfirmed");
});
test("a transient open during recovery is retained and worded as an observed event", () => {
  start([lock()]);
  const id = begin(lock(), { kind: "setLockState", state: "open" });
  tracker.onStatus({ kind: "reconnecting", lastReadyAt: null });
  tracker.onStatus({ kind: "synchronizing" });
  tracker.observe({
    ...snapshot([{ ...lock(), state: "opening" }]),
    syncEpoch: 2,
  });
  tracker.observe({ ...snapshot([lock()]), syncEpoch: 2 });
  tracker.onStatus(ready);
  expect(record(id).status).toBe("confirmed");
  expect(commandMessage(record(id))).toBe(
    "Home Assistant reported Open or opening.",
  );
});
test("old epochs and duplicate non-changing snapshots cannot supply new evidence", () => {
  start();
  tracker.observe({ ...snapshot(), syncEpoch: 2 });
  const id = begin();
  ack(id);
  tracker.observe({ ...snapshot([entity({ state: "on" })]), syncEpoch: 1 });
  expect(record(id).status).toBe("accepted");
});
test("confirmed and failed terminal results cannot be downgraded by late acknowledgements", () => {
  start();
  const confirmed = begin();
  jest.advanceTimersByTime(15_000);
  tracker.observe(snapshot([entity({ state: "on" })]));
  expect(record(confirmed).status).toBe("confirmed");
  tracker.acknowledge(confirmed, "scope-1", {
    kind: "rejected",
    message: "sensitive raw error",
  });
  expect(record(confirmed).status).toBe("confirmed");
  const failed = begin(entity({ state: "on" }), {
    kind: "setSwitch",
    on: false,
  });
  tracker.acknowledge(failed, "scope-1", {
    kind: "rejected",
    message: "sensitive raw error",
  });
  ack(failed);
  tracker.observe(snapshot());
  expect(record(failed)).toMatchObject({
    status: "failed",
    error: "Home Assistant reported an error.",
  });
  expect(commandMessage(record(failed))).toContain(
    "physical effect may still have occurred",
  );
});
test("a newer action supersedes older pending outcomes and old callbacks cannot confirm it", () => {
  start();
  const first = begin();
  tracker.acknowledge(first, "scope-1", { kind: "unknown", reason: "timeout" });
  const second = begin(entity(), { kind: "setSwitch", on: false });
  expect(record(first).status).toBe("superseded");
  tracker.observe(snapshot([entity({ state: "on" })]));
  ack(first);
  expect(record(first).status).toBe("superseded");
  expect(record(second).status).toBe("sending");
  ack(second);
  expect(record(second).status).toBe("accepted");
});
test.each(["removed", "recreated", "renamed", "ambiguous"])(
  "a binding invalidated by %s never confirms, even if the old identity comes back",
  (change) => {
    start();
    const id = begin();
    ack(id);
    const changed =
      change === "removed"
        ? []
        : change === "recreated"
          ? [entity({ key: "new-uuid", state: "on" })]
          : change === "renamed"
            ? [entity({ entityId: "switch.renamed", state: "on" })]
            : [entity(), entity({ entityId: "switch.duplicate" })];
    tracker.observe(snapshot(changed));
    expect(record(id)).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: "entity_changed",
    });
    tracker.observe({ ...snapshot([entity({ state: "on" })]), syncEpoch: 2 });
    expect(record(id).status).toBe("unconfirmed");
  },
);
test("alias promotion preserves the dispatch binding and latest-command lookup", () => {
  start();
  const id = begin();
  ack(id);
  const next = snapshot([entity({ key: "registry-uuid", state: "on" })]);
  next.identities.aliases["stable-lamp"] = "registry-uuid";
  tracker.observe(next);
  expect(record(id).status).toBe("confirmed");
  expect(tracker.latest("registry-uuid")?.id).toBe(id);
  expect(
    latestCommand(
      tracker.store.getState(),
      "ha:public",
      "registry-uuid",
      next.identities.aliases,
    )?.id,
  ).toBe(id);
});
test("profile/backend replacement clears records and rejects obsolete acknowledgements/observations", () => {
  start();
  const old = begin();
  tracker.start("ha:other", "scope-2");
  const before = tracker.store.getState();
  ack(old);
  expect(tracker.store.getState()).toBe(before);
  expect(latestCommand(before, "ha:public", "stable-lamp")).toBeUndefined();
  expect(before.records).toEqual([]);
});
test("same-profile backend replacement reconciles old sent outcomes, while the old acknowledgement stays inert", () => {
  start();
  const id = begin();
  tracker.start("ha:public", "scope-2");
  expect(record(id).status).toBe("unconfirmed");
  const before = tracker.store.getState();
  ack(id);
  expect(tracker.store.getState()).toBe(before);
  tracker.onStatus({ kind: "synchronizing" });
  tracker.observe({
    ...snapshot([entity({ state: "on" })]),
    sessionId: "second-backend",
    syncEpoch: 1,
  });
  expect(record(id).status).toBe("unconfirmed");
  tracker.onStatus(ready);
  expect(record(id)).toMatchObject({
    status: "confirmed",
    confirmation: { kind: "reconciled" },
  });
});
test("intentional disconnect qualifies cached outcomes and cancels timers; old callbacks are inert", () => {
  start();
  const id = begin();
  tracker.end(false);
  expect(record(id).status).toBe("unconfirmed");
  const before = tracker.store.getState();
  ack(id);
  tracker.observe(snapshot([entity({ state: "on" })]));
  expect(tracker.store.getState()).toBe(before);
  expect(jest.getTimerCount()).toBe(0);
});
test("assumed-state confirmation is explicit in ordinary and reconciled wording", () => {
  start();
  const id = begin();
  ack(id);
  tracker.observe(
    snapshot([entity({ state: "on", attributes: { assumed_state: true } })]),
  );
  expect(commandMessage(record(id))).toBe(
    "Confirmed (state assumed by the integration).",
  );
  start();
  const late = begin();
  tracker.onStatus({ kind: "reconnecting", lastReadyAt: null });
  tracker.observe({
    ...snapshot([entity({ state: "on", attributes: { assumed_state: true } })]),
    syncEpoch: 2,
  });
  tracker.onStatus(ready);
  expect(commandMessage(record(late))).toBe(
    "Home Assistant now shows On (state assumed by the integration).",
  );
});
test("hiding an unconfirmed lock does not clear its freshness fence, even after the late window expires", () => {
  tracker = new CommandTracker({ maxRecords: 1 });
  start([lock(), entity()]);
  const id = begin(lock(), { kind: "setLockState", state: "unlocked" });
  jest.advanceTimersByTime(45_000);
  tracker.dismiss(id);
  expect(visibleCommand(record(id))).toBeUndefined();
  expect(tracker.latest("door")?.status).toBe("unconfirmed");
  expect(tracker.hasFreshObservation(id)).toBe(false);
  jest.advanceTimersByTime(COMMAND_LATE_WINDOW_MS);
  expect(tracker.begin(entity(), on, config)).toMatchObject({
    kind: "refused",
    reason: "tracking_capacity",
  });
  tracker.observe({ ...snapshot([lock(), entity()]), syncEpoch: 2 });
  expect(tracker.hasFreshObservation(id)).toBe(true);
  expect(tracker.begin(entity(), on, config).kind).toBe("tracked");
});
test("failed/unconfirmed results clear on the next fresh observation without deleting tracking", () => {
  start();
  const id = begin();
  tracker.acknowledge(id, "scope-1", { kind: "rejected", message: "ignored" });
  tracker.observe(snapshot());
  expect(record(id).dismissed).toBe(false);
  tracker.observe(snapshot([entity({ lastUpdated: "new observation" })]));
  expect(record(id)).toMatchObject({ status: "failed", dismissed: true });
  const next = begin();
  tracker.acknowledge(next, "scope-1", { kind: "unknown", reason: "timeout" });
  tracker.observe(snapshot([entity({ lastUpdated: "later observation" })]));
  expect(record(next)).toMatchObject({
    status: "unconfirmed",
    dismissed: true,
  });
});
test("dismissal never hides sending/accepted and never falls back to an older result", () => {
  start();
  const id = begin();
  expect(tracker.dismiss(id)).toBe(false);
  ack(id);
  expect(tracker.dismiss(id)).toBe(false);
  jest.advanceTimersByTime(15_000);
  expect(tracker.dismiss(id)).toBe(true);
  expect(
    visibleCommand(
      latestCommand(tracker.store.getState(), "ha:public", "stable-lamp"),
    ),
  ).toBeUndefined();
});
test("the store refuses overflow rather than dropping another live command", () => {
  tracker = new CommandTracker({ maxRecords: 2 });
  const entities = [entity(), fan(), lock()];
  start(entities);
  begin();
  begin(fan(), { kind: "setFanOn", on: true });
  expect(
    tracker.begin(lock(), { kind: "setLockState", state: "unlocked" }, config),
  ).toMatchObject({ kind: "refused", reason: "tracking_capacity" });
  expect(tracker.store.getState().records).toHaveLength(2);
});
test("many superseding commands stay bounded and expire only the current dispatch", () => {
  start();
  for (let i = 0; i < 150; i++) begin();
  expect(tracker.store.getState().records).toHaveLength(100);
  expect(
    tracker.store.getState().records.filter((r) => r.status === "sending"),
  ).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(1);
  jest.advanceTimersByTime(15_000);
  expect(
    tracker.store.getState().records.filter((r) => r.status === "unconfirmed"),
  ).toHaveLength(1);
});
test("records are immutable code-free projections, not aliases to intent or raw attributes", () => {
  start([lock({ arbitrary_private_payload: "not a command field" })]);
  const id = begin(lock(), {
    kind: "setLockState",
    state: "unlocked",
    code: "0017",
  });
  const r = record(id);
  expect(Object.isFrozen(r)).toBe(true);
  expect(Object.isFrozen(r.desired.intent)).toBe(true);
  expect(JSON.stringify(tracker.store.getState())).not.toMatch(
    /0017|arbitrary_private_payload|not a command field/,
  );
  start([climate()]);
  const intent = {
    kind: "setClimateTarget",
    target: { temperature: 22 },
  } as const;
  const climateId = begin(climate(), intent);
  expect(record(climateId).desired.intent).not.toBe(intent);
  if (record(climateId).desired.intent.kind !== "setClimateTarget")
    throw new Error("Wrong intent");
  expect(Object.isFrozen(record(climateId).desired)).toBe(true);
});

test("revision index counts attribute reports/new epochs, ignores deep-equal or metadata-only copies, and keeps tombstone ordering", () => {
  const revisions = new ObservationRevisions();
  const read = () => revisions.get("stable-lamp")!.revision;
  revisions.observe(
    snapshot([entity({ attributes: { nested: { b: 2, a: 1 } } })]),
  );
  const first = read();
  revisions.observe(
    snapshot([
      entity({
        name: "Renamed display",
        areaId: "other-room",
        attributes: { nested: { a: 1, b: 2 } },
      }),
    ]),
  );
  expect(read()).toBe(first);
  revisions.observe(
    snapshot([entity({ attributes: { nested: { a: 1, b: 3 } } })]),
  );
  expect(read()).toBeGreaterThan(first);
  const changed = read();
  revisions.observe({
    ...snapshot([entity({ attributes: { nested: { a: 1, b: 3 } } })]),
    syncEpoch: 2,
  });
  expect(read()).toBeGreaterThan(changed);
  const epoch = read();
  revisions.observe({ ...snapshot([]), syncEpoch: 2 });
  expect(revisions.get("stable-lamp")).toBeUndefined();
  revisions.observe({ ...snapshot(), syncEpoch: 2 });
  expect(read()).toBeGreaterThan(epoch);
  expect(
    revisions.observe({ ...snapshot([entity({ state: "on" })]), syncEpoch: 1 }),
  ).toBe(false);
});
