import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer, type WebSocket } from "ws";
import {
  HomeAssistantBackend,
  withDeadline,
} from "../src/session/homeAssistant/HomeAssistantBackend";
import type { HomeSnapshot } from "../src/core/types";
import type { ServiceCall } from "../src/session/types";
import { toServiceCall } from "../src/commands/serviceCalls";
import type { CommandIntent } from "../src/commands/types";
import { CommandTracker } from "../src/commands/CommandTracker";
import { proveCommandPolicy } from "./prove-command-policy";

async function main() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  let subscriptions = 0;
  let serviceCalls = 0;
  const serviceMessages: object[] = [];
  let authCount = 0;
  let dropNextInitial = false;
  let hangNextInitial = false;
  let trackerState: "off" | "on" | undefined;
  const tracker = new CommandTracker();
  const feeds: { socket: WebSocket; id: number }[] = [];
  server.on("connection", (socket) => {
    socket.send(
      JSON.stringify({ type: "auth_required", ha_version: "2026.10.1" }),
    );
    socket.on("message", (buffer) => {
      if (socket.readyState !== 1) return;
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
        authCount++;
        assert.equal(message.access_token, "protocol-proof-token");
        socket.send(
          JSON.stringify({ type: "auth_ok", ha_version: "2026.10.1" }),
        );
      } else if (message.type === "get_config")
        result({ unit_system: { temperature: "°F" } });
      else if (message.type === "subscribe_entities") {
        subscriptions++;
        feeds.push({ socket, id: message.id });
        result(null);
        if (dropNextInitial) {
          dropNextInitial = false;
          socket.terminate();
          return;
        }
        if (hangNextInitial) {
          hangNextInitial = false;
          return;
        }
        setTimeout(() => {
          if (socket.readyState !== 1) return;
          socket.send(
            JSON.stringify({
              id: message.id,
              type: "event",
              event: {
                a:
                  trackerState !== undefined
                    ? { "switch.tracker": { s: trackerState, a: {}, lc: 200 } }
                    : subscriptions === 1
                      ? {
                          "lock.front_door": {
                            s: "locked",
                            a: { friendly_name: "Front door" },
                            lc: 100,
                          },
                        }
                      : {},
              },
            }),
          );
        }, 30);
      } else if (message.type === "ping")
        socket.send(JSON.stringify({ id: message.id, type: "pong" }));
      else if (message.type === "call_service") {
        serviceCalls++;
        const { id: _id, ...payload } = message;
        serviceMessages.push(payload);
        if (message.target.entity_id === "switch.tracker") {
          trackerState = message.service === "turn_on" ? "on" : "off";
          // WS frames are ordered: publish turn_on before the service result.
          // turn_off is visible only in the next authoritative resync snapshot.
          if (trackerState === "on") {
            const feed = feeds.findLast((feed) => feed.socket === socket)!;
            socket.send(
              JSON.stringify({
                id: feed.id,
                type: "event",
                event: {
                  c: { "switch.tracker": { "+": { s: "on", lc: 200 } } },
                },
              }),
            );
          }
        }
        result(null);
      } else result([]);
    });
  });
  const backend = new HomeAssistantBackend(
    {
      url: `http://127.0.0.1:${address.port}`,
      token: "protocol-proof-token",
      allowInsecureHttp: true,
    },
    "proof",
  );
  const snapshots: HomeSnapshot[] = [];
  let interrupted: HomeAssistantBackend | undefined;
  backend.onSnapshot((snapshot) => snapshots.push(snapshot));
  try {
    await backend.start();
    assert.equal(backend.status.kind, "ready");
    assert(snapshots.at(-1)?.entities["lock.front_door"]);
    const one = backend.resync();
    assert.equal(backend.resync(), one);
    assert.equal(backend.status.kind, "synchronizing");
    await one;
    assert.equal(subscriptions, 2);
    assert.deepEqual(snapshots.at(-1)?.entities, {});
    assert.equal(await backend.ping(1000), true);
    const recovered = new Promise<void>((resolve) => {
      const unsubscribe = backend.onStatus((status) => {
        if (status.kind === "ready") {
          unsubscribe();
          resolve();
        }
      });
    });
    backend.recover();
    await withDeadline(recovered, 5000, new Error("Reconnect timed out"));
    assert.equal(subscriptions, 3);
    assert.equal(serviceCalls, 0);
    assert.equal(authCount, 2);
    backend.stop();

    // Exercise interruption before the first state using the real client's
    // disconnect ordering, command rejection and transport retry loop.
    dropNextInitial = true;
    interrupted = new HomeAssistantBackend(
      {
        url: `http://127.0.0.1:${address.port}`,
        token: "protocol-proof-token",
        allowInsecureHttp: true,
      },
      "interrupted",
      { syncTimeout: 200 },
    );
    interrupted.onSnapshot((snapshot) => snapshots.push(snapshot));
    await withDeadline(
      interrupted.start(),
      5000,
      new Error("Initial recovery timed out"),
    );
    assert.equal(interrupted.status.kind, "ready");
    assert.equal(authCount, 4);
    assert.equal(subscriptions, 5);

    const active = feeds.at(-1)!;
    const activeEpoch = snapshots.at(-1)!.syncEpoch;
    hangNextInitial = true;
    await assert.rejects(interrupted.resync(), { code: "sync_timeout" });
    const update = new Promise<void>((resolve) => {
      const remove = interrupted!.onSnapshot((snapshot) => {
        if (snapshot.entities["sensor.retained"]?.state === "42") {
          remove();
          resolve();
        }
      });
    });
    active.socket.send(
      JSON.stringify({
        id: active.id,
        type: "event",
        event: {
          a: { "sensor.retained": { s: "42", a: {}, lc: 100 } },
        },
      }),
    );
    await withDeadline(
      update,
      1000,
      new Error("Committed stream stopped updating"),
    );
    assert.equal(snapshots.at(-1)!.syncEpoch, activeEpoch);
    const retried = new Promise<void>((resolve) => {
      const remove = interrupted!.onStatus((status) => {
        if (status.kind === "ready") {
          remove();
          resolve();
        }
      });
    });
    await withDeadline(retried, 3000, new Error("Resync did not retry"));
    assert.equal(subscriptions, 7);
    assert.deepEqual(snapshots.at(-1)?.entities, {});
    assert.equal(serviceCalls, 0);
    // Fake services on this loopback server only. Compare every semantic mapping
    // against independent expected wire payloads; never use configured HA here.
    const commands: [CommandIntent, string, ServiceCall][] = [
      [
        { kind: "setLockState", state: "locked" },
        "lock.public",
        { domain: "lock", service: "lock", entityId: "lock.public" },
      ],
      [
        { kind: "setLockState", state: "unlocked", code: "0017" },
        "lock.public",
        {
          domain: "lock",
          service: "unlock",
          entityId: "lock.public",
          data: { code: "0017" },
        },
      ],
      [
        { kind: "setLockState", state: "open" },
        "lock.public",
        { domain: "lock", service: "open", entityId: "lock.public" },
      ],
      [
        { kind: "setClimateTarget", target: { temperature: 72 } },
        "climate.public",
        {
          domain: "climate",
          service: "set_temperature",
          entityId: "climate.public",
          data: { temperature: 72 },
        },
      ],
      [
        { kind: "setClimateTarget", target: { low: 69, high: 74 } },
        "climate.public",
        {
          domain: "climate",
          service: "set_temperature",
          entityId: "climate.public",
          data: { target_temp_low: 69, target_temp_high: 74 },
        },
      ],
      [
        { kind: "setHvacMode", mode: "heat_cool" },
        "climate.public",
        {
          domain: "climate",
          service: "set_hvac_mode",
          entityId: "climate.public",
          data: { hvac_mode: "heat_cool" },
        },
      ],
      [
        { kind: "setFanOn", on: true },
        "fan.public",
        { domain: "fan", service: "turn_on", entityId: "fan.public" },
      ],
      [
        { kind: "setFanOn", on: false },
        "fan.public",
        { domain: "fan", service: "turn_off", entityId: "fan.public" },
      ],
      [
        { kind: "setFanPercentage", percentage: 50 },
        "fan.public",
        {
          domain: "fan",
          service: "set_percentage",
          entityId: "fan.public",
          data: { percentage: 50 },
        },
      ],
      [
        { kind: "setFanPreset", preset: "sleep" },
        "fan.public",
        {
          domain: "fan",
          service: "set_preset_mode",
          entityId: "fan.public",
          data: { preset_mode: "sleep" },
        },
      ],
      [
        { kind: "setSwitch", on: true },
        "switch.public",
        { domain: "switch", service: "turn_on", entityId: "switch.public" },
      ],
      [
        { kind: "setSwitch", on: false },
        "switch.public",
        { domain: "switch", service: "turn_off", entityId: "switch.public" },
      ],
    ];
    for (const [intent, entityId, expected] of commands) {
      assert.deepEqual(toServiceCall(intent, entityId), expected);
      assert.deepEqual(
        await interrupted.callService(toServiceCall(intent, entityId)),
        { kind: "accepted" },
      );
      assert.deepEqual(serviceMessages.at(-1), {
        type: "call_service",
        domain: expected.domain,
        service: expected.service,
        target: { entity_id: expected.entityId },
        service_data: expected.data ?? {},
      });
    }
    assert.equal(serviceCalls, 12);
    tracker.start("ha:protocol-fixture", "command-proof");
    tracker.onStatus(interrupted.status);
    let current = snapshots.at(-1)!;
    let freshBeforeReady = false;
    interrupted.onSnapshot((snapshot) => {
      tracker.observe(snapshot);
      current = snapshot;
      if (
        snapshot.entities["switch.tracker"]?.state === "off" &&
        interrupted!.status.kind === "synchronizing"
      ) {
        freshBeforeReady = true;
        assert.notEqual(
          tracker.store.getState().records.at(-1)?.status,
          "confirmed",
        );
      }
    });
    interrupted.onStatus((status) => tracker.onStatus(status));
    trackerState = "off";
    const seeded = new Promise<void>((resolve) => {
      const remove = interrupted!.onSnapshot((snapshot) => {
        if (snapshot.entities["switch.tracker"]) {
          remove();
          resolve();
        }
      });
    });
    const feed = feeds.at(-1)!;
    feed.socket.send(
      JSON.stringify({
        id: feed.id,
        type: "event",
        event: { a: { "switch.tracker": { s: "off", a: {}, lc: 200 } } },
      }),
    );
    await withDeadline(
      seeded,
      1000,
      new Error("Command fixture seed timed out"),
    );
    const startCommand = (on: boolean) => {
      const entity = current.entities["switch.tracker"]!;
      const intent = { kind: "setSwitch", on } as const;
      const tracked = tracker.begin(entity, intent, current.config);
      assert.equal(tracked.kind, "tracked");
      if (tracked.kind !== "tracked") throw new Error("Command refused");
      return {
        id: tracked.commandId,
        call: toServiceCall(intent, entity.entityId),
      };
    };
    const firstCommand = startCommand(true);
    const firstAck = await interrupted.callService(firstCommand.call);
    assert.equal(current.entities["switch.tracker"]!.state, "on");
    assert.equal(tracker.store.getState().records.at(-1)?.status, "sending");
    tracker.acknowledge(firstCommand.id, "command-proof", firstAck);
    assert.equal(tracker.store.getState().records.at(-1)?.status, "confirmed");

    const secondCommand = startCommand(false);
    tracker.acknowledge(
      secondCommand.id,
      "command-proof",
      await interrupted.callService(secondCommand.call),
    );
    assert.equal(tracker.store.getState().records.at(-1)?.status, "accepted");
    const commandRecovered = new Promise<void>((resolve) => {
      const remove = interrupted!.onStatus((status) => {
        if (status.kind === "ready") {
          remove();
          resolve();
        }
      });
    });
    interrupted.recover();
    assert.equal(
      tracker.store.getState().records.at(-1)?.status,
      "unconfirmed",
    );
    await withDeadline(
      commandRecovered,
      5000,
      new Error("Command reconciliation timed out"),
    );
    assert(freshBeforeReady);
    assert.equal(tracker.store.getState().records.at(-1)?.status, "confirmed");
    assert.equal(
      tracker.store.getState().records.at(-1)?.confirmation?.kind,
      "reconciled",
    );
    assert.equal(serviceCalls, 14);
    const policy = await proveCommandPolicy();
    assert.equal(policy.fakeServices, 4);
    console.log(
      "PASS: official HA client auth/recovery, 12 exact service mappings, pre-ack observations, snapshot-before-ready outcomes and C03 through the actual manager: one unlock across reconnect, debounce, serialization, independent entities, capability/profile cancellation (18 fake services total). Loopback only; no physical device or configured HA was contacted.",
    );
  } finally {
    tracker.end(true);
    backend.stop();
    interrupted?.stop();
    server.clients.forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch(() => {
  console.error("Protocol proof failed. No credentials are printed.");
  process.exitCode = 1;
});
