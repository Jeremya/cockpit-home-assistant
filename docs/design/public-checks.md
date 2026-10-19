# F02/R02 — public UI smoke and CI

The browser smoke and GitHub Actions use public sample data, without household HA, phone access, signing material or a personal plan. D01 also uses a closed loopback HA fixture with a public test token. They validate source and JavaScript exports; they do not build or accept an Android APK. R03a's named binaries retain their separate native evidence.

## Local reproduction

Use Node 24, the committed lockfile and installation scripts. On macOS or Linux:

```sh
npm ci --include=dev
npx --no-install playwright install chromium
npm run test:tooling
npm run check:ui
```

On a Linux machine without Chromium's system dependencies, use `npx --no-install playwright install --with-deps chromium`. Playwright is pinned in development dependencies and selects its matching browser. A system Chrome installation or Python helper is not required.

`check:ui` can run from a developer checkout containing a private plan. It creates a temporary source snapshot from allowlisted project directories/files, excludes dotfiles and the generated plan, refuses source symlinks, installs its own locked dependencies and applies the R01 bridge. Build-input environment variables are cleared; dotenv loading is disabled and sample preparation is explicit. Expo uses an independent temporary transform cache. The original generated plan is compared before/after and is never replaced with the sample.

After asserting exact sample provenance, the runner exports web JavaScript and starts a loopback-only SPA preview. Fresh browser contexts can reach only that origin; external HTTP/WebSocket requests and page errors fail the smoke. Each width has separate storage. No saved browser profile or household credential is used. A separate D01 context may connect only to the exact disposable loopback fixture WebSocket; all other connections remain rejected.

The runner checks widths **320/430/768/1440**, Home → plan → Back, all sample floors, polygon and room-list selection, selected-tab semantics, absent sample dimensions, device readings and favorite persistence, simulated On/Off with observed outcomes/dismissal, 48-pixel switch targets, direct `/house` navigation and loaded-route offline use. Fresh offline page loads are not supported or claimed. The server returns the SPA for document routes, including routes containing dots, while missing assets return 404.

The first smoke exposed missing web `aria-selected` on Home's room tabs. The native selected state remains, and the explicit ARIA attribute now matches the existing floor tabs. The browser assertion protects this behavior. This source change is newer than the accepted R03a APK; no phone was rebuilt or revalidated by F02/R02.

D01 additionally checks wide navigation/active links, first-Tab skip-to-content, preserved room selection across 1024/1280/1920/800 resizing and actual card columns. The closed fixture checks memory-only tokens, default-denied enrollment, two simulated requests, recovery without replay, reload/reconnect with saved grants, and browser Forget cancel/confirm. See [desktop architecture](desktop.md).

## Artifacts and cleanup

Only `artifacts/ui/report.json`, twelve named viewport PNGs and an optional failure PNG are produced. They are ignored in Git. The capture budget is 20 MiB, with no traces, videos, HTML dumps, raw storage or exported bundles uploaded. GitHub's upload step explicitly names these files and keeps them for seven days. The runner clears only its own filenames before each attempt.

Browsers and the preview server close on success or failure. Temporary workspaces/caches are removed. Build child process groups have bounded deadlines and signal cleanup, including forced termination of stuck descendants. Interruption closes the browser and cancels an active build. This process-group implementation targets macOS/Linux.

`test:tooling` uses Node's built-in test runner to exercise staging with private sentinels, symlink rejection, inherited environment cleanup, fail-closed sample validation without printing private values, Git ignore/tracking guards, SPA routing/server closure and child deadlines. It complements the existing Jest suites.

## GitHub Actions

[`public-checks.yml`](../../.github/workflows/public-checks.yml) runs on main pushes, pull requests and manual dispatch, with Node 24 on Ubuntu 24.04. It uses read-only repository permissions, disables persisted checkout credentials, cancels superseded runs, pins actions to verified commit SHAs and keys the npm download cache with both the lockfile and patches. It never caches `node_modules` or Metro transforms.

| Job                            | Checks                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests, protocol and Android JS | Fresh `npm ci`, public input guards, typecheck, lint, formatting, Jest, tooling tests, decoder proof, loopback HA proof, Android Hermes/DOM export, repeated public provenance check and unchanged tracked files |
| Public UI mobile + desktop      | Fresh install, public guard, matching Chromium installation, isolated sample export/browser smoke and bounded public capture upload                                                                              |

`check:public-inputs` is deliberately for a clean public checkout. It rejects tracked secret/generated/native-binary paths, requires each private/generated/artifact path to be ignored, refuses private local inputs and checks that the prepared plan equals the sample. Running it in a private developer checkout should fail; use the isolated `check:ui` there. GitHub checks never need `.env.local`, a token, a reference image or local helpers.

## Dependency gate

[`dependency-audit.yml`](../../.github/workflows/dependency-audit.yml) runs independently on pushes, pull requests, manual dispatch and a weekly schedule. `npm run check:audit` evaluates the full lockfile and returns failure for findings or an incomplete assessment. It publishes only an aggregate JSON report and a job summary. It uses no `continue-on-error` or reduced severity threshold. The later user-approved [R01 private policy](dependency-policy.md) permits only exact, expiring reviewed tooling findings while retaining raw results and strict public-release mode.

The earlier R01 assessment recorded **63 affected entries, four underlying tooling advisories**. The uuid correction reduces this to **56 entries / three advisories**, accepted only through the private policy until 2026-11-02; strict release mode still fails. Functional/UI success alone does not establish audit or public-release acceptance. Branch-protection settings and public distribution are not changed by this ticket.

The [R01 assessment](../stage0/dependency-maintenance.md) owns exposure and fixes. Installed-binary reliability, S02 Pixel, cloud/OEM restore, broader accessibility and the seven-day household trial retain their own scope. M01 separately accepts one physical lamp cycle on Pixel 1009; D01 performs no household service calls.

Implementation references: [Playwright CI](https://playwright.dev/docs/ci-intro), [setup-node caching](https://github.com/actions/setup-node), [artifact retention](https://github.com/actions/upload-artifact) and [Expo CLI](https://docs.expo.dev/more/expo-cli/).
