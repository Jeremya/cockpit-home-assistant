import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { WebSocket } from "ws";
import {
  CAMERA_FIXTURE_TOKEN,
  CAMERA_SCENARIOS,
  FIXTURE_PNG,
  startCameraFixture,
} from "../camera-fixture.mjs";

async function haSession(originA, token) {
  const socket = new WebSocket(
    `${originA.replace("http", "ws")}/api/websocket`,
  );
  const messages = [];
  socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  await once(socket, "open");
  const waitFor = async (predicate) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("fixture did not answer");
  };
  await waitFor((m) => m.type === "auth_required");
  socket.send(JSON.stringify({ type: "auth", access_token: token }));
  const auth = await waitFor(
    (m) => m.type === "auth_ok" || m.type === "auth_invalid",
  );
  let id = 0;
  return {
    auth: auth.type,
    async request(payload) {
      const number = ++id;
      socket.send(JSON.stringify({ id: number, ...payload }));
      return waitFor((m) => m.id === number);
    },
    close: () => socket.terminate(),
  };
}

test("camera fixture frame is a whole, decodable PNG", () => {
  assert.deepEqual(
    [...FIXTURE_PNG.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.equal(FIXTURE_PNG.readUInt32BE(16), 160);
  assert.equal(FIXTURE_PNG.readUInt32BE(20), 120);
  const idatLength = FIXTURE_PNG.readUInt32BE(33);
  assert.equal(FIXTURE_PNG.subarray(37, 41).toString("ascii"), "IDAT");
  const pixels = inflateSync(FIXTURE_PNG.subarray(41, 41 + idatLength));
  assert.equal(pixels.length, 120 * (1 + 160 * 3));
  // Large enough that the cut and stalled scenarios really stop mid-frame.
  assert(FIXTURE_PNG.length > 4096);
});

test(
  "camera fixture lists one camera per scenario and refuses other credentials",
  { timeout: 15_000 },
  async () => {
    const fixture = await startCameraFixture();
    try {
      const refused = await haSession(fixture.originA, "not-the-fixture");
      assert.equal(refused.auth, "auth_invalid");
      refused.close();

      const ha = await haSession(fixture.originA, CAMERA_FIXTURE_TOKEN);
      assert.equal(ha.auth, "auth_ok");
      const registry = await ha.request({
        type: "config/entity_registry/list",
      });
      assert.deepEqual(
        registry.result.map((e) => e.entity_id),
        CAMERA_SCENARIOS.map((s) => `camera.fixture_${s.id}`),
      );
      const service = await ha.request({
        type: "call_service",
        domain: "camera",
        service: "snapshot",
      });
      assert.equal(service.success, false);
      ha.close();

      // The camera proxy itself refuses a request without the credential.
      const anonymous = await fetch(
        `${fixture.originA}/api/camera_proxy/camera.fixture_image`,
      );
      assert.equal(anonymous.status, 401);
      const [entry] = fixture.requests();
      assert.equal(entry.origin, "A");
      assert.equal(entry.credential, false);
      assert.equal(entry.anyAuthorization, false);
      // The report never carries the token.
      const report = await (
        await fetch(`${fixture.originA}/_proof/camera`)
      ).text();
      assert(!report.includes(CAMERA_FIXTURE_TOKEN));
      assert.equal(JSON.parse(report).originBRequests, 0);

      // Origin B records any contact, so a leak cannot go unseen.
      await fetch(`${fixture.originB}/frames/other-origin.png`);
      assert.equal(fixture.report().originBRequests, 1);
    } finally {
      await fixture.close();
    }
  },
);

test(
  "camera fixture CLI prints its origins and adb reverse commands",
  { timeout: 15_000 },
  async () => {
    const child = spawn(process.execPath, ["scripts/camera-fixture.mjs"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const [bytes] = await once(child.stdout, "data");
      const printed = JSON.parse(String(bytes));
      assert.equal(printed.fixtureOnly, true);
      assert.match(printed.originA, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.match(printed.originB, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(printed.adbReverse.length, 2);
      assert(!String(bytes).includes(CAMERA_FIXTURE_TOKEN));
    } finally {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  },
);
