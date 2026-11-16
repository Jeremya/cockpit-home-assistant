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

# Audit triage and renewal — 2026-11-16

Base: `c6872f558368635bca92023d25283ba3c4a1c4dd`, branch `work/audit-renewal`. Everything below is a **local working-tree result** on macOS with Node 24.11.1 and npm 11.11.0, between 19:50 and 20:30 UTC. No GitHub workflow ran on this change, no APK was built and no device was used. The [policy contract](../design/dependency-policy.md#audit-triage-and-renewal--2026-11-16) records the decisions; this section records what was run.

## Before any change

| Check | Result |
| --- | --- |
| `npm ci` | Both patches applied; 27 vulnerabilities reported |
| `npm audit --package-lock-only --json` (about 19:52 UTC) | Exit 1. **27 entries**: 9 low, 12 moderate, 6 high. **26 root advisories**: decode-uri-component 1, node-forge 21, glob 1, minimatch 1, zod 1, deepmerge 1 |
| Committed policy against that audit, through `assessAudit()` | `failed (exceptions_expired)`. Dated 2026-11-01 it would already have failed with `upstream_versions_changed_or_unavailable`, because node-forge had published past 1.4.0 |
| Committed pins | `package.json` and `.github/workflows/public-checks.yml` no longer matched; the other 24 reviewed files did |
| `npm run export:android -- --source-maps`, then `npm run check:runtime-dependencies -- dist android` | Passed: **2 maps / 1,697 sources** |
| `npx --no-install expo export --platform web --source-maps --output-dir dist-web`, then `npm run check:runtime-dependencies -- dist-web web` | Passed: **1 map / 1,039 sources** |
| Read-only count of map sources per package | decode-uri-component 1 and query-string 1 on each platform; node-forge, zod, glob, minimatch, deepmerge, braces, uuid, sprintf-js **0** on both |
| Decoder timing through the installed `query-string.parse` with 0.5.0 | 14 KB 46 ms, 28 KB 189 ms, 56 KB 649 ms, **112 KB 4,059 ms** (quadratic) |

Both exports used `CI=1 EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 COCKPIT_PLAN_FILE=src/spatial/sample-plan.json` and a private `TMPDIR`. The worktree holds only the sample plan.

## Changes

`package.json` overrides, then `npm install --package-lock-only --ignore-scripts`, `npm update node-forge --package-lock-only --ignore-scripts` and `npm ci`. The lockfile diff is exactly:

| Package | Before | After |
| --- | --- | --- |
| decode-uri-component | 0.5.0 | 0.5.1 |
| node-forge | 1.4.0 | 1.4.3 |
| glob | 13.0.6 | 14.0.6 |
| minimatch | 10.2.6 | 11.0.8 |
| path-scurry (glob 14) | 2.0.2 | 3.0.0 |
| brace-expansion (minimatch 11 asks `^5.0.12`; npm chose the newest) | 5.0.12 | 5.0.13 |
| zod | 3.25.76 | 4.6.7 |
| @isaacs/nonrecursive-glob-match (new, minimatch 11) | absent | 1.1.0 |

`npm ls --all` exits 0. Jest's four nested `glob@7.2.3` copies and every `minimatch@3.1.5` are untouched. `scripts/prove-dependencies.ts` pins 0.5.1 and gains the advisory's 224 KB input; `patches/README.md` names the new decoder; the patch files are unchanged.

## After

| Check | Result |
| --- | --- |
| `npm run check:audit` (20:24 UTC) | **Exit 0**, `passed`, npm exit 0, zero entries, no advisory |
| `npm run check:audit:strict` (20:24 UTC) | **Exit 0**, `passed`, same zero-finding report |
| 40 further `npm audit --package-lock-only --json` runs, 20 with an empty npm cache each (20:27–20:29 UTC) | 40 of 40: exit 0, zero entries |
| Renewed policy against a saved 16-entry audit, through `assessAudit()` | `affected_graph_changed` today, `exceptions_expired` at 2026-12-14T00:00Z, `reviewed_inputs_changed` with one altered hash, `strict_audit_findings` in strict mode |
| `npm run proof:dependencies` | Passed: decoder 0.5.1, four malformed cases, the 224 KB input in 188 ms on the first run and 69 ms on a later one |
| The same proof with its pin set to 0.5.0, in a throwaway project holding the previous decoder | Failed as intended: child process stopped at the 5 s limit |
| Decoder timing with 0.5.1 | 112 KB 40 ms, 224 KB 178 ms, 448 KB 354 ms (linear) |
| `npx jest src/__tests__/routeDecoding.test.ts` | 3 of 3 |
| `npm test -- --watch=false` | **1,014 tests / 75 suites** passed |
| `npm run test:tooling` | **36** passed |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | Exit 0 each |
| `npm run proof:protocol`, `npm run proof:camera`, `npm run check:public-inputs` | Passed; loopback only, sample plan |
| Android and web exports with the runtime guard | Passed: 2 maps / 1,697 sources and 1 map / 1,039 sources |
| Module-by-module comparison of the embedded sources in both exports | One changed module on each platform, `node_modules/decode-uri-component/index.js`; none added or removed; the DOM `www.bundle` is byte-identical |
| Map counts for glob, minimatch, zod, deepmerge, node-forge, path-scurry, brace-expansion, @isaacs/nonrecursive-glob-match | 0 on both platforms |
| `npx --no-install expo prebuild --platform android --no-install`, trial variant and default | Byte-identical to the pre-change trees: 45 and 43 files |
| Consumer snapshots (zod through `@expo/cli`, glob through five Expo packages, minimatch through fingerprint and typescript-estree, node-forge through `@expo/code-signing-certificates`) | Identical before and after |
| `npm run check:web-auth` | Passed, 12 of 12 rows, no page error or external request |
| `npm run check:ui` | Passed at 320/430/768/1440, no page error or external request, developer plan unchanged |
| `npm run check:detail-panel` | Passed, 22 of 22 rows |
| `npm run check:spatial-ui` (headless) | Passed |

The four browser runners copied this working tree, ran their own `npm ci` from the new lockfile, exported the sample and ran the web runtime guard before opening Chromium 156.0.8078.4 (Playwright 1.64.1). Their reports say `dirtySource: true`, because the changes were not yet committed.

## Limits

- **npm's audit service changed during the review.** GitHub withdrew the deepmerge advisory at 18:55 UTC. Until about 20:14 UTC npm still served it. For about twenty seconds around 20:14 UTC identical requests alternated between zero findings and deepmerge with its propagated low entries. From 20:21 UTC every run returned zero, and the unchanged pre-change lockfile then reported 18 entries from 25 advisories. A run that shows deepmerge again is a stale answer: re-run it.
- While deepmerge was still listed, the number of propagated entries for the same lockfile depended on the form of the override keys (16 with `parent@version` keys, 11 with top-level range keys). The fingerprint that the policy pins includes those entry names. This does not matter at zero findings; a future exception should be pinned from a run with an empty npm cache.
- `proof:ha` and the `--headed --performance` spatial run were not executed.
- Not exercised: iOS prebuild, `expo start`, `expo run:android`, Gradle, `build:trial:android`, an APK, a device. The prebuild comparison stops at the generated Android project.
- zod under `@expo/cli` 57.0.31 and minimatch 11 under `@expo/fingerprint` 0.20.14 are outside the ranges those packages declare and have no upstream release on those versions. The evidence is the snapshots above and the absence of both from the delivered maps.
- The earlier figures in this file (63, 56 and 51 entries) describe their own dates and are not restated here.
