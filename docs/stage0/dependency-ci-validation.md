# R01 CI follow-up — 2026-10-19

Base: `e05d88ed64186ebb967121f79e0a36cde228f65d`. The [application CI passed](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39280755699); the [latest failing job](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39286764327/job/118175465909) was the separate dependency audit. Its log and a new local run both reported 63 affected entries/four advisories. This was not a new M00 focus failure.

The user explicitly selected **strict temporary exceptions** for the three unpatched tooling advisories, after being offered the alternative of retaining the fully blocking audit. The [policy contract](../design/dependency-policy.md) records the exact scope, expiration, guards and public-release boundary. There is no global `continue-on-error`, severity filtering or forced audit fix.

## Changes and local results

- Parent-scoped `xcode@3.0.1` → `uuid@11.1.1`; the actual CommonJS consumer, bounded-buffer regression and project parse/write round trip pass.
- Fresh npm audit: **56 affected entries / three advisories**, 51 high/five moderate/no critical. Braces, node-forge and sprintf-js remain vulnerable; the policy does not claim otherwise.
- Reviewed gate: **`passed-with-exceptions`**, npm exit code 1 preserved; exceptions expire **2026-11-02 00:00 UTC**.
- Strict gate: **exit 1 / `strict_audit_findings`**, with the same three advisories and full affected counts.
- **608 Jest tests / 39 suites** and **17 Node tooling tests** pass; type, lint and final formatting are checked separately.
- Isolated lockfile installs and the installed query-string decoder proof pass; the R01 runtime decoder patch is retained.
- Isolated public web export and smoke pass at 320/430/768, including all twelve M00 return-focus assertions. No page errors or external requests; developer plan unchanged.
- Web map guard passes: **one map / 957 source entries**. Isolated Android/Hermes/DOM export and map guard pass: **two maps / 1,623 source entries**. All four tooling-only packages are absent from these runtime maps.

The validator tests cover expiry/boundaries, changed lock/config fingerprints, newly created configs, new advisory/path/range/severity, upstream release changes/unavailability, partial registry output, strict mode, and harmless npm meta-vulnerability variation. Runtime tests cover nested/Windows/sourceRoot/indexed-map paths. These tests exercise policy behavior rather than declaring findings repaired.

## Limits and reproduction notes

The first Xcode test fixture lacked the newline required by the project parser; fixing that fixture makes the real consumer round trip pass. The sandbox blocked the decoder proof's local socket on the first isolated Android attempt; the permitted rerun passes and preserves the developer plan. A blocked raw registry request is recorded as unavailable, not a clean audit.

Fingerprinting npm's suggested fixes and inferred cyclic edges initially rejected identical installed graphs. Two raw audits showed those fields changing while lockfile, root advisories, affected package paths and severities were unchanged. The final policy pins the actual lockfile graph and affected scope, and separately checks latest published versions to detect new upstream releases. It does not permit dependency or runtime-exposure drift.

No phone was operated, APK replaced, physical HA service called or household credential/geometry published for this change. The accepted M00 Trial 1007 retains its exact earlier lockfile and binary. The original unexplained native incident, S02 Pixel acceptance and physical Kasa enrollment remain separate. The [earlier R01 assessment](dependency-maintenance.md) preserves its dated four-advisory snapshot; this follow-up supersedes its tooling-audit disposition.

The [safe aggregate](dependency-ci-proof-2026-10-19.json) preserves the actual local results and prior CI identities. Check the GitHub checks attached to the published change for its committed-source Linux conclusions; working-tree results above are not relabeled as CI acceptance.
