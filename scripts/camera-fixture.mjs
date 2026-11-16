// Public, loopback-only camera transport fixture (I01).
//
// Two origins. Origin A is shaped like the part of Home Assistant the camera
// path needs: the WebSocket handshake, one camera entity per scenario and
// `GET /api/camera_proxy/<entity_id>`. Origin B is a second server that a
// redirect points to; it must never be contacted, and therefore never receive
// the credential. Each origin records what it received itself, so the result
// never depends on the client's own account.
//
// The same scenarios serve the Node proof (`scripts/prove-camera.ts`) and the
// supervised Android recipe (`docs/stage0/2026-11-16-next-wave-D-camera.md`),
// so a native observation can be compared line by line with the Node one.
//
// Nothing here forwards traffic, executes a service or accepts a real
// credential. The bearer is a public fixture constant; it is never printed,
// only compared.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { WebSocketServer } from "ws";

export const CAMERA_FIXTURE_TOKEN = "maurice-camera-proof";
const BEARER = `Bearer ${CAMERA_FIXTURE_TOKEN}`;

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A real, decodable RGB PNG with horizontal bands, so a frame cut in transit
 * is visibly different from a whole one. Deterministic: same bytes every run.
 */
export function fixturePng(width = 160, height = 120) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = [];
  // Deterministic pseudo-random noise (LCG) keeps the compressed body large
  // enough that cutting it in half really stops mid-frame.
  let seed = 0x5eed;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 16) & 0x1f;
  };
  for (let y = 0; y < height; y++) {
    const band = Math.floor((y / height) * 4);
    const rgb = [
      [0x2e, 0x5e, 0x4e],
      [0xc8, 0x8a, 0x3c],
      [0x3c, 0x5a, 0x8c],
      [0xe6, 0xe0, 0xd2],
    ][band];
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const n = noise();
      row[1 + x * 3] = rgb[0] ^ n;
      row[2 + x * 3] = rgb[1] ^ n;
      row[3 + x * 3] = rgb[2] ^ n;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const FIXTURE_PNG = fixturePng();

/**
 * One camera entity per transport behaviour. `contract` is the result the
 * service promises (`docs/design/camera-images.md`, failure mapping) and what
 * the Node proof asserts; `card` is what the detail must show. `android` names
 * what only an installed build can establish.
 */
export const CAMERA_SCENARIOS = [
  {
    id: "image",
    name: "Fixture camera 1 image",
    contract: "image",
    card: "the banded frame and a Fetched time",
    android:
      "Expo arrayBuffer() resolves the frame, base64 encoding works on Hermes, the data URI renders",
  },
  {
    id: "same_redirect",
    name: "Fixture camera 2 same-origin redirect",
    contract: "image",
    card: "the banded frame",
    android:
      "redirect: manual is honoured; the second hop on origin A carries the credential",
  },
  {
    id: "cross_redirect",
    name: "Fixture camera 3 cross-origin redirect",
    contract: "error:cross_origin_redirect",
    card: "the cross-origin refusal message",
    android:
      "origin B receives no request at all (not merely no credential): OkHttp did not follow",
  },
  {
    id: "not_image",
    name: "Fixture camera 4 not an image",
    contract: "error:not_an_image",
    card: "the not-an-image message",
    android: "content-type is read from the native headers",
  },
  {
    id: "undecodable",
    name: "Fixture camera 5 undecodable bytes",
    contract: "image",
    card: "the could-not-be-loaded placeholder, no Fetched time (Image onError)",
    android: "Image onError fires for an undecodable data URI",
  },
  {
    id: "truncated",
    name: "Fixture camera 6 body cut in transit",
    contract: "error:network",
    card: "the could-not-be-loaded placeholder",
    android:
      "suspected defect: Expo may resolve arrayBuffer() with the partial bytes; observe whether a partial frame is drawn",
  },
  {
    id: "stalled",
    name: "Fixture camera 7 body stalled",
    contract: "error:timeout",
    card: "the timeout message about 15 s after the request",
    android:
      "the single 15 s budget ends the retrieval and the transport closes the connection",
  },
  {
    id: "no_answer",
    name: "Fixture camera 8 no answer",
    contract: "error:timeout",
    card: "the timeout message about 15 s after the request",
    android: "the budget covers a request whose headers never arrive",
  },
  {
    id: "unauthorized",
    name: "Fixture camera 9 unauthorized",
    contract: "error:unauthorized",
    card: "the unauthorized message",
    android: "status is read from the native response",
  },
];

const entityIdFor = (scenario) => `camera.fixture_${scenario.id}`;
const STALL_MS = 60_000;

function startHttp(handler, port, host) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

/**
 * Starts both origins. `port` 0 picks free ports. `ha: false` serves only the
 * HTTP scenarios (the Node proof); `ha: true` adds the WebSocket the app needs.
 */
export async function startCameraFixture({
  host = "127.0.0.1",
  portA = 0,
  portB = 0,
  ha = true,
} = {}) {
  /** Every request each origin received, in order; never the token itself. */
  const log = [];
  const sockets = new Set();
  let nextRequest = 0;

  function record(origin, req, res) {
    const entry = {
      n: ++nextRequest,
      origin,
      path: req.url ?? "",
      credential: req.headers.authorization === BEARER,
      anyAuthorization: req.headers.authorization !== undefined,
      startedAt: Date.now(),
      closedAfterMs: null,
      completed: false,
    };
    log.push(entry);
    res.on("finish", () => {
      entry.completed = true;
    });
    res.on("close", () => {
      entry.closedAfterMs = Date.now() - entry.startedAt;
    });
    return entry;
  }

  const serverB = await startHttp(
    (req, res) => {
      record("B", req, res);
      res.writeHead(200, { "content-type": "image/png" });
      res.end(FIXTURE_PNG);
    },
    portB,
    host,
  );
  const originB = `http://${host}:${serverB.address().port}`;

  const half = Math.floor(FIXTURE_PNG.length / 2);
  const proxy = "/api/camera_proxy/";

  function serveCamera(req, res) {
    const id = decodeURIComponent((req.url ?? "").slice(proxy.length));
    const scenario = CAMERA_SCENARIOS.find((s) => entityIdFor(s) === id);
    if (!scenario) {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== BEARER) {
      res.writeHead(401).end();
      return;
    }
    switch (scenario.id) {
      case "image":
        res.writeHead(200, { "content-type": "image/png" });
        res.end(FIXTURE_PNG);
        return;
      case "same_redirect":
        res.writeHead(302, { location: "/frames/same-origin.png" });
        res.end();
        return;
      case "cross_redirect":
        res.writeHead(302, { location: `${originB}/frames/other-origin.png` });
        res.end();
        return;
      case "not_image":
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>not a frame</body></html>");
        return;
      case "undecodable":
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(Buffer.from("these bytes are not a JPEG frame"));
        return;
      case "truncated":
        // The first half of a real frame, then the connection drops.
        res.writeHead(200, {
          "content-type": "image/png",
          "content-length": String(FIXTURE_PNG.length),
        });
        res.write(FIXTURE_PNG.subarray(0, half), () => res.socket?.destroy());
        return;
      case "stalled": {
        // Headers and the first half, then nothing until the client gives up.
        res.writeHead(200, {
          "content-type": "image/png",
          "content-length": String(FIXTURE_PNG.length),
        });
        res.write(FIXTURE_PNG.subarray(0, half));
        const guard = setTimeout(() => res.socket?.destroy(), STALL_MS);
        res.on("close", () => clearTimeout(guard));
        return;
      }
      case "no_answer": {
        const guard = setTimeout(() => res.socket?.destroy(), STALL_MS);
        res.on("close", () => clearTimeout(guard));
        return;
      }
      case "unauthorized":
        res.writeHead(401).end();
        return;
    }
  }

  const serverA = await startHttp(
    (req, res) => {
      if (req.url === "/_proof/camera") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(report()));
        return;
      }
      if (req.url === "/_proof/camera/reset" && req.method === "POST") {
        log.length = 0;
        res.setHeader("content-type", "application/json");
        res.end("{}");
        return;
      }
      record("A", req, res);
      if (req.url?.startsWith(proxy)) serveCamera(req, res);
      else if (req.url === "/frames/same-origin.png") {
        if (req.headers.authorization !== BEARER) res.writeHead(401).end();
        else {
          res.writeHead(200, { "content-type": "image/png" });
          res.end(FIXTURE_PNG);
        }
      } else res.writeHead(404).end();
    },
    portA,
    host,
  );
  const originA = `http://${host}:${serverA.address().port}`;

  if (ha) attachHomeAssistant(serverA);
  serverA.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  serverB.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  function report() {
    return {
      fixtureOnly: true,
      originA,
      originB,
      originBRequests: log.filter((e) => e.origin === "B").length,
      requests: log.map((e) => ({ ...e })),
    };
  }

  return {
    originA,
    originB,
    entityIdFor,
    requests: () => log.map((e) => ({ ...e })),
    report,
    reset: () => {
      log.length = 0;
    },
    async close() {
      for (const s of sockets) s.destroy();
      await Promise.all(
        [serverA, serverB].map((s) => new Promise((r) => s.close(() => r()))),
      );
    },
  };
}

/** The minimal Home Assistant WebSocket surface the app needs to list cameras. */
function attachHomeAssistant(server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/api/websocket") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) =>
      wss.emit("connection", client),
    );
  });
  server.on("close", () => {
    for (const client of wss.clients) client.terminate();
    wss.close();
  });
  wss.on("connection", (socket) => {
    let authenticated = false;
    socket.send(
      JSON.stringify({ type: "auth_required", ha_version: "2026.10.1" }),
    );
    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.close();
        return;
      }
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
        if (message.access_token === CAMERA_FIXTURE_TOKEN) {
          authenticated = true;
          socket.send(
            JSON.stringify({ type: "auth_ok", ha_version: "2026.10.1" }),
          );
        } else {
          socket.send(
            JSON.stringify({
              type: "auth_invalid",
              message: "Camera fixture rejected authentication",
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
      else if (message.type === "auth/current_user")
        result({
          id: "camera-fixture-user",
          name: "Camera fixture user",
          is_owner: true,
          is_admin: true,
          credentials: [],
          mfa_modules: [],
        });
      else if (message.type === "config/area_registry/list")
        result([{ area_id: "fixture-cameras", name: "Fixture cameras" }]);
      else if (message.type === "config/device_registry/list") result([]);
      else if (message.type === "config/entity_registry/list")
        result(
          CAMERA_SCENARIOS.map((s) => ({
            entity_id: entityIdFor(s),
            id: `fixture-${s.id}-registry`,
            unique_id: `fixture-${s.id}`,
            area_id: "fixture-cameras",
            platform: "demo",
            disabled_by: null,
            hidden_by: null,
          })),
        );
      else if (message.type === "subscribe_entities") {
        result(null);
        const now = Date.now() / 1000;
        socket.send(
          JSON.stringify({
            id: message.id,
            type: "event",
            event: {
              a: Object.fromEntries(
                CAMERA_SCENARIOS.map((s) => [
                  entityIdFor(s),
                  { s: "idle", a: { friendly_name: s.name }, lc: now },
                ]),
              ),
            },
          }),
        );
      } else if (message.type === "call_service")
        socket.send(
          JSON.stringify({
            id: message.id,
            type: "result",
            success: false,
            error: {
              code: "service_not_allowed",
              message: "Camera fixture forbids all services",
            },
          }),
        );
      else result(null);
    });
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

// CLI: `node scripts/camera-fixture.mjs --port-a 8124 --port-b 8125`
async function cli() {
  const fixture = await startCameraFixture({
    portA: Number(argument("--port-a") ?? 0),
    portB: Number(argument("--port-b") ?? 0),
    ha: true,
  });
  const portOf = (origin) => new URL(origin).port;
  console.log(
    JSON.stringify({
      fixtureOnly: true,
      originA: fixture.originA,
      originB: fixture.originB,
      token: "public fixture token, see CAMERA_FIXTURE_TOKEN",
      adbReverse: [
        `adb reverse tcp:${portOf(fixture.originA)} tcp:${portOf(fixture.originA)}`,
        `adb reverse tcp:${portOf(fixture.originB)} tcp:${portOf(fixture.originB)}`,
      ],
      status: `${fixture.originA}/_proof/camera`,
    }),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => void fixture.close().then(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  cli().catch(() => {
    console.error("Camera fixture failed to start.");
    process.exitCode = 1;
  });
