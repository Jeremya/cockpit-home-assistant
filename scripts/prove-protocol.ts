import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer, type WebSocket } from "ws";
import {
  HomeAssistantBackend,
  withDeadline,
} from "../src/session/homeAssistant/HomeAssistantBackend";
import type { HomeSnapshot } from "../src/core/types";

async function main() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  let subscriptions = 0;
  let serviceCalls = 0;
  let authCount = 0;
  let dropNextInitial = false;
  let hangNextInitial = false;
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
                  subscriptions === 1
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
    console.log(
      "PASS: official HA client auth, compressed snapshots, fresh resync, removal, coalescing, ping, forced reconnect, initial disconnect recovery, active-stream preservation after timeout and automatic sync retry over real WebSockets. No service calls sent.",
    );
  } finally {
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
