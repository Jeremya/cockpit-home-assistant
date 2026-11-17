// Public, reproducible spatial proof APK: exact commit, public sample plan,
// default variant (3D on), separate `.s02proof` package with debug signing.
// It never replaces Trial (`.trial`) or the development client.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proofGradleInit, PROOF_PACKAGE } from "./lib/proof-android.mjs";

process.umask(0o077);
const root = process.cwd();
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 2 && args[0] === "--revision"),
  "Usage: npm run build:proof:android [-- --revision <commit>]",
);
const revision = execFileSync(
  "git",
  ["rev-parse", "--verify", `${args[1] ?? "HEAD"}^{commit}`],
  { encoding: "utf8" },
).trim();

const environment = { ...process.env };
try {
  for (const line of (await readFile(join(root, ".env.local"), "utf8")).split(
    /\r?\n/,
  )) {
    const match =
      /^(JAVA_HOME|ANDROID_HOME|ANDROID_USER_HOME|GRADLE_USER_HOME)=(.*)$/.exec(
        line,
      );
    if (match && !environment[match[1]])
      environment[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
assert(
  environment.JAVA_HOME &&
    (environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT),
  "Set JAVA_HOME (JDK 17) and ANDROID_HOME",
);
const sdk = environment.ANDROID_HOME ?? environment.ANDROID_SDK_ROOT;
for (const key of Object.keys(environment))
  if (/^(EXPO_PUBLIC_|COCKPIT_PLAN_|MAURICE_)/.test(key))
    delete environment[key];

const output = join(root, ".local/proof", revision.slice(0, 12));
await mkdir(output, { recursive: true });
// The source is the committed tree only: no working-tree edits, no ignored files.
const workspace = await mkdtemp(join(tmpdir(), "maurice-proof-"));
const cache = await mkdtemp(join(tmpdir(), "maurice-proof-cache-"));
execFileSync(
  "sh",
  [
    "-c",
    'git archive --format=tar "$1" | tar -x -C "$2"',
    "sh",
    revision,
    workspace,
  ],
  { stdio: "inherit" },
);
const env = {
  ...environment,
  CI: "1",
  NODE_ENV: "production",
  NPM_CONFIG_INCLUDE: "dev",
  EXPO_NO_DOTENV: "1",
  EXPO_OFFLINE: "1",
  TMPDIR: cache,
  // Existing inspector gate used by the spatial probes (CockpitSceneView).
  EXPO_PUBLIC_S01_PROOF: "1",
  COCKPIT_PLAN_FILE: "src/spatial/sample-plan.json",
};

async function run(name, executable, argv, cwd = workspace) {
  console.log(`Proof: ${name}`);
  const log = createWriteStream(join(output, `${name}.log`));
  const child = spawn(executable, argv, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  await new Promise((accept, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      log.end();
      code === 0
        ? accept()
        : reject(new Error(`${name} failed; inspect ${output}/${name}.log`));
    });
  });
}

try {
  await run("java-version", join(environment.JAVA_HOME, "bin", "java"), [
    "-version",
  ]);
  assert(
    /version "17\./.test(
      await readFile(join(output, "java-version.log"), "utf8"),
    ),
    "Proof builds require JDK 17",
  );
  await run("install", "npm", [
    "ci",
    "--include=dev",
    "--no-audit",
    "--no-fund",
  ]);
  assert.deepEqual(
    JSON.parse(
      await readFile(join(workspace, "src/spatial/current-plan.json"), "utf8"),
    ),
    JSON.parse(
      await readFile(join(workspace, "src/spatial/sample-plan.json"), "utf8"),
    ),
    "Proof build must prepare the public sample exactly",
  );
  await run("prebuild", "npx", [
    "--no-install",
    "expo",
    "prebuild",
    "--platform",
    "android",
    "--no-install",
  ]);
  const init = join(output, "proof.gradle");
  await writeFile(init, proofGradleInit());
  await run(
    "assemble",
    "./gradlew",
    [
      ":app:assembleS02Proof",
      "-I",
      init,
      "-PreactNativeArchitectures=arm64-v8a",
      "--max-workers=4",
      "--console=plain",
      "--no-daemon",
    ],
    join(workspace, "android"),
  );

  const apk = join(output, `maurice-proof-${revision.slice(0, 12)}-arm64.apk`);
  await copyFile(
    join(workspace, "android/app/build/outputs/apk/s02Proof/app-s02Proof.apk"),
    apk,
  );
  const tools = (await readdir(join(sdk, "build-tools")))
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  assert(tools, "Android build-tools not installed");
  const badging = execFileSync(
    join(sdk, "build-tools", tools, "aapt"),
    ["dump", "badging", apk],
    { encoding: "utf8" },
  );
  const signature = execFileSync(
    join(sdk, "build-tools", tools, "apksigner"),
    ["verify", "--verbose", "--print-certs", apk],
    { encoding: "utf8", env },
  );
  assert(badging.includes(`name='${PROOF_PACKAGE}'`), "Wrong APK identity");
  assert(
    !badging.includes("application-debuggable"),
    "Proof must not be debuggable",
  );
  const entries = execFileSync("unzip", ["-Z1", apk], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).split("\n");
  const embeddedModels = entries.filter((entry) =>
    /^assets\/www\.bundle\/assets\/assets\/furniture\/[^/]+\.glb$/.test(entry),
  );
  const sourceModels = (
    await readdir(join(workspace, "assets/furniture"))
  ).filter((name) => name.endsWith(".glb"));
  assert.equal(
    embeddedModels.length,
    sourceModels.length,
    "Every furniture GLB must be embedded in the DOM bundle",
  );
  const bundle = execFileSync(
    "unzip",
    ["-p", apk, "assets/index.android.bundle"],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  assert(
    bundle.subarray(0, 8).equals(Buffer.from("c61fbc03c103191f", "hex")),
    "Embedded Hermes bytecode missing",
  );
  const version = /versionName='([^']*)'/.exec(badging)?.[1];
  const versionCode = /versionCode='([^']*)'/.exec(badging)?.[1];
  const report = {
    schema: 1,
    variant: "default (spatial3d on), s02Proof build type",
    package: PROOF_PACKAGE,
    versionName: version,
    versionCode: Number(versionCode),
    sourceRevision: revision,
    source: "git archive of the commit; no working-tree or ignored files",
    plan: "sample",
    architecture: "arm64-v8a",
    gradle:
      ":app:assembleS02Proof (release optimisation, no minify/shrink, debug signing)",
    environment: {
      NODE_ENV: "production",
      EXPO_PUBLIC_S01_PROOF: "1",
      COCKPIT_PLAN_FILE: "src/spatial/sample-plan.json",
    },
    apkBytes: (await readFile(apk)).length,
    apkSha256: createHash("sha256")
      .update(await readFile(apk))
      .digest("hex"),
    signingCertificateSha256:
      /Signer #1 certificate SHA-256 digest: (\S+)/.exec(signature)?.[1],
    checks: {
      embeddedHermesBundle: true,
      debuggable: false,
      embeddedFurnitureModels: embeddedModels.length,
    },
    acceptance: "built only; installation and device recettes are separate",
  };
  await writeFile(
    join(output, "build.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Proof APK: ${apk}\nPackage: ${PROOF_PACKAGE}\nSource: ${revision}\nAPK SHA-256: ${report.apkSha256}\nFurniture models embedded: ${embeddedModels.length}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Proof build failed");
  console.error(`Build logs remain local: ${output}`);
  process.exitCode = 1;
}
