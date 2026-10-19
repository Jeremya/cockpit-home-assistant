import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

process.umask(0o077);
const root = process.cwd();
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const allowed = new Set(["--build-number", "--private-plan"]);
for (let i = 0; i < args.length; i += 2)
  assert(
    allowed.has(args[i]) && args[i + 1] && !args[i + 1].startsWith("--"),
    "Unknown or missing trial option",
  );
const build = Number(option("--build-number", "1001"));
assert(
  Number.isSafeInteger(build) && build >= 1001 && build <= 2100000000,
  "Invalid build number",
);
const privatePlan = option("--private-plan");
const privacy = privatePlan ? "private" : "sample";
const output = join(root, ".local/trial", privacy, `build-${build}`);
await mkdir(output, { recursive: true });
// Read the developer's tool paths only. No .env, secrets or private plan is copied implicitly.
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
for (const key of Object.keys(environment)) {
  if (/^(EXPO_PUBLIC_|COCKPIT_PLAN_|MAURICE_)/.test(key))
    delete environment[key];
}
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const dirty = !!execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
const workspace = await mkdtemp(join(tmpdir(), "maurice-trial-"));
const cache = await mkdtemp(join(tmpdir(), "maurice-trial-cache-"));
const env = {
  ...environment,
  CI: "1",
  NODE_ENV: "production",
  NPM_CONFIG_INCLUDE: "dev",
  EXPO_NO_DOTENV: "1",
  EXPO_OFFLINE: "1",
  TMPDIR: cache,
  MAURICE_VARIANT: "trial",
  MAURICE_TRIAL_BUILD_NUMBER: String(build),
  MAURICE_TRIAL_PLAN: privacy,
  MAURICE_SOURCE_REVISION: revision.slice(0, 12) + (dirty ? "-dirty" : ""),
  COCKPIT_PLAN_FILE: "src/spatial/sample-plan.json",
};
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const digest = createHash("sha256");
for (const file of [...new Set(tracked)].sort()) {
  if (!(
    /^(app|assets|src|scripts|plugins|patches)\//.test(file) ||
    /^(app\.config\.js|app\.json|package(-lock)?\.json|tsconfig\.json|babel\.config\.js|metro\.config\.js|jest\.config\.js|eslint\.config\.js)$/.test(
      file,
    )
  ))
    continue;
  if (
    file === "src/spatial/current-plan.json" ||
    file.split("/").some((part) => part.startsWith("."))
  )
    continue;
  const data = await readFile(join(root, file));
  digest.update(file + "\0").update(data);
  await mkdir(dirname(join(workspace, file)), { recursive: true });
  await writeFile(join(workspace, file), data);
}
const sourceSha256 = digest.digest("hex");
async function run(name, executable, argv, cwd = workspace, childEnv = env) {
  console.log(`Trial: ${name}`);
  const log = createWriteStream(join(output, `${name}.log`));
  const child = spawn(executable, argv, {
    cwd,
    env: childEnv,
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
        : reject(new Error(`${name} failed; inspect its ignored log`));
    });
  });
}
try {
  const java = join(environment.JAVA_HOME, "bin", "java");
  await run("java-version", java, ["-version"]);
  assert(
    /version "17\./.test(
      await readFile(join(output, "java-version.log"), "utf8"),
    ),
    "Trial builds require JDK 17",
  );
  await run("install", "npm", [
    "ci",
    "--include=dev",
    "--no-audit",
    "--no-fund",
  ]);
  await run("decoder-proof", process.execPath, [
    "--import",
    "tsx",
    "scripts/prove-dependencies.ts",
  ]);
  if (privatePlan) {
    const input = await readFile(resolve(privatePlan));
    await mkdir(join(workspace, ".local"));
    await writeFile(join(workspace, ".local/trial-plan.json"), input);
    env.COCKPIT_PLAN_FILE = ".local/trial-plan.json";
  }
  await run("prepare-plan", "npm", ["run", "house:prepare"]);
  if (!privatePlan) {
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(workspace, "src/spatial/current-plan.json"),
          "utf8",
        ),
      ),
      JSON.parse(
        await readFile(join(workspace, "src/spatial/sample-plan.json"), "utf8"),
      ),
      "Public build must prepare the sample exactly",
    );
  }
  await run("prebuild", "npx", [
    "--no-install",
    "expo",
    "prebuild",
    "--platform",
    "android",
    "--no-install",
  ]);
  const signingDir = join(root, ".local/trial/signing");
  const keyPath = join(signingDir, "maurice-trial.p12");
  const credentialsPath = join(signingDir, "credentials.json");
  await mkdir(signingDir, { recursive: true });
  let credentials;
  try {
    credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Never replace an existing key if its password record is missing.
    try {
      await readFile(keyPath);
      throw new Error(
        "Existing trial key has no password record; restore it instead of rotating the key",
      );
    } catch (missing) {
      if (missing.code !== "ENOENT") throw missing;
    }
    credentials = { password: randomBytes(32).toString("hex") };
    const keyEnv = { ...env, MAURICE_SIGNING_PASSWORD: credentials.password };
    await run(
      "create-trial-key",
      join(environment.JAVA_HOME, "bin", "keytool"),
      [
        "-genkeypair",
        "-noprompt",
        "-storetype",
        "PKCS12",
        "-keystore",
        keyPath,
        "-alias",
        "maurice-trial",
        "-storepass:env",
        "MAURICE_SIGNING_PASSWORD",
        "-keypass:env",
        "MAURICE_SIGNING_PASSWORD",
        "-keyalg",
        "RSA",
        "-keysize",
        "3072",
        "-validity",
        "3650",
        "-dname",
        "CN=Maurice Internal Trial",
      ],
      workspace,
      keyEnv,
    );
    await writeFile(credentialsPath, JSON.stringify(credentials) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await chmod(keyPath, 0o600);
  }
  assert(
    typeof credentials.password === "string" &&
      credentials.password.length >= 32,
    "Invalid local trial signing record",
  );
  await run(
    "assemble",
    "./gradlew",
    [
      ":app:assembleRelease",
      "-PreactNativeArchitectures=arm64-v8a",
      "--max-workers=4",
      "--console=plain",
      "--no-daemon",
    ],
    join(workspace, "android"),
    {
      ...env,
      MAURICE_SIGNING_STORE: keyPath,
      MAURICE_SIGNING_PASSWORD: credentials.password,
    },
  );
  const apk = join(output, `maurice-trial-${build}-arm64.apk`);
  await copyFile(
    join(workspace, "android/app/build/outputs/apk/release/app-release.apk"),
    apk,
  );
  const tools = (await readdir(join(sdk, "build-tools")))
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  assert(tools, "Android build-tools not installed");
  const aapt = join(sdk, "build-tools", tools, "aapt");
  const badging = execFileSync(aapt, ["dump", "badging", apk], {
    encoding: "utf8",
  });
  const manifest = execFileSync(
    aapt,
    ["dump", "xmltree", apk, "AndroidManifest.xml"],
    { encoding: "utf8" },
  );
  const signature = execFileSync(
    join(sdk, "build-tools", tools, "apksigner"),
    ["verify", "--verbose", "--print-certs", apk],
    { encoding: "utf8", env },
  );
  assert(
    badging.includes("name='com.larrabee.homecockpit.trial'") &&
      badging.includes(`versionCode='${build}'`),
    "Wrong APK identity",
  );
  assert(
    !badging.includes("application-debuggable") &&
      !manifest.includes(
        "expo.modules.devlauncher.launcher.DevLauncherActivity",
      ),
    "Development launcher/debugging must be absent",
  );
  assert(
    !manifest.includes('"homecockpit"') &&
      !manifest.includes('"exp+home-cockpit"'),
    "Trial must have an isolated deep-link scheme",
  );
  assert(manifest.includes('"mauricetrial"'), "Trial scheme missing");
  assert(
    /android:allowBackup[^\n]*0x0/.test(manifest),
    "Trial backup must be disabled",
  );
  assert(
    /android:usesCleartextTraffic[^\n]*0xffffffff/.test(manifest),
    "Explicit local HTTP support missing",
  );
  assert(
    !/SYSTEM_ALERT_WINDOW|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/.test(
      badging,
    ),
    "Unnecessary development/storage permission present",
  );
  assert(
    signature.includes("CN=Maurice Internal Trial"),
    "Wrong signing certificate",
  );
  const bundle = execFileSync(
    "unzip",
    ["-p", apk, "assets/index.android.bundle"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  assert(
    bundle.subarray(0, 8).equals(Buffer.from("c61fbc03c103191f", "hex")),
    "Embedded Hermes bytecode missing",
  );
  await writeFile(join(output, "manifest-tree.txt"), manifest);
  await writeFile(join(output, "signature.txt"), signature);
  const report = {
    schema: 1,
    variant: "internal-trial",
    package: "com.larrabee.homecockpit.trial",
    versionName: `0.1.0-trial.${build - 1000}`,
    versionCode: build,
    sourceRevision: revision,
    dirtySource: dirty,
    sourceSha256,
    plan: privacy,
    privateArtifact: !!privatePlan,
    architecture: "arm64-v8a",
    apkSha256: createHash("sha256")
      .update(await readFile(apk))
      .digest("hex"),
    signingCertificateSha256:
      /Signer #1 certificate SHA-256 digest: (\S+)/.exec(signature)?.[1],
    features: {
      powerControl: "enrolled-tplink-hs103",
      defaultPowerAuthorization: "denied",
      spatial3d: false,
    },
    checks: {
      embeddedReleaseBundle: true,
      debuggable: false,
      developmentLauncher: false,
      backup: false,
      localHttp: true,
      spatial3d: false,
    },
    acceptance: "candidate; installed-device validation required",
  };
  await writeFile(
    join(output, "build.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Trial candidate built: ${apk}\nAPK SHA-256: ${report.apkSha256}\nPlan: ${privacy}; native acceptance is separate.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Trial build failed");
  console.error(`Build logs remain local: ${output}`);
  process.exitCode = 1;
}
