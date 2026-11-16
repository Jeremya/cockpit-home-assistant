import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

// Agent worktrees live under .claude/ inside the checkout; Jest must not run
// their copies of the suite, and the exclusion must not hide a tracked test.
const root = resolve(import.meta.dirname, "../..");
const jest = join(root, "node_modules/.bin/jest");

const listTests = () =>
  execFileSync(jest, ["--listTests"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((path) => relative(root, path))
    .sort();

const trackedTests = () =>
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((path) => /(^|\/)__tests__\/.*\.test\.tsx?$/.test(path))
    .sort();

test("Jest discovers exactly the tracked suites, never an agent worktree", () => {
  const agentDir = join(root, ".claude");
  const ownsAgentDir = !existsSync(agentDir);
  const probe = join(agentDir, "worktrees", `jest-probe-${process.pid}`);
  const probeTest = join(probe, "src", "__tests__", "probe.test.ts");
  mkdirSync(join(probe, "src", "__tests__"), { recursive: true });
  writeFileSync(join(probe, "package.json"), '{"name":"home-cockpit"}\n');
  writeFileSync(probeTest, 'test("probe", () => {});\n');
  try {
    const listed = listTests();
    assert.ok(
      !listed.some((path) => path.startsWith(".claude/")),
      "a .claude/ worktree suite was discovered",
    );
    assert.deepEqual(listed, trackedTests());
  } finally {
    rmSync(ownsAgentDir ? agentDir : probe, { recursive: true, force: true });
  }
});
