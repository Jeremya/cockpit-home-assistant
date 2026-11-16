# Dependency policy for the private household MVP

Approved by the user on **2026-10-19**, after inspection of the failed [R01 audit job](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39286764327/job/118175465909). The [application checks](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39280755699) on that source passed. This is a temporary tooling-risk decision for the private MVP, not a statement that npm audit is clean or authorization for public distribution.

## Current state — 2026-11-16

The sections below this one are the dated record. Their counts, their three exceptions and the 2026-11-02 expiry describe earlier reviews; this section is the policy in force.

On **2026-11-16** the owner decided to triage the advisories that had never been reviewed and then renew the policy with a dated expiry. The triage fixed every advisory that had a patched release and found the rest withdrawn by GitHub, so the renewed [policy file](../../scripts/dependency-audit-policy.json) carries **no exception**.

| Item                         | State                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Review window                | 2026-11-16 to **2026-12-14 at 00:00 UTC** (28 days; the validator caps a window at 30)                                            |
| Exceptions                   | None. A new finding fails `check:audit` (`affected_graph_changed`, or `exceptions_expired` from 2026-12-14) until it is reviewed  |
| `npm run check:audit`        | `passed`, zero findings                                                                                                           |
| `npm run check:audit:strict` | `passed` only while the audit reports zero findings. It is one R03b input, not a release authorization                            |
| Runtime guard                | Unchanged: braces, node-forge, sprintf-js and uuid must stay out of the web and Android source maps                               |

The fixes are the lockfile and these `package.json` overrides. Each key names one exact parent version. The glob, minimatch and zod keys also select the child by the range that parent requests:

| Parent held at                                                                                                           | Child range → version             | Advisory                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| `query-string@7.1.3`                                                                                                     | `decode-uri-component` → 0.5.1    | [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) (runtime) |
| `@expo/cli@57.0.31`, `@expo/config@57.0.10`, `@expo/config-plugins@57.0.10`, `@expo/fingerprint@0.20.14`, `@expo/metro-config@57.0.13` | `glob@^13.0.0` → 14.0.6           | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| `@expo/fingerprint@0.20.14`, `@typescript-eslint/typescript-estree@8.71.2`                                               | `minimatch@^10.2.2` → 11.0.8      | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| `@expo/cli@57.0.31`                                                                                                      | `zod@^3.25.76` → 4.6.7            | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| `xcode@3.0.1` (unchanged since 2026-10-19)                                                                               | `uuid` → 11.1.1                   | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |

`node-forge` moves from 1.4.0 to 1.4.3 in the lockfile alone, because `^1.3.3` already allows it. The [2026-11-16 review](#audit-triage-and-renewal--2026-11-16) has the full triage and the rules for removing these overrides.

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

`check:audit` writes `artifacts/dependencies/report.json`; strict mode writes `report-strict.json`. Strict mode fails on any finding. Until 2026-11-16 that failure was expected; since that review the audit reports none (see the current state above). For local exports, follow the [public staging procedure](public-checks.md) so a personal plan is not included in shared artifacts. Recorded results are in the [R01 CI follow-up](../stage0/dependency-ci-validation.md).

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

## Integration runners — 2026-10-22

`check:detail-panel` (B) and `check:web-auth` (C) join Public checks as
separate headless jobs. Their runners and C's public auth fixture
(`scripts/lib/web-auth-fixture.mjs`) are added to the reviewed inputs, like
`check:ui`, because they run an isolated `npm ci` and export or serve
credentials-shaped public test values. Each reproduced
`reviewed_inputs_changed` only for these files and `package.json` /
`public-checks.yml`; the audit stays at 51 entries (braces, node-forge), with
the same expiry and the strict gate unchanged. Both runners passed on the
integrated tree locally and in the Linux Playwright 1.64.1 container.


## Metro GLB asset extension — 2026-10-28

The P1 furniture pipeline adds a root `metro.config.js` whose only change to the
default Expo config is `resolver.assetExts` gaining `glb`. It adds no resolver
alias, transformer, dependency, signing input or release behaviour; the shared
DOM scene fetches the committed CC0 models at runtime. Per the rule above, the
previously absent config is a reviewed input, so its SHA-256 is recorded in
`scripts/dependency-audit-policy.json` (previously `null`). This does not
re-review the unrelated uncommitted camera (`package.json`) change already in
the working tree; that still needs its own review before a clean-checkout audit
can pass. No dependency version, lockfile, advisory, exception or expiry
changed here.

## Audit triage and renewal — 2026-11-16

The gate had failed since the 2026-11-02 expiry (`exceptions_expired`, last
recorded by the scheduled run of 2026-11-09). On base `c6872f5` a fresh audit
reported **27 affected entries** (9 low, 12 moderate, 6 high) from **26 root
advisories**. Only one of the 26, node-forge GHSA-86w9-cpqp-85rv, had ever been
reviewed. The owner's decision of 2026-11-16 was to triage the others and then
renew with a dated expiry; it does not authorize public release.

### Triage

Runtime or tooling was read from the exported source maps, not inferred from the
dependency tree: Android **2 maps / 1,697 sources**, web **1 map / 1,039
sources**. The runtime guard passed on both, and a read-only listing of the same
maps counted the packages the guard does not name.

| Root advisory | Installed version and who pulls it | In delivered JS | Disposition |
| --- | --- | --- | --- |
| decode-uri-component [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), high | 0.5.0, `expo-router@57.0.28` → `query-string@7.1.3` | **Yes**: one module in the Android bundle and one in the web bundle | **Fixed**, 0.5.1 |
| node-forge, 21 advisories (8 high, 7 moderate, 6 low; ranges `<=1.4.0` or `<=1.4.2`), including the previously excepted [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | 1.4.0, `@expo/cli@57.0.31` and `@expo/code-signing-certificates@0.0.6` | No | **Fixed**, 1.4.3 (lockfile only) |
| glob [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), moderate | 13.0.6, five Expo build packages | No | **Fixed**, 14.0.6 |
| minimatch [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), moderate | 10.2.6, glob, `@expo/fingerprint` and `@typescript-eslint/typescript-estree` | No | **Fixed**, 11.0.8 |
| zod [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), high | 3.25.76, `@expo/cli` (two dev-server plugin schemas) and `eslint-plugin-react-hooks` | No | **Fixed**, 4.6.7 |
| deepmerge [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), low | 4.3.1 (latest), `@expo/config` and `jest-config` | No | **Withdrawn** by GitHub on 2026-11-16 at 18:55 UTC; nothing changed |
| braces [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), the other previous exception | 3.0.3, Jest | No | **Withdrawn** by GitHub on 2026-10-23; no longer reported; exception removed |

### The runtime finding

`decode-uri-component` is delivered code, so it was fixed rather than excepted.
Maurice's own URL handling does not reach it today: Expo Router's fork of
`getStateFromPath` reads queries through `URL.searchParams`, the application
source never imports `query-string`, and the only `query-string.parse` caller
in the bundle is the vendored React Navigation `getStateFromPath`, a default
that Expo Router replaces. That is one default argument away from live, and the
installed 0.5.0 chain reproduced the advisory (a 112 KB query held
`query-string.parse` for about 4.1 s), so unreachability was not used as the
argument.

0.5.1 keeps the ESM default export, so the one-line
[bridge patch](../../patches/README.md) applies unchanged. `proof:dependencies`
now pins 0.5.1 and decodes the advisory's own 224 KB input in about 0.2 s; the
same proof run against 0.5.0 stops at its 5 s limit. Comparing the two exports
module by module, `node_modules/decode-uri-component/index.js` is the only
delivered source that changed. On 201,406 generated inputs, 0.5.1 returned the
same string as 0.5.0 for all 41,234 valid encodings; the 25,377 differences are
all in already malformed input, and 24,597 of them contain `%FE%FF` or
`%FF%FE`.

### The tooling fixes

The patched glob, minimatch and zod releases are new majors outside the ranges
that the installed Expo and typescript-eslint packages declare, so each
override was accepted only on evidence:

- Expo's own SDK 57 patch releases (`@expo/cli` 57.0.34, `@expo/config` 57.0.11,
  `@expo/config-plugins` 57.0.13, `@expo/metro-config` 57.0.14) declare
  `glob ^14.0.3`, and typescript-estree 8.73.0 declares `minimatch ^11.0.1`. The
  files that call glob or minimatch there have the same glob and minimatch lines
  as the installed versions; ten of the twelve are byte-identical.
- A snapshot of each library **through its installed consumer** was identical
  before and after: 26 inputs through `@expo/cli`'s two zod schemas, the
  consumers' own glob patterns through all five Expo packages, 47 fingerprint
  ignore patterns over 505 paths, the single typescript-estree call, and
  key, certificate, CSR and signature operations through
  `@expo/code-signing-certificates`.
- `expo prebuild --platform android`, in the trial variant and the default one,
  generated byte-identical trees (45 and 43 files).
- ESLint still loads 16 `react-hooks` rules with zod 4.6.7.

Two overrides have no upstream precedent and rest on the snapshots alone:
`@expo/fingerprint` has no release on minimatch 11, and `@expo/cli` 57.0.34
removes zod instead of updating it. Neither path runs in Maurice's current
flows: `app.json` configures no build cache provider, which is the only caller
of the fingerprint, and no installed package declares a devtools plugin for the
schemas to validate.

An exception would not have held for glob or minimatch in any case. The
validator fails on any new `latest` of an excepted package, and between
2026-10-27 and 2026-11-12 glob published seven 14.x releases and minimatch nine
11.x releases.

### Override rules learned here

- A plain child key under a parent applies to that parent's whole subtree. The
  first attempt (`"@expo/cli@57.0.31": { "glob": "14.0.6" }`) made `npm ls` report
  Jest's `glob@7.2.3` as invalid. Selecting the child by requested range
  (`"glob@^13.0.0"`) leaves it alone; `npm ls --all` exits 0.
- A `parent@version` key also holds that parent at that version: with these
  keys, `npm update @expo/config` changes nothing. That is wanted today, because
  the next SDK 57 patch releases also move `expo-constants`,
  `expo-modules-autolinking`, `@expo/prebuild-config` and `xcode` 4.0.0 and
  need their own ticket with native acceptance.
- Remove the five Expo keys and the typescript-estree key in the change that
  adopts those releases, and re-run the checks below. Do not widen them to
  silence a later advisory.

### Renewed policy

`reviewedOn` 2026-11-16, `expiresOn` 2026-12-14, `exceptions` empty,
`reviewedLatestVersions` empty, and `affectedGraphSha256` the fingerprint of an
empty audit. Three reviewed files were re-pinned after inspection:

- `package.json`: commit `4a55694` added the `proof:camera` script; this review
  adds the overrides above.
- `.github/workflows/public-checks.yml`: the same commit added the
  `npm run proof:camera` step, a loopback-only proof with a public test token.
- `package-lock.json`: seven versions change and one package is added, all
  listed in the [evidence](../stage0/dependency-ci-validation.md).

Fed a saved non-empty audit, the validator reaches the graph check with this
policy and returns `affected_graph_changed`; from 2026-12-14 it returns
`exceptions_expired`. So the file is valid, and a new finding is refused rather
than waived.

**Strict mode now passes**, because the audit reports nothing. It was failing
by design until this review. A clean audit is one input to R03b; public
distribution still needs its own release review, and nothing here builds,
installs or accepts an APK.

### Limits

- npm's audit service was inconsistent while the deepmerge withdrawal
  propagated: around 20:14 UTC identical requests returned either no finding or
  deepmerge with its propagated low entries, and from 20:21 UTC every run
  returned none. If a run still shows deepmerge, re-run it; do not add an
  exception for a withdrawn advisory.
- The runtime guard still names only braces, node-forge, sprintf-js and uuid.
  glob, minimatch, zod and deepmerge were counted at zero in both maps by the
  listing, not by the guard.
- iOS prebuild, `expo start`, `expo run:android`, Gradle and a device were not
  exercised. The GitHub workflows were not run on this change.
