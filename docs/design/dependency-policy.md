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

## Shared Home review — 2026-10-20

UX01 renames the smoke's `desktop-overview` selector to `home-overview` to match
the shared Home tree. Review reproduced `reviewed_inputs_changed`: this single
string replacement is the only change to a pinned input. The new fingerprint
records that inspected change; the runner still exports an isolated public
sample, uses the closed fixture, rejects external requests and checks runtime
maps. UX00's opt-in local credential helper uses Node built-ins, has no runtime
import into the app and is never enabled by the public checks. No dependency,
lockfile, signing configuration, glob pattern, advisory scope or exception
expiry changes. The existing 2026-11-02 deadline and strict-release gate remain.

## Card action review — 2026-10-20

UX03 extends the same smoke with a card power pass at each width: the demo
lamp's Home card is toggled On with Enter and Off with Space, the URL must stay
on Home, each result is dismissed, then Enter on **Open device** must show the
summary with the lamp still Off and no outcome. Review reproduced
`reviewed_inputs_changed` with `scripts/check-ui.mjs` as the only changed pinned
input; the diff adds Playwright interactions inside the existing public sample
page and two report flags. Exposure is unchanged: the isolated public export,
the closed demo/fixture data, external-request rejection, runtime-map checks
and `physicalServiceCalls: 0` all stay. The same 56 entries / 3 advisories
(braces, node-forge, sprintf-js) were reported, so there is no drift. No
dependency, lockfile, signing configuration, glob pattern, advisory scope or
exception expiry changes.

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

## Model camera smoke review — 2026-10-21

UX08 adds two explicit **2D plan** tab clicks and explanatory comments
in `scripts/check-ui.mjs`, before the existing SVG recipe and again after its persistence reload for the
placement recipe. Wide web now
starts in 3D, so the SVG recipe must select its tested view. The reproduced audit
failure is `reviewed_inputs_changed`; only that pinned file changes. The fresh
audit still reports the same 56 entries / three root advisories. Updating its
fingerprint records this reviewed interaction, without changing the dependency
graph, fixture/network boundaries, runtime-map guard, signing/build configuration,
glob inputs or the 2026-11-02 expiry. Camera/GPU proofs are separate local tests;
these clicks do not pretend that CI accepts GPU performance.

## Spatial runner review — 2026-10-22

A02 adds `npm run check:spatial-ui` to `package.json` and a headless
**Public 3D web lifecycle** job to `public-checks.yml`. The fresh audit
reproduced `reviewed_inputs_changed` with only these two pinned inputs changed,
the same 56 entries / three root advisories and unchanged upstream latest
versions. The new runner and its helper module (`scripts/check-spatial-ui.mjs`,
`scripts/lib/spatial-ui.mjs`) are added to the reviewed files because, like
`check:ui`, they run an isolated `npm ci` and export. Exposure is unchanged:
public sample only, loopback preview, external requests rejected, runtime-map
guard, no credentials, no lockfile, signing, glob or exception change. The
2026-11-02 expiry and the strict-release gate stay as they are. See the
[A02 evidence](../stage0/spatial-browser-validation.md).

## Withdrawn advisory — 2026-10-22

The fresh audit failed closed with `affected_graph_changed`: **51 entries**
instead of 56, with the lockfile and every reviewed file unchanged. GitHub
withdrew [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
(sprintf-js) on 2026-10-22 at 19:21 UTC, so `npm audit` no longer reports its
five moderate entries. The obsolete sprintf-js exception and its reviewed
latest version are removed, and the affected-graph fingerprint now records the
remaining **51 high entries / two root advisories** (braces, node-forge), whose
exceptions are unchanged. The review date, the 2026-11-02 expiry and the
strict-release gate are unchanged; `check:audit:strict` still fails. The
runtime-map guard keeps sprintf-js in its tooling-only list as extra hygiene.
This is a new common base for B and C only if they run `check:audit`.

## Expo Router web history patch — 2026-10-22

A03 adopts `patches/expo-router+57.0.28.patch`, generated by patch-package
from B's reproduced fix (see [patches/README.md](../../patches/README.md)). It
changes two web-only files of the installed router; no version, lockfile,
override or advisory changes. `npm ci` applies it with `--error-on-fail`
before plan preparation, CI cache keys already include `patches/*.patch`, and
the file is added to the reviewed inputs. The fresh audit stays
`passed-with-exceptions` (51 entries, braces and node-forge) with the
unchanged 2026-11-02 expiry. Nothing is reported upstream without the user's
agreement.
