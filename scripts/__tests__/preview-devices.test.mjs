import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../preview-devices.mjs", import.meta.url),
);

async function freePort() {
  const server = createServer().listen(0, "localhost");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function preview(args) {
  // No --local-ha: this test never reaches the developer's .local/ha-token.
  const child = spawn(process.execPath, [script, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  const exited = once(child, "exit");
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("preview timeout")),
      10_000,
    );
    child.stdout.on("data", () => {
      if (stdout.includes("Maurice responsive preview:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    exited.then(([code]) => {
      clearTimeout(timer);
      reject(new Error(`preview exited ${code}: ${stderr}`));
    });
  });
  ready.catch(() => {});
  return { child, ready, exited, output: () => ({ stdout, stderr }) };
}

test("preview serves only its assets, keeps local loading off without the flag and stops cleanly", async () => {
  const app = createServer((request, response) =>
    response.end("public fake app"),
  );
  app.listen(0, "localhost");
  await once(app, "listening");
  const appOrigin = `http://localhost:${app.address().port}`;
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const run = preview(["--app", appOrigin, "--port", String(port)]);
  try {
    await run.ready;
    assert.doesNotMatch(run.output().stdout, /Local token loading enabled/);

    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.match(
      page.headers.get("content-security-policy"),
      new RegExp(`frame-src ${appOrigin};.*frame-ancestors 'none'`),
    );
    const html = await page.text();
    assert(html.includes(`src="${appOrigin}/"`));
    assert(!html.includes("__MAURICE_APP_ORIGIN__"));
    assert.equal(
      await (await fetch(`${appOrigin}/`)).text(),
      "public fake app",
    );

    for (const [path, type] of [
      ["/preview.css", "text/css"],
      ["/preview.js?reload=1", "text/javascript"],
    ]) {
      const asset = await fetch(origin + path);
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get("content-type"), `${type}; charset=utf-8`);
      assert((await asset.text()).length > 0);
      const head = await fetch(origin + path, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
    }

    for (const path of ["/missing", "/preview/index.html", "/../package.json"])
      assert.equal((await fetch(origin + path)).status, 404);
    assert.equal((await fetch(`${origin}/`, { method: "POST" })).status, 404);
    const local = await fetch(`${origin}/local-connection`, {
      method: "POST",
      headers: { Origin: appOrigin, "X-Maurice-Local-Connection": "1" },
    });
    assert.equal(local.status, 404);
    assert.equal(local.headers.get("access-control-allow-origin"), null);

    run.child.kill("SIGTERM");
    const [code, signal] = await run.exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    await assert.rejects(fetch(`${origin}/`));
  } finally {
    if (run.child.exitCode === null) run.child.kill("SIGKILL");
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  }
});

test("preview refuses non-loopback or ambiguous app origins and ports before listening", async () => {
  const port = await freePort();
  for (const args of [
    ["--app", "http://example.com:8082"],
    ["--app", "http://10.0.0.2:8082"],
    ["--app", "http://0.0.0.0:8082"],
    ["--app", "http://user:pass@localhost:8082"],
    ["--app", "http://localhost:8082/path"],
    ["--app", "http://localhost:8082/?token=value"],
    ["--app", "file:///tmp/app"],
    ["--app", `http://localhost:${port}`],
    ["--port", "80"],
  ]) {
    const run = preview(
      args.includes("--port") ? args : [...args, "--port", String(port)],
    );
    await assert.rejects(run.ready, /preview exited 1/);
    assert.match(run.output().stderr, /loopback app origin/);
    assert.doesNotMatch(run.output().stdout, /responsive preview/);
  }
});
