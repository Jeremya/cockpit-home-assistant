import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer } from "ws";
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
        authCount++;
        assert.equal(message.access_token, "protocol-proof-token");
        socket.send(
          JSON.stringify({ type: "auth_ok", ha_version: "2026.10.1" }),
        );
      } else if (message.type === "get_config")
        result({ unit_system: { temperature: "°F" } });
      else if (message.type === "subscribe_entities") {
        subscriptions++;
        result(null);
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
    console.log(
      "PASS: official HA client auth, compressed initial snapshots, immediate resync, removal, coalescing, ping and forced reconnect over a real WebSocket. No service calls sent.",
    );
  } finally {
    backend.stop();
    server.clients.forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch(() => {
  console.error("Protocol proof failed. No credentials are printed.");
  process.exitCode = 1;
});
