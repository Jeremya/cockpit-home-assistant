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
