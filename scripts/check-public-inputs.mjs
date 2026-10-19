import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertPublicPlan } from "./lib/public-build.mjs";

export async function checkPublicInputs(root) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0");
  assert(
    !tracked.some((file) =>
      /(^|\/)\.env[^/]*$|^\.local\/|^src\/spatial\/current-plan\.json$|^(android|ios|artifacts)\/|\.(apk|aab|jks|keystore|p12|pem)$/.test(
        file,
      ),
    ),
    "Private/generated inputs or build artifacts must not be tracked",
  );
  const ignored = [
    ".env.local",
    ".local/home-plan.json",
    ".local/ha-token",
    "src/spatial/current-plan.json",
    "artifacts/ui/report.json",
  ];
  const actualIgnored = execFileSync(
    "git",
    ["check-ignore", "--no-index", ...ignored],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n");
  assert.deepEqual(
    actualIgnored.sort(),
    [...ignored].sort(),
    "Every private/generated input and artifact path must stay ignored",
  );
  for (const file of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    ".local/home-plan.json",
    ".local/ha-token",
    ".local/trial/signing",
  ]) {
    let exists = true;
    try {
      await access(resolve(root, file));
    } catch (error) {
      if (error.code === "ENOENT") exists = false;
      else throw error;
    }
    assert(
      !exists,
      "Public CI requires a clean checkout without private local inputs",
    );
  }
  return {
    publicInputs: true,
    privateInputsIgnored: true,
    plan: await assertPublicPlan(root),
  };
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await checkPublicInputs(process.cwd())));
