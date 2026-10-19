import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const directories = ["app", "assets", "src", "scripts", "plugins", "patches"];
const files = [
  "package.json",
  "package-lock.json",
  "app.config.js",
  "app.json",
  "tsconfig.json",
  "babel.config.js",
  "metro.config.js",
  "eslint.config.js",
  "jest.config.js",
];

// Never consult the developer's .env or reuse an already prepared personal plan.
export function publicEnvironment(environment, cache) {
  const clean = { ...environment };
  for (const key of Object.keys(clean)) {
    if (
      /^(EXPO_|COCKPIT_|MAURICE_|HA_|HOME_ASSISTANT_|NODE_OPTIONS$|BABEL_ENV$)/i.test(
        key,
      )
    )
      delete clean[key];
  }
  return {
    ...clean,
    CI: "1",
    NODE_ENV: "production",
    NPM_CONFIG_INCLUDE: "dev",
    EXPO_NO_DOTENV: "1",
    EXPO_OFFLINE: "1",
    COCKPIT_PLAN_FILE: "src/spatial/sample-plan.json",
    TMPDIR: cache,
    TMP: cache,
    TEMP: cache,
  };
}

export async function copyPublicSource(source, destination) {
  async function copy(relative, optional = false) {
    if (relative === "src/spatial/current-plan.json") return;
    if (relative.split("/").some((part) => part.startsWith("."))) return;
    let stat;
    try {
      stat = await lstat(join(source, relative));
    } catch (error) {
      if (optional && error.code === "ENOENT") return;
      throw error;
    }
    assert(!stat.isSymbolicLink(), "Public staging refuses source symlinks");
    if (stat.isDirectory()) {
      for (const entry of await readdir(join(source, relative)))
        await copy(`${relative}/${entry}`);
    } else {
      assert(stat.isFile(), "Public staging requires regular files");
      await mkdir(dirname(join(destination, relative)), { recursive: true });
      await copyFile(join(source, relative), join(destination, relative));
    }
  }
  for (const directory of directories) await copy(directory, true);
  for (const file of files) await copy(file, true);
}

export async function assertPublicPlan(root) {
  const sample = await readFile(join(root, "src/spatial/sample-plan.json"));
  const generated = await readFile(join(root, "src/spatial/current-plan.json"));
  let plan, prepared;
  try {
    plan = JSON.parse(sample);
    prepared = JSON.parse(generated);
  } catch {
    throw new Error("Public plan JSON could not be validated; values omitted");
  }
  assert.equal(plan.source, "sample", "Expected public sample provenance");
  assert(
    isDeepStrictEqual(prepared, plan),
    "Prepared plan must equal the public sample; values omitted",
  );
  return {
    source: "sample",
    sha256: createHash("sha256").update(sample).digest("hex"),
  };
}

// Own the entire child process group, including Metro workers spawned by Expo.
export async function run(
  executable,
  args,
  { cwd, env, timeout = 300_000, signal } = {},
) {
  signal?.throwIfAborted();
  const child = spawn(executable, args, {
    cwd,
    env,
    stdio: "inherit",
    detached: true,
  });
  const stop = (signal = "SIGTERM") => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* Already exited. */
    }
  };
  let timedOut = false;
  let force;
  const terminate = () => {
    stop();
    force ??= setTimeout(() => stop("SIGKILL"), 2000);
  };
  const deadline = setTimeout(() => {
    timedOut = true;
    terminate();
  }, timeout);
  const abort = () => terminate();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0 && !timedOut && !signal?.aborted
          ? resolve()
          : reject(
              new Error(
                `Public check child failed: ${executable} (${timedOut ? "timeout" : code})`,
              ),
            ),
      );
    });
  } finally {
    clearTimeout(deadline);
    clearTimeout(force);
    signal?.removeEventListener("abort", abort);
    stop("SIGKILL");
  }
}
