import { spawnSync } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";

// Deliberately fail on findings. R01's assessment is documentation, not a suppression.
const audit = spawnSync("npm", ["audit", "--package-lock-only", "--json"], {
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 4 * 1024 * 1024,
});
let report;
try {
  const data = JSON.parse(audit.stdout);
  if (audit.error || data.error || !data.metadata?.vulnerabilities)
    throw new Error("Audit unavailable");
  const advisories = new Map();
  for (const dependency of Object.values(data.vulnerabilities ?? {})) {
    for (const via of dependency.via ?? []) {
      if (typeof via !== "object") continue;
      advisories.set(via.source, {
        package: via.name,
        severity: via.severity,
        title: via.title,
        url: via.url,
      });
    }
  }
  report = {
    schema: 1,
    result:
      audit.status === 0 && data.metadata.vulnerabilities.total === 0
        ? "passed"
        : "failed",
    npmExitCode: audit.status,
    counts: data.metadata.vulnerabilities,
    advisories: [...advisories.values()],
  };
} catch {
  report = {
    schema: 1,
    result: "failed",
    reason:
      "npm audit did not produce a complete assessment; inspect the npm/registry configuration",
    npmExitCode: audit.status,
  };
}
await mkdir("artifacts/dependencies", { recursive: true });
await writeFile(
  "artifacts/dependencies/report.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Dependency audit: ${report.result}\n\n${report.counts?.total ?? "Unknown"} affected package entries. Findings remain a failing check; see R01 in docs/stage0/dependency-maintenance.md.\n\n`,
  );
}
console.log(JSON.stringify(report));
if (report.result !== "passed") process.exitCode = 1;
