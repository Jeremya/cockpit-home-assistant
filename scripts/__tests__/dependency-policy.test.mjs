import assert from "node:assert/strict";
import { test } from "node:test";
import { assessAudit, auditGraphHash } from "../lib/dependency-audit.mjs";
import { assertRuntimeMap } from "../lib/runtime-dependencies.mjs";

const root = {
  source: 1,
  name: "braces",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  range: "<=3.0.3",
};
const fixture = () => ({
  vulnerabilities: {
    braces: {
      name: "braces",
      severity: "high",
      range: "<=3.0.3",
      via: [{ ...root }],
      nodes: ["node_modules/braces"],
      effects: ["micromatch"],
      fixAvailable: false,
    },
    micromatch: {
      name: "micromatch",
      severity: "high",
      range: "*",
      via: ["braces"],
      nodes: ["node_modules/micromatch"],
      effects: [],
      fixAvailable: false,
    },
  },
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 2,
      critical: 0,
      total: 2,
    },
  },
});
function context() {
  return {
    npmExitCode: 1,
    now: new Date("2026-10-19T12:00:00Z"),
    latestVersions: { braces: "3.0.3" },
    hashes: {
      "package-lock.json": "a".repeat(64),
      "app.config.js": "b".repeat(64),
    },
    policy: {
      schema: 1,
      scope: "private-household-tooling",
      reviewedOn: "2026-10-19",
      expiresOn: "2026-11-02",
      reviewedLatestVersions: { braces: "3.0.3" },
      reviewedFiles: {
        "package-lock.json": "a".repeat(64),
        "app.config.js": "b".repeat(64),
      },
      affectedGraphSha256: auditGraphHash(fixture()),
      exceptions: [
        {
          id: "GHSA-vfj7-8cjw-p6xm",
          package: "braces",
          severity: "high",
          range: "<=3.0.3",
          reason: "Reviewed build-only input",
          revisitWhen: "Dependency or input changes",
        },
      ],
    },
  };
}
test("approved tooling findings remain visible and strict mode still fails", () => {
  const data = fixture(),
    options = context();
  const result = assessAudit(data, options);
  assert.equal(result.result, "passed-with-exceptions");
  assert.equal(result.npmExitCode, 1);
  assert.equal(result.counts.high, 2);
  assert.equal(result.advisories[0].id, options.policy.exceptions[0].id);
  assert.equal(
    assessAudit(data, { ...options, strict: true }).reason,
    "strict_audit_findings",
  );
});
test("exceptions expire at midnight UTC without an environment or clock bypass", () => {
  const options = context();
  options.now = new Date("2026-11-01T23:59:59.999Z");
  assert.equal(
    assessAudit(fixture(), options).result,
    "passed-with-exceptions",
  );
  options.now = new Date("2026-11-02T00:00:00Z");
  assert.equal(assessAudit(fixture(), options).reason, "exceptions_expired");
  for (const expiry of ["2026-02-30", "2027-01-01", "2026-10-18", "invalid"]) {
    const changed = context();
    changed.policy.expiresOn = expiry;
    assert.equal(assessAudit(fixture(), changed).result, "failed");
  }
});
test("changing or losing a reviewed lock/config fingerprint blocks the gate", () => {
  for (const file of ["package-lock.json", "app.config.js"]) {
    const options = context();
    options.hashes[file] = "c".repeat(64);
    assert.equal(
      assessAudit(fixture(), options).reason,
      "reviewed_inputs_changed",
    );
    delete options.hashes[file];
    assert.equal(
      assessAudit(fixture(), options).reason,
      "reviewed_inputs_changed",
    );
  }
});
test("new affected paths and advisory ranges are not silently waived", () => {
  const changes = [
    (data) =>
      data.vulnerabilities.braces.nodes.push(
        "node_modules/new-parent/node_modules/braces",
      ),
    (data) => {
      data.vulnerabilities.braces.via[0].range = "<=4.0.0";
    },
  ];
  for (const change of changes) {
    const data = fixture();
    change(data);
    assert.equal(assessAudit(data, context()).reason, "affected_graph_changed");
  }
});

test("a new upstream release or unavailable latest-version metadata requires review", () => {
  for (const latest of ["3.0.4", undefined]) {
    const options = context();
    options.latestVersions.braces = latest;
    assert.equal(
      assessAudit(fixture(), options).reason,
      "upstream_versions_changed_or_unavailable",
    );
  }
});

test("npm's varying inferred cycle edges and migration suggestions do not invent exposure changes", () => {
  const data = fixture();
  data.vulnerabilities.braces.effects = [];
  data.vulnerabilities.micromatch.range = "<=4.0.8";
  data.vulnerabilities.micromatch.via.push("micromatch");
  data.vulnerabilities.braces.fixAvailable = {
    name: "jest",
    version: "30.5.2",
  };
  assert.equal(assessAudit(data, context()).result, "passed-with-exceptions");
});

test("creating a previously absent build configuration requires review", () => {
  const options = context();
  options.policy.reviewedFiles["metro.config.js"] = null;
  options.hashes["metro.config.js"] = null;
  assert.equal(
    assessAudit(fixture(), options).result,
    "passed-with-exceptions",
  );
  options.hashes["metro.config.js"] = "c".repeat(64);
  assert.equal(
    assessAudit(fixture(), options).reason,
    "reviewed_inputs_changed",
  );
});
test("even an updated graph hash cannot accept a new advisory, severity or duplicate waiver", () => {
  for (const change of [
    (data) => {
      data.vulnerabilities.braces.via[0].url =
        "https://github.com/advisories/GHSA-aaaa-bbbb-cccc";
    },
    (data) => {
      data.vulnerabilities.braces.via[0].severity = "critical";
    },
  ]) {
    const data = fixture();
    change(data);
    const options = context();
    options.policy.affectedGraphSha256 = auditGraphHash(data);
    assert.equal(assessAudit(data, options).reason, "unreviewed_advisory");
  }
  const options = context();
  options.policy.exceptions.push(options.policy.exceptions[0]);
  assert.equal(assessAudit(fixture(), options).result, "failed");
});
test("unavailable or partial registry reports fail closed; actual zero findings pass", () => {
  for (const code of [null, 2, 124])
    assert.equal(
      assessAudit(fixture(), { ...context(), npmExitCode: code }).result,
      "failed",
    );
  for (const data of [null, {}, { error: {} }, { ...fixture(), metadata: {} }])
    assert.equal(assessAudit(data, context()).result, "failed");
  const data = fixture();
  data.metadata.vulnerabilities.high = 1;
  assert.equal(assessAudit(data, context()).reason, "incomplete_audit");
  const empty = {
    vulnerabilities: {},
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
    },
  };
  assert.equal(
    assessAudit(empty, { npmExitCode: 0, strict: true }).result,
    "passed",
  );
});
test("runtime guard catches nested, Windows and sourceRoot tooling paths and indexed maps", () => {
  for (const source of [
    "../node_modules/braces/index.js",
    "node_modules/parent/node_modules/node-forge/lib/rsa.js",
    "C:\\project\\node_modules\\sprintf-js\\src\\sprintf.js",
    "node_modules/uuid/dist/cjs/index.js",
  ])
    assert.throws(
      () => assertRuntimeMap({ version: 3, sources: [source] }),
      /Tooling-only/,
    );
  assert.throws(
    () =>
      assertRuntimeMap({
        version: 3,
        sourceRoot: "node_modules/braces",
        sources: ["index.js"],
      }),
    /Tooling-only/,
  );
  assert.throws(
    () =>
      assertRuntimeMap({
        version: 3,
        sections: [
          { map: { version: 3, sources: ["node_modules/braces/index.js"] } },
        ],
      }),
    /Tooling-only/,
  );
  assert.equal(
    assertRuntimeMap({
      version: 3,
      sources: ["src/core/braces.ts", "node_modules/three/index.js"],
    }),
    2,
  );
  assert.throws(
    () => assertRuntimeMap({ version: 3, sources: [] }),
    /no sources/,
  );
});
