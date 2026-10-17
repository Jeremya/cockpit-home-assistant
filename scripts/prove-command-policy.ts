import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer, type WebSocket } from "ws";
import { SessionManager } from "../src/session/SessionManager";
import { Credentials } from "../src/services/credentials";
import { PreferencesStorage } from "../src/preferences/storage";
import { emptyPreferences } from "../src/preferences/types";
import { useCockpit } from "../src/core/store";
import { sampleHouse } from "../src/spatial/plans";
import { profileIdFor } from "../src/session/homeAssistant/url";
import { withDeadline } from "../src/session/homeAssistant/HomeAssistantBackend";
import type { CommandResult, DeferredResult } from "../src/commands/types";

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
function queued(value: CommandResult) {
  assert.equal(value.kind, "queued");
  if (value.kind !== "queued") throw new Error("Expected queued");
  return value;
}
function started(value: CommandResult | DeferredResult) {
  assert.equal(value.kind, "started");
  if (value.kind !== "started") throw new Error("Expected started");
  return value;
}
function waitFor(predicate: () => boolean) {
  if (predicate()) return Promise.resolve();
  let remove = () => {};
  const result = new Promise<void>((resolve) => {
    remove = useCockpit.subscribe(() => {
      if (predicate()) {
        remove();
        resolve();
      }
    });
  });
  return withDeadline(
    result,
    5000,
    new Error("Policy observation timed out"),
  ).finally(() => remove());
}

/** Exercise the actual public manager/facade and official client, never runtime's
 * persisted household session. Both origins and all credentials are fixtures. */
export async function proveCommandPolicy() {
  const servers: WebSocketServer[] = [];
  const raw = {
    "lock.policy": { s: "locked", a: { supported_features: 1 }, lc: 100 },
    "fan.policy": {
      s: "off",
      a: { supported_features: 49, percentage: 0, percentage_step: 10 },
      lc: 100,
    },
    "climate.policy": {
      s: "heat",
      a: {
        supported_features: 1,
        hvac_modes: ["heat", "cool"],
        min_temp: 7,
        max_temp: 35,
        target_temp_step: 0.5,
        temperature: 18,
      },
      lc: 100,
    },
  };
  const feeds: { socket: WebSocket; id: number }[] = [];
  const calls: {
    domain: string;
    service: string;
    target: { entity_id: string };
    service_data: Record<string, unknown>;
  }[] = [];
  let holdFan = false;
  let heldAck: (() => void) | undefined;
  let fanReceived: (() => void) | undefined;
  async function origin() {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    server.on("connection", (socket) => {
      socket.send(
        JSON.stringify({ type: "auth_required", ha_version: "2026.10.1" }),
      );
      socket.on("message", (buffer) => {
        const message = JSON.parse(buffer.toString());
        const result = (value: unknown) =>
          socket.send(
            JSON.stringify({
              id: message.id,
              type: "result",
              success: true,
              result: value,
            }),
          );
        if (message.type === "auth") {
          assert.equal(message.access_token, "policy-proof-token");
          socket.send(
            JSON.stringify({ type: "auth_ok", ha_version: "2026.10.1" }),
          );
        } else if (message.type === "get_config")
          result({ unit_system: { temperature: "°C" } });
        else if (message.type === "subscribe_entities") {
          feeds.push({ socket, id: message.id });
          result(null);
          socket.send(
            JSON.stringify({
              id: message.id,
              type: "event",
              event: { a: raw },
            }),
          );
        } else if (message.type === "ping")
          socket.send(JSON.stringify({ id: message.id, type: "pong" }));
        else if (message.type === "call_service") {
          const { domain, service, target, service_data } = message;
          calls.push({ domain, service, target, service_data });
          if (target.entity_id === "lock.policy")
            raw["lock.policy"].s = service === "unlock" ? "unlocked" : "locked";
          if (target.entity_id === "fan.policy" && holdFan) {
            heldAck = () => result(null);
            fanReceived?.();
          } else result(null);
        } else result([]);
      });
    });
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  }
  const local = new MemoryStorage();
  const preferences = new MemoryStorage();
  let storageId = 0;
  const manager = new SessionManager(
    new Credentials(local, new MemoryStorage(), () => `fixture-${++storageId}`),
    new PreferencesStorage(preferences),
  );
  try {
    const a = await origin();
    const b = await origin();
    // Keep the tested profiles public even in a workspace bundling a private plan.
    const profile = () => ({
      ...emptyPreferences(),
      spatial: {
        ...emptyPreferences().spatial,
        plan: sampleHouse,
        seededFrom: { planId: sampleHouse.id, revision: sampleHouse.revision },
      },
    });
    preferences.values.set(
      "prefs",
      JSON.stringify({
        schemaVersion: 2,
        profiles: {
          [profileIdFor(a)]: profile(),
          [profileIdFor(b)]: profile(),
        },
      }),
    );
    const settings = (url: string) => ({
      url,
      token: "policy-proof-token",
      allowInsecureHttp: true,
    });
    await manager.connect(settings(a));
    const lockKey = "entity:lock.policy";
    const fanKey = "entity:fan.policy";
    const climateKey = "entity:climate.policy";

    const unlocked = started(
      manager.commands.setLockState(lockKey, "unlocked"),
    );
    await unlocked.result;
    const pending = queued(manager.commands.setFanPercentage(fanKey, 20));
    const oldEpoch = useCockpit.getState().snapshot!.syncEpoch;
    const recovered = waitFor(
      () =>
        useCockpit.getState().status.kind === "ready" &&
        useCockpit.getState().snapshot!.syncEpoch > oldEpoch,
    );
    feeds.at(-1)!.socket.terminate();
    assert.deepEqual(await pending.completion, {
      kind: "cancelled",
      reason: "not_ready",
    });
    await recovered;
    assert.equal(calls.filter((call) => call.service === "unlock").length, 1);
    assert.equal(
      manager.commandStore
        .getState()
        .records.find((record) => record.id === unlocked.commandId)?.status,
      "confirmed",
    );

    holdFan = true;
    const received = new Promise<void>((resolve) => {
      fanReceived = resolve;
    });
    const discardedA = queued(manager.commands.setFanPercentage(fanKey, 30));
    const discardedB = queued(manager.commands.setFanPercentage(fanKey, 40));
    const firstValue = queued(manager.commands.setFanPercentage(fanKey, 70));
    assert.deepEqual(await discardedA.completion, {
      kind: "cancelled",
      reason: "superseded",
    });
    assert.deepEqual(await discardedB.completion, {
      kind: "cancelled",
      reason: "superseded",
    });
    const first = started(
      await withDeadline(
        firstValue.completion,
        2000,
        new Error("Debounce timed out"),
      ),
    );
    await withDeadline(received, 2000, new Error("Fan request not received"));
    const laterA = queued(manager.commands.setFanPercentage(fanKey, 50));
    const finalValue = queued(manager.commands.setFanPercentage(fanKey, 90));
    // Another entity completes its own 600 ms debounce while the fan is held.
    const climateValue = queued(
      manager.commands.setClimateTarget(climateKey, { temperature: 21 }),
    );
    const climateSent = started(
      await withDeadline(
        climateValue.completion,
        2000,
        new Error("Independent entity blocked"),
      ),
    );
    await climateSent.result;
    assert.deepEqual(
      calls
        .filter((call) => call.domain === "fan")
        .map((call) => call.service_data.percentage),
      [70],
    );
    assert.deepEqual(await laterA.completion, {
      kind: "cancelled",
      reason: "superseded",
    });
    holdFan = false;
    assert(heldAck);
    heldAck();
    await first.result;
    const last = started(
      await withDeadline(
        finalValue.completion,
        2000,
        new Error("Serialized target blocked"),
      ),
    );
    await last.result;
    assert.deepEqual(
      calls
        .filter((call) => call.domain === "fan")
        .map((call) => call.service_data.percentage),
      [70, 90],
    );

    const unsupported = queued(manager.commands.setFanPercentage(fanKey, 10));
    raw["fan.policy"].a.supported_features = 0;
    const updated = waitFor(
      () =>
        useCockpit.getState().snapshot!.entities["fan.policy"]?.attributes
          .supported_features === 0,
    );
    const active = feeds.at(-1)!;
    active.socket.send(
      JSON.stringify({
        id: active.id,
        type: "event",
        event: {
          c: { "fan.policy": { "+": { a: { supported_features: 0 } } } },
        },
      }),
    );
    await updated;
    assert.equal(
      (
        await withDeadline(
          unsupported.completion,
          2000,
          new Error("Capability recheck timed out"),
        )
      ).kind,
      "refused",
    );
    const captured = manager.commands.capture(climateKey);
    assert.equal(captured.kind, "captured");
    const dropped = queued(
      manager.commands.setClimateTarget(climateKey, { temperature: 23 }),
    );
    await manager.connect(settings(b));
    assert.deepEqual(await dropped.completion, {
      kind: "cancelled",
      reason: "session_changed",
    });
    if (captured.kind === "captured")
      assert.equal(
        manager.commands.setClimateTarget(captured.target, { temperature: 24 })
          .kind,
        "refused",
      );
    assert.equal(calls.length, 4);
    assert.equal(calls.filter((call) => call.service === "unlock").length, 1);
    return { fakeServices: calls.length };
  } finally {
    manager.disconnect();
    for (const server of servers) {
      server.clients.forEach((socket) => socket.terminate());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
