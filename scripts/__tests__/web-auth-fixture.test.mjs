import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_USERS,
  redactSecrets,
  runAuthConformance,
  startWebAuthFixture,
} from "../lib/web-auth-fixture.mjs";

test("the public fixture follows the Home Assistant 2026.10 auth contract", async () => {
  const fixture = await startWebAuthFixture();
  try {
    const report = await runAuthConformance({
      origin: fixture.origin,
      username: PUBLIC_USERS[0].username,
      password: PUBLIC_USERS[0].password,
    });
    assert.equal(report.haVersion, "2026.10.1");
    assert.ok(report.checks.length >= 12);
    assert.ok(report.checks.every((check) => check.ok));
    const stats = fixture.stats();
    assert.equal(stats.activeRefreshTokens, 0);
    assert.equal(stats.pendingCodes, 0);
    assert.equal(stats.codesExchanged, 1);
  } finally {
    await fixture.close();
  }
});

test("the fixture binds only to loopback and never accepts unknown users", async () => {
  const fixture = await startWebAuthFixture();
  try {
    assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const flow = await fetch(`${fixture.origin}/auth/login_flow`, {
      method: "POST",
      body: JSON.stringify({
        client_id: "http://localhost:8094/",
        handler: ["homeassistant", null],
        redirect_uri: "http://localhost:8094/auth-callback",
      }),
    }).then((response) => response.json());
    const step = await fetch(
      `${fixture.origin}/auth/login_flow/${flow.flow_id}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: "http://localhost:8094/",
          username: "household-user",
          password: "anything",
        }),
      },
    ).then((response) => response.json());
    assert.equal(step.type, "form");
    assert.deepEqual(step.errors, { base: "invalid_auth" });
    assert.equal(fixture.stats().codesIssued, 0);
  } finally {
    await fixture.close();
  }
});

test("issued tokens are recognizable public fixture values", async () => {
  const fixture = await startWebAuthFixture();
  try {
    const tokens = await fixture.issueTokens({
      clientId: "http://localhost:8094/",
      username: PUBLIC_USERS[1].username,
    });
    assert.match(tokens.access_token, /^maurice-fixture-access-[0-9a-f]{32}$/);
    assert.match(
      tokens.refresh_token,
      /^maurice-fixture-refresh-[0-9a-f]{64}$/,
    );
  } finally {
    await fixture.close();
  }
});

test("conformance failures never print token values", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmaXh0dXJlIn0.c2lnbmF0dXJlLXZhbHVl";
  const message = redactSecrets(
    `Expected 'maurice-fixture-refresh-${"ab".repeat(32)}' to equal '${jwt}' (status 400)`,
  );
  assert.equal(
    message,
    "Expected '<redacted>' to equal '<redacted>' (status 400)",
  );
});

function socketSession(origin, accessToken) {
  const socket = new WebSocket(
    `${origin.replace(/^http/, "ws")}/api/websocket`,
  );
  const replies = new Map();
  const events = [];
  let id = 0;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.type === "auth_required")
        socket.send(
          JSON.stringify({ type: "auth", access_token: accessToken }),
        );
      else if (message.type === "auth_ok") resolve(message);
      else if (message.type === "auth_invalid")
        reject(new Error("auth_invalid"));
      else if (message.type === "event") events.push(message);
      else replies.get(message.id)?.(message);
    });
  });
  const send = (message) =>
    new Promise((resolve) => {
      const current = ++id;
      replies.set(current, resolve);
      socket.send(JSON.stringify({ id: current, ...message }));
    });
  const closed = new Promise((resolve) =>
    socket.addEventListener("close", resolve),
  );
  return { ready, send, events, closed, close: () => socket.close() };
}

test("the fixture serves the snapshot messages Maurice reads, and no service", async () => {
  const fixture = await startWebAuthFixture();
  const tokens = fixture.issueTokens({
    clientId: "http://localhost:8094/",
    username: PUBLIC_USERS[0].username,
  });
  const session = socketSession(fixture.origin, tokens.access_token);
  try {
    assert.equal((await session.ready).ha_version, "2026.10.1");
    const config = await session.send({ type: "get_config" });
    assert.deepEqual(config.result.unit_system, { temperature: "°C" });
    for (const type of [
      "config/entity_registry/list",
      "config/device_registry/list",
      "config/area_registry/list",
    ])
      assert.ok((await session.send({ type })).result.length > 0, type);
    const subscribed = await session.send({ type: "subscribe_entities" });
    assert.equal(subscribed.success, true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(Object.keys(session.events[0].event.a).length >= 2);
    const call = await session.send({
      type: "call_service",
      domain: "switch",
      service: "turn_on",
      target: { entity_id: "switch.fixture_plug" },
    });
    assert.equal(call.success, false);
    assert.equal(fixture.stats().serviceCalls, 1);
  } finally {
    session.close();
    await fixture.close();
  }
});

test("the fixture version and token lifetime are configurable", async () => {
  const fixture = await startWebAuthFixture({
    version: "2026.9.0",
    accessTokenLifetime: 1,
  });
  try {
    const tokens = fixture.issueTokens({
      clientId: "http://localhost:8094/",
      username: PUBLIC_USERS[0].username,
    });
    assert.equal(tokens.expires_in, 1);
    const session = socketSession(fixture.origin, tokens.access_token);
    assert.equal((await session.ready).ha_version, "2026.9.0");
    session.close();
  } finally {
    await fixture.close();
  }
});

test("the authorize page mirrors HA: login flow with the challenge, then code and state", async () => {
  const fixture = await startWebAuthFixture();
  try {
    const response = await fetch(
      `${fixture.origin}/auth/authorize?response_type=code&client_id=x`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const page = await response.text();
    assert.match(page, /code_challenge/);
    assert.match(page, /location\.assign/);
    assert.doesNotMatch(page, /maurice-fixture-(access|refresh)-/);
  } finally {
    await fixture.close();
  }
});

test("dropping the sockets forces clients to reconnect, and only answers POST", async () => {
  const fixture = await startWebAuthFixture();
  const tokens = fixture.issueTokens({
    clientId: "http://localhost:8094/",
    username: PUBLIC_USERS[0].username,
  });
  const session = socketSession(fixture.origin, tokens.access_token);
  try {
    await session.ready;
    const refused = await fetch(`${fixture.origin}/_fixture/drop-sockets`);
    assert.equal(refused.ok, false);
    const dropped = await fetch(`${fixture.origin}/_fixture/drop-sockets`, {
      method: "POST",
    });
    assert.deepEqual(await dropped.json(), { dropped: 1 });
    await session.closed;
    // Tokens stay valid: only the transport ended.
    assert.equal(fixture.stats().activeRefreshTokens, 1);
  } finally {
    session.close();
    await fixture.close();
  }
});
