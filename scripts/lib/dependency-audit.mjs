import { createHash } from "node:crypto";

export const fileHash = (value) =>
  createHash("sha256").update(value).digest("hex");
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : object(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const day = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value)
    ? time
    : NaN;
};
const levels = ["info", "low", "moderate", "high", "critical"];
const advisoryId = (url) =>
  /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/.exec(
    url,
  )?.[1];

// npm's inferred cycle edges, parent ranges and fix suggestions vary between
// identical audits. Pin actual paths/severity/advisories here and the complete
// resolved dependency graph through the reviewed package-lock hash instead.
export function auditGraph(data) {
  if (!object(data?.vulnerabilities)) throw new Error("incomplete_audit");
  return Object.entries(data.vulnerabilities)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entry]) => {
      if (
        !object(entry) ||
        entry.name !== name ||
        !levels.includes(entry.severity) ||
        !Array.isArray(entry.nodes) ||
        !Array.isArray(entry.effects) ||
        !Array.isArray(entry.via) ||
        !entry.via.length ||
        !entry.nodes.every((node) => typeof node === "string") ||
        !entry.effects.every((effect) => typeof effect === "string") ||
        typeof entry.range !== "string"
      )
        throw new Error("incomplete_audit");
      const via = entry.via.map((item) => {
        if (typeof item === "string") {
          if (!Object.hasOwn(data.vulnerabilities, item))
            throw new Error("incomplete_audit");
          return item;
        }
        if (
          !object(item) ||
          !advisoryId(item.url) ||
          typeof item.name !== "string" ||
          !levels.includes(item.severity) ||
          typeof item.range !== "string"
        )
          throw new Error("incomplete_audit");
        return {
          name: item.name,
          url: item.url,
          severity: item.severity,
          range: item.range,
          cwe: item.cwe ?? [],
          cvss: item.cvss ?? null,
        };
      });
      return {
        name,
        severity: entry.severity,
        nodes: [...entry.nodes].sort(),
        via: via
          .filter((item) => typeof item !== "string")
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      };
    });
}
export const auditGraphHash = (data) =>
  fileHash(JSON.stringify(canonical(auditGraph(data))));

export function assessAudit(
  data,
  {
    npmExitCode,
    policy,
    hashes = {},
    latestVersions = {},
    now = new Date(),
    strict = false,
  },
) {
  const failed = (reason, details = {}) => ({
    result: "failed",
    reason,
    npmExitCode,
    ...details,
  });
  try {
    if (data?.error || ![0, 1].includes(npmExitCode))
      return failed("audit_unavailable");
    const graph = auditGraph(data);
    const counts = data.metadata?.vulnerabilities;
    if (
      !object(counts) ||
      ![...levels, "total"].every(
        (level) => Number.isSafeInteger(counts[level]) && counts[level] >= 0,
      ) ||
      levels.reduce((total, level) => total + counts[level], 0) !==
        counts.total ||
      graph.length !== counts.total ||
      levels.some(
        (level) =>
          graph.filter((entry) => entry.severity === level).length !==
          counts[level],
      ) ||
      (counts.total === 0 ? npmExitCode !== 0 : npmExitCode !== 1)
    )
      return failed("incomplete_audit");
    const roots = new Map();
    for (const entry of graph)
      for (const via of entry.via)
        if (typeof via !== "string") roots.set(advisoryId(via.url), via);
    const advisories = [...roots].map(([id, via]) => ({
      id,
      package: via.name,
      severity: via.severity,
      url: via.url,
    }));
    const findings = { counts, advisories };
    if (counts.total === 0)
      return { result: "passed", npmExitCode, ...findings };
    if (strict) return failed("strict_audit_findings", findings);
    const reviewed = day(policy?.reviewedOn),
      expires = day(policy?.expiresOn);
    if (
      policy?.schema !== 1 ||
      policy.scope !== "private-household-tooling" ||
      !Number.isFinite(reviewed) ||
      !Number.isFinite(expires) ||
      !Number.isFinite(now.getTime()) ||
      expires <= reviewed ||
      expires - reviewed > 30 * 86400000 ||
      now.getTime() < reviewed ||
      !Array.isArray(policy.exceptions) ||
      !object(policy.reviewedLatestVersions) ||
      !object(policy.reviewedFiles)
    )
      return failed("invalid_exception_policy", findings);
    if (now.getTime() >= expires) return failed("exceptions_expired", findings);
    if (
      Object.keys(policy.reviewedLatestVersions).length !==
        policy.exceptions.length ||
      policy.exceptions.some(
        (entry) =>
          !/^\d+\.\d+\.\d+$/.test(
            policy.reviewedLatestVersions[entry.package],
          ) ||
          latestVersions[entry.package] !==
            policy.reviewedLatestVersions[entry.package],
      )
    )
      return failed("upstream_versions_changed_or_unavailable", findings);
    if (
      !Object.keys(policy.reviewedFiles).length ||
      Object.entries(policy.reviewedFiles).some(([file, expected]) =>
        expected === null
          ? hashes[file] !== null
          : !/^[a-f0-9]{64}$/.test(expected) || hashes[file] !== expected,
      )
    )
      return failed("reviewed_inputs_changed", findings);
    if (auditGraphHash(data) !== policy.affectedGraphSha256)
      return failed("affected_graph_changed", findings);
    if (
      !roots.size ||
      roots.size !== policy.exceptions.length ||
      new Set(policy.exceptions.map((entry) => entry.id)).size !== roots.size ||
      policy.exceptions.some((entry) => {
        const root = roots.get(entry.id);
        return (
          !root ||
          entry.package !== root.name ||
          entry.severity !== root.severity ||
          entry.range !== root.range ||
          !entry.reason?.trim() ||
          !entry.revisitWhen?.trim()
        );
      })
    )
      return failed("unreviewed_advisory", findings);
    return {
      result: "passed-with-exceptions",
      npmExitCode,
      ...findings,
      expiresOn: policy.expiresOn,
      exceptions: policy.exceptions,
      scope: policy.scope,
    };
  } catch {
    return failed("incomplete_audit");
  }
}
