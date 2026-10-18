// Disposable, loopback-only HA-shaped server for installed-binary acceptance.
// It never forwards traffic, accepts real credentials or executes device services.
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.argv[2] ?? 0);
const state = {
  online: true,
  auth: true,
  version: "2026.10.1",
  temperature: "21.5",
};
const counters = { authentications: 0, snapshots: 0, serviceCalls: 0 };
const feeds = new Map();
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/_proof/status") {
    response.end(JSON.stringify({ state, counters }));
    return;
  }
  if (request.url !== "/_proof/config" || request.method !== "POST") {
    response.writeHead(404).end("{}");
    return;
  }
  try {
    let body = "";
    for await (const part of request) {
      body += part;
      if (body.length > 4096) throw new Error("Input too large");
    }
    const update = JSON.parse(body);
    for (const [key, value] of Object.entries(update)) {
      if (!(key in state) || typeof value !== typeof state[key])
        throw new Error("Invalid fixture configuration");
    }
    const reconnect = ["online", "auth", "version"].some(
      (key) => key in update && update[key] !== state[key],
    );
    Object.assign(state, update);
    if (reconnect) for (const socket of wss.clients) socket.terminate();
    else
      for (const [socket, ids] of feeds)
        for (const id of ids) {
          if (socket.readyState === 1)
            socket.send(
              JSON.stringify({
                id,
                type: "event",
                event: {
                  c: {
                    "sensor.trial_temperature": {
                      "+": { s: state.temperature, lc: Date.now() / 1000 },
                    },
                  },
                },
              }),
            );
        }
    response.end(JSON.stringify({ state, counters }));
  } catch {
    response.writeHead(400).end('{"error":"invalid fixture input"}');
  }
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (!state.online || request.url !== "/api/websocket") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) =>
    wss.emit("connection", client),
  );
});
wss.on("connection", (socket) => {
  const subscriptions = new Set();
  feeds.set(socket, subscriptions);
  let authenticated = false;
  socket.send(
    JSON.stringify({ type: "auth_required", ha_version: state.version }),
  );
  socket.on("close", () => feeds.delete(socket));
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const result = (value) =>
      socket.send(
        JSON.stringify({
          id: message.id,
          type: "result",
          success: true,
          result: value,
        }),
      );
    if (message.type === "auth") {
      counters.authentications++;
      if (state.auth && message.access_token === "maurice-trial-proof") {
        authenticated = true;
        socket.send(
          JSON.stringify({ type: "auth_ok", ha_version: state.version }),
        );
      } else {
        socket.send(
          JSON.stringify({
            type: "auth_invalid",
            message: "Trial fixture rejected authentication",
          }),
        );
        socket.close();
      }
      return;
    }
    if (!authenticated) {
      socket.close();
      return;
    }
    if (message.type === "ping")
      socket.send(JSON.stringify({ id: message.id, type: "pong" }));
    else if (message.type === "get_config")
      result({ unit_system: { temperature: "°C" } });
    else if (message.type === "config/area_registry/list")
      result([{ area_id: "trial-living", name: "Trial living room" }]);
    else if (message.type === "config/device_registry/list")
      result([
        {
          id: "trial-plug",
          name: "Trial plug",
          area_id: "trial-living",
          manufacturer: "TP-Link",
          model: "HS103",
          identifiers: [["tplink", "public-trial-fixture"]],
        },
      ]);
    else if (message.type === "config/entity_registry/list")
      result([
        {
          entity_id: "switch.trial_plug",
          id: "trial-switch-registry",
          unique_id: "trial-switch",
          device_id: "trial-plug",
          platform: "tplink",
          disabled_by: null,
          hidden_by: null,
        },
        {
          entity_id: "sensor.trial_temperature",
          id: "trial-temperature-registry",
          unique_id: "trial-temperature",
          area_id: "trial-living",
          platform: "demo",
          disabled_by: null,
          hidden_by: null,
        },
      ]);
    else if (message.type === "subscribe_entities") {
      result(null);
      subscriptions.add(message.id);
      counters.snapshots++;
      socket.send(
        JSON.stringify({
          id: message.id,
          type: "event",
          event: {
            a: {
              "switch.trial_plug": {
                s: "off",
                a: { friendly_name: "Trial plug" },
                lc: Date.now() / 1000,
              },
              "sensor.trial_temperature": {
                s: state.temperature,
                a: {
                  friendly_name: "Trial temperature",
                  device_class: "temperature",
                  unit_of_measurement: "°C",
                  state_class: "measurement",
                },
                lc: Date.now() / 1000,
              },
            },
          },
        }),
      );
    } else if (message.type === "unsubscribe_events") {
      subscriptions.delete(message.subscription);
      result(null);
    } else if (message.type === "call_service") {
      counters.serviceCalls++;
      socket.send(
        JSON.stringify({
          id: message.id,
          type: "result",
          success: false,
          error: {
            code: "service_not_allowed",
            message: "Trial fixture forbids all services",
          },
        }),
      );
    } else result(null);
  });
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    JSON.stringify({ port: server.address().port, fixtureOnly: true }),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    server.close(() => process.exit(0));
  });
