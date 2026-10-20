import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { localConnectionHandler } from "../lib/local-connection.mjs";

// Raw HTTP lets the test exercise a forged Host (fetch may normalize it).
function fetch(url, { body, ...options }) {
  return new Promise((resolve, reject) => {
    const req = request(url, options, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          headers: { get: (key) => response.headers[key] ?? null },
          text: async () => text,
          json: async () => JSON.parse(text),
        }),
      );
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("local connection restricts reads to the configured browser origin and request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maurice-local-connection-"));
  const tokenFile = join(directory, "token");
  await writeFile(tokenFile, "public-test-token", { mode: 0o600 });
  const appOrigin = "http://localhost:8082";
  let handler;
  const server = createServer((req, res) => void handler(req, res));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const host = `localhost:${server.address().port}`;
  handler = localConnectionHandler({
    appOrigin,
    host,
    haUrl: "http://127.0.0.1:8123",
    tokenFile,
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/local-connection`;
  const headers = {
    Host: host,
    Origin: appOrigin,
    "X-Maurice-Local-Connection": "1",
  };
  try {
    const response = await fetch(endpoint, { method: "POST", headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      appOrigin,
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      null,
    );
    assert.deepEqual(await response.json(), {
      url: "http://127.0.0.1:8123",
      token: "public-test-token",
    });

    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "http://localhost:9999",
      "http://localhost:8082.evil.example",
    ]) {
      const unsafeHeaders = { ...headers };
      if (origin === undefined) delete unsafeHeaders.Origin;
      else unsafeHeaders.Origin = origin;
      const blocked = await fetch(endpoint, {
        method: "POST",
        headers: unsafeHeaders,
      });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.headers.get("access-control-allow-origin"), null);
      assert(!(await blocked.text()).includes("public-test-token"));
    }
    for (const options of [
      { method: "GET", headers },
      { method: "POST", headers: { Host: host, Origin: appOrigin } },
      { method: "POST", headers: { ...headers, Host: "evil.example" } },
      {
        method: "POST",
        headers,
        body: '{"path":"/etc/passwd","url":"https://evil.example"}',
      },
    ]) {
      const blocked = await fetch(endpoint, options);
      assert.equal(blocked.status, 403);
      assert(!(await blocked.text()).includes("public-test-token"));
    }
    const preflight = await fetch(endpoint, {
      method: "OPTIONS",
      headers: {
        Host: host,
        Origin: appOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-maurice-local-connection",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(await preflight.text(), "");

    // Rotation is read at request time; no stale in-process credential cache.
    await writeFile(tokenFile, "public-rotated-token");
    const rotated = await fetch(endpoint, { method: "POST", headers });
    assert.equal((await rotated.json()).token, "public-rotated-token");

    for (const invalid of ["", "token with spaces", "x".repeat(16_385)]) {
      await writeFile(tokenFile, invalid);
      const unavailable = await fetch(endpoint, { method: "POST", headers });
      assert.equal(unavailable.status, 503);
      assert.equal(await unavailable.text(), "Local connection unavailable.");
    }
    await writeFile(tokenFile, "public-test-token");
    await chmod(tokenFile, 0o644);
    assert.equal(
      (await fetch(endpoint, { method: "POST", headers })).status,
      503,
    );
    await rm(tokenFile);
    assert.equal(
      (await fetch(endpoint, { method: "POST", headers })).status,
      503,
    );
    const other = join(directory, "other");
    await writeFile(other, "public-test-token", { mode: 0o600 });
    await symlink(other, tokenFile);
    assert.equal(
      (await fetch(endpoint, { method: "POST", headers })).status,
      503,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("local connection refuses destinations containing credentials or URL data", () => {
  for (const haUrl of [
    "file:///tmp/token",
    "https://user:pass@home.example",
    "https://home.example/path",
    "https://home.example/?token=value",
    "https://home.example/#token",
  ]) {
    assert.throws(() => localConnectionHandler({ haUrl }));
  }
});
