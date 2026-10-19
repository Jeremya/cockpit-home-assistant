# Dependency policy for the private household MVP

Approved by the user on **2026-10-19**, after inspection of the failed [R01 audit job](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39286764327/job/118175465909). The [application checks](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39280755699) on that source passed. This is a temporary tooling-risk decision for the private MVP, not a statement that npm audit is clean or authorization for public distribution.

## Actual dependency fix

`xcode@3.0.1` now resolves **uuid 11.1.1** through a parent-specific npm override. Its CommonJS `v4()` consumer API remains available. The installed-consumer test generates 100 valid unique Xcode IDs and parses, edits, writes and reparses a project. A bounded-buffer `v5()` regression also checks the upstream correction. This verifies the used API and project serialization; it does not accept an iOS build. Expo/React Native versions and the runtime decoder patch remain unchanged.

The [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) identifies 11.1.1 as patched. The fresh lockfile audit drops from **63 to 56 affected package entries**, now rooted in **three** advisories: 51 high, five moderate, no critical. Propagated package counts are not distinct vulnerabilities.

## Three time-limited exceptions

The official advisories and npm metadata still list no patched published version for [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) or [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) at this review. The [machine-readable policy](../../scripts/dependency-audit-policy.json) records each exact GHSA/package/severity/range, its rationale and triggers for reassessment. All exceptions expire **2026-11-02 at 00:00 UTC**; the validator caps any review period at 30 days.

| Package | Reviewed use and boundary |
| --- | --- |
| braces 3.0.3 | Jest/file tooling with repository-owned glob patterns; no household values passed into glob parsing |
| node-forge 1.4.0 | Expo CLI/certificate tooling; no configured EAS project ID or updates signing certificate; trial signing uses JDK/apksigner |
| sprintf-js 1.0.3 | Jest coverage CLI → js-yaml → argparse, with tooling-owned format strings |

`npm run check:audit` performs a fresh lockfile audit and checks all of the following before accepting these findings:

- Exact affected package names, installed paths, severity and root advisory details match the reviewed fingerprint.
- The complete lockfile and reviewed build/signing/glob configuration files match their hashes. Adding a previously absent Metro/Babel configuration also invalidates the review.
- The latest published versions of all three packages remain the reviewed versions. A new release, missing registry data, partial audit report, unexpected exit code, new finding or expiry fails closed.
- Every advisory has exactly one matching, justified exception. Registry errors never count as zero findings.

npm's inferred cycle edges, propagated version ranges and suggested migrations varied between identical audits during validation. They are not treated as authoritative dependency edges. The exact lockfile pins the actual graph; detected names/paths/severities and root advisory/CWE/CVSS details pin the affected scope. Tests cover both harmless variation in npm's suggestions and real scope changes.

The result is explicitly **`passed-with-exceptions`**, preserving npm's exit code **1**, all affected counts, GHSA links and exception reasons. GitHub shows a warning and expiration date. This is deliberately distinct from **`passed`**, which requires an actual zero-finding audit.

## Paired runtime guard and release gate

Public checks export source maps for both web and Android/Hermes/DOM and run `check:runtime-dependencies`. The guard refuses missing/malformed platform maps or runtime source entries for braces, node-forge, sprintf-js or uuid, including nested dependencies and indexed maps. A newly introduced runtime import therefore fails the application workflow even if the separate tooling-policy workflow accepts the unchanged lockfile findings.

Maps and bundles are inspected locally in the isolated public workspace; they are not added to the public artifact upload. The UI runner retains its existing sample-only provenance and developer-plan preservation checks. This verifies these delivered JavaScript graphs, not every native or future supply-chain surface.

`npm run check:audit:strict` ignores all exceptions and still fails on any finding. **R03b/public distribution requires the strict mode and its own release review.** No public-release pipeline is introduced here. The original native startup incident remains a separate R01/R03a observation; this dependency change is not a claimed native crash fix or new APK acceptance.

## Desktop review — 2026-10-19

D01 changes the browser smoke and its bounded capture workflow, and adds `scripts/lib/browser-connection-check.mjs` to reviewed hashes. The helper spawns only the repository-owned loopback HA fixture, accepts its public token and permits only that exact socket; household credentials are never involved. The browser runtime reuses the existing HA client and command policy, with page-memory tokens. No dependency/lockfile, signing configuration, glob input, affected graph, advisory or exception expiry changes. Web and Android runtime-map guards remain required.

## Maintenance

Before changing a pinned dependency or a reviewed configuration, review the actual exposure and update the relevant evidence. Inspect all changed inputs and compare the fresh root advisories, package paths and release metadata. Do not mechanically replace hashes or extend dates to make CI green. Replace an exception with a tested upstream fix when available; remove obsolete exceptions. A renewed review requires a dated rationale and a bounded expiration.

Commands:

```sh
npm ci
npm run test:tooling
npm run check:audit
npm run check:audit:strict
npm run check:ui
npm run export:android -- --source-maps
npm run check:runtime-dependencies -- dist android
```

`check:audit` writes `artifacts/dependencies/report.json`; strict mode writes `report-strict.json`. A strict failure remains expected while the three unpatched advisories exist. For local exports, follow the [public staging procedure](public-checks.md) so a personal plan is not included in shared artifacts. Recorded results are in the [R01 CI follow-up](../stage0/dependency-ci-validation.md).
