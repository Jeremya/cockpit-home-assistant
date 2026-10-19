import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertPublicPlan,
  copyPublicSource,
  publicEnvironment,
  run,
} from "../lib/public-build.mjs";
import { previewServer } from "../lib/preview-server.mjs";
import { checkPublicInputs } from "../check-public-inputs.mjs";

test("public staging excludes private/generated inputs and preserves the original", async () => {
  const temp = await mkdtemp(join(tmpdir(), "maurice-staging-test-"));
  try {
    const source = join(temp, "source");
    const target = join(temp, "target");
    for (const path of ["src/spatial", ".local", "assets", "patches"])
      await mkdir(join(source, path), { recursive: true });
    for (const [file, value] of Object.entries({
      "src/spatial/sample-plan.json": '{"source":"sample"}',
      "src/spatial/current-plan.json": "PRIVATE_PLAN_SENTINEL",
      ".local/home-plan.json": "PRIVATE_PLAN_SENTINEL",
      ".env.local": "EXPO_PUBLIC_SENTINEL=PRIVATE_ENV_SENTINEL",
      "assets/public.txt": "public",
      "patches/query-string.patch": "required bridge",
      "package.json": "{}",
    }))
      await writeFile(join(source, file), value);
    await copyPublicSource(source, target);
    assert.equal(
      await readFile(join(target, "patches/query-string.patch"), "utf8"),
      "required bridge",
    );
    for (const file of [
      ".env.local",
      ".local/home-plan.json",
      "src/spatial/current-plan.json",
    ])
      await assert.rejects(readFile(join(target, file)), { code: "ENOENT" });
    assert.equal(
      await readFile(join(source, "src/spatial/current-plan.json"), "utf8"),
      "PRIVATE_PLAN_SENTINEL",
    );
    await writeFile(
      join(target, "src/spatial/current-plan.json"),
      '{"source":"sample"}',
    );
    assert.equal((await assertPublicPlan(target)).source, "sample");
    await writeFile(
      join(target, "src/spatial/current-plan.json"),
      '{"source":"reference_image","privateName":"PRIVATE_PLAN_SENTINEL"}',
    );
    await assert.rejects(assertPublicPlan(target), (error) => {
      assert.match(error.message, /public sample/);
      assert(!JSON.stringify(error).includes("PRIVATE_PLAN_SENTINEL"));
      assert(!error.stack.includes("PRIVATE_PLAN_SENTINEL"));
      return true;
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public staging refuses a symlink to material outside the snapshot", async () => {
  const temp = await mkdtemp(join(tmpdir(), "maurice-symlink-test-"));
  try {
    await mkdir(join(temp, "source/assets"), { recursive: true });
    await writeFile(join(temp, "private.txt"), "private");
    await symlink(
      join(temp, "private.txt"),
      join(temp, "source/assets/linked.txt"),
    );
    await assert.rejects(
      copyPublicSource(join(temp, "source"), join(temp, "target")),
      /symlinks/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("public exports ignore inherited build, token and variant inputs", () => {
  const env = publicEnvironment(
    {
      PATH: "/bin",
      HOME: "/example",
      HA_TOKEN: "private",
      COCKPIT_PLAN_FILE: "private.json",
      COCKPIT_PLAN_OUTPUT: "elsewhere",
      MAURICE_VARIANT: "trial",
      EXPO_PUBLIC_SENTINEL: "private",
      EXPO_NO_DOTENV: "0",
      NODE_OPTIONS: "--require=private.cjs",
    },
    "/cache",
  );
  assert.equal(env.PATH, "/bin");
  assert.equal(env.HOME, "/example");
  assert.equal(env.COCKPIT_PLAN_FILE, "src/spatial/sample-plan.json");
  assert.equal(env.EXPO_NO_DOTENV, "1");
  for (const key of [
    "HA_TOKEN",
    "COCKPIT_PLAN_OUTPUT",
    "MAURICE_VARIANT",
    "EXPO_PUBLIC_SENTINEL",
    "NODE_OPTIONS",
  ])
    assert.equal(env[key], undefined);
  assert.equal(env.TMPDIR, "/cache");
});

test("preview serves direct SPA routes but returns 404 for missing assets and closes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "maurice-preview-test-"));
  let server;
  try {
    await writeFile(join(temp, "index.html"), "<html>public sample</html>");
    server = await previewServer(temp);
    for (const route of [
      "/house",
      "/device/demo-switch.living_lamp?key=public",
    ]) {
      const response = await fetch(server.origin + route, {
        headers: { accept: "text/html" },
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /public sample/);
    }
    assert.equal((await fetch(server.origin + "/missing.js")).status, 404);
    const origin = server.origin;
    await server.close();
    server = undefined;
    await assert.rejects(fetch(origin));
  } finally {
    await server?.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test("a stuck build child is terminated and reported as a failure", async () => {
  await assert.rejects(
    run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      timeout: 100,
    }),
    /timeout/,
  );
});

test("CI provenance rejects a missing ignore, tracked secret input and private prepared plan", async () => {
  const temp = await mkdtemp(join(tmpdir(), "maurice-provenance-test-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: temp, stdio: "pipe" });
  try {
    git("init", "--quiet");
    await mkdir(join(temp, "src/spatial"), { recursive: true });
    await writeFile(
      join(temp, "src/spatial/sample-plan.json"),
      '{"source":"sample"}',
    );
    await writeFile(
      join(temp, "src/spatial/current-plan.json"),
      '{"source":"sample"}',
    );
    const ignores =
      ".env*\n.local/\nsrc/spatial/current-plan.json\nartifacts/\n";
    await writeFile(join(temp, ".gitignore"), ignores);
    git("add", ".gitignore", "src/spatial/sample-plan.json");
    assert.equal((await checkPublicInputs(temp)).publicInputs, true);
    await writeFile(
      join(temp, ".gitignore"),
      ignores.replace("artifacts/\n", ""),
    );
    await assert.rejects(checkPublicInputs(temp), /must stay ignored/);
    await writeFile(join(temp, ".gitignore"), ignores);
    await writeFile(
      join(temp, "src/spatial/current-plan.json"),
      '{"source":"reference_image"}',
    );
    await assert.rejects(checkPublicInputs(temp), /public sample/);
    await writeFile(
      join(temp, "src/spatial/current-plan.json"),
      '{"source":"sample"}',
    );
    await writeFile(join(temp, ".env.local"), "PRIVATE_TEST_SENTINEL");
    await assert.rejects(
      checkPublicInputs(temp),
      /without private local inputs/,
    );
    git("add", "--force", ".env.local");
    await assert.rejects(checkPublicInputs(temp), /must not be tracked/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
