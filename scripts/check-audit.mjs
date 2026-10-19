import { spawnSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { assessAudit, fileHash } from "./lib/dependency-audit.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--strict"))
  throw new Error("Unknown audit option");
const strict = args.includes("--strict");
const audit = spawnSync("npm", ["audit", "--package-lock-only", "--json"], {
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 4 * 1024 * 1024,
});
let assessment;
try {
  const data = JSON.parse(audit.stdout);
  if (audit.error) throw new Error("Audit unavailable");
  let policy, hashes, latestVersions;
  if (!strict) {
    policy = JSON.parse(
      await readFile(
        new URL("./dependency-audit-policy.json", import.meta.url),
      ),
    );
    hashes = Object.fromEntries(
      await Promise.all(
        Object.keys(policy.reviewedFiles).map(async (file) => {
          const content = await readFile(file).catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          return [file, content === null ? null : fileHash(content)];
        }),
      ),
    );
    latestVersions = Object.fromEntries(
      policy.exceptions.map((entry) => {
        if (!/^[a-z][a-z0-9-]*$/.test(entry.package))
          throw new Error("Invalid policy package");
        const latest = spawnSync(
          "npm",
          ["view", `${entry.package}@latest`, "version", "--json"],
          { encoding: "utf8", timeout: 20_000, maxBuffer: 16 * 1024 },
        );
        if (latest.error || latest.status !== 0)
          throw new Error("Registry unavailable");
        return [entry.package, JSON.parse(latest.stdout)];
      }),
    );
  }
  assessment = assessAudit(data, {
    npmExitCode: audit.status,
    policy,
    hashes,
    latestVersions,
    strict,
  });
} catch {
  assessment = {
    result: "failed",
    reason: "audit_or_reviewed_inputs_unavailable",
    npmExitCode: audit.status,
  };
}
const report = {
  schema: 2,
  mode: strict ? "strict" : "reviewed-tooling",
  ...assessment,
};
await mkdir("artifacts/dependencies", { recursive: true });
await writeFile(
  `artifacts/dependencies/report${strict ? "-strict" : ""}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
const summary = `Dependency policy: ${report.result}. npm audit exit: ${report.npmExitCode}; affected entries: ${report.counts?.total ?? "unknown"}. ${report.expiresOn ? `Tooling exceptions expire ${report.expiresOn}.` : ""} See docs/stage0/dependency-maintenance.md.\n`;
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## ${summary}\n`);
if (report.result === "passed-with-exceptions" && process.env.GITHUB_ACTIONS)
  console.log(
    `::warning::Reviewed tooling vulnerabilities remain. Exceptions expire ${report.expiresOn}; strict release audit still fails.`,
  );
console.log(JSON.stringify(report));
if (report.result === "failed") process.exitCode = 1;
