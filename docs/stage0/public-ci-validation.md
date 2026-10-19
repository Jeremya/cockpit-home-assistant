# F02/R02 acceptance — 2026-10-18

**F02 public UI smoke and R02 CI are implemented and verified on GitHub Actions.** Source revision `b67ad87039fc481733a29bd64178de3b737a64ae` passes the two-job [Public checks run](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39190171626) on Ubuntu 24.04 with Node 24. The separate [Dependency audit run](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39190171599) fails at the audit step and successfully uploads its report; R01 remains open.

The [architecture and reproduction guide](../design/public-checks.md) owns the runner, cache/input isolation, artifacts, process cleanup and workflow contracts. The [safe aggregate](public-ci-proof-2026-10-18.json) records exact run/job identities, observed conclusions and artifact metadata. This is source/browser/export acceptance, not a new APK or public-release acceptance.

## Later follow-up — 2026-10-19

The [household MVP review](../reviews/2026-10-19-household-mvp-review.md) checks `2c496be`: the functional/protocol/Android-export job passes, but the extended UI smoke fails marker return focus at 430 px while the document is active. A fresh local run on that same clean revision passes 320/430/768. M00/U01/R02 keeps this intermittence open; the earlier passing foundation below does not establish current return-focus stability. The [new aggregate](household-mvp-review-proof-2026-10-19.json) preserves both results. The separate dependency audit still fails.

## Original acceptance checkpoint

| Check                     | Evidence                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clean Linux installation  | Fresh `npm ci --include=dev` passes in both public jobs; no personal inputs supplied                                                                                                                                           |
| Public provenance         | Guards pass before checks, before browser testing and after Android export                                                                                                                                                     |
| Functional coverage       | **573 Jest tests / 35 suites**, plus **6 Node tooling tests** pass locally; their CI steps also pass                                                                                                                           |
| Static checks             | TypeScript, ESLint and formatting pass locally and in CI; workflow formatting is included                                                                                                                                      |
| Decoder proof             | Installed query-string consumer uses patched decoder 0.5.0 and passes bounded malformed inputs                                                                                                                                 |
| HA protocol proof         | Official-client loopback proof passes; 18 fake services, no household server/device service                                                                                                                                    |
| Android JavaScript export | Hermes/DOM export passes on Linux with its own transform cache; tracked source remains unchanged                                                                                                                               |
| Browser smoke             | Playwright 1.64.1, matching Chromium; all 320/430/768 scenarios pass locally and in CI                                                                                                                                         |
| Browser scope             | Home/plan/Back, all floors, polygons and room list, unknown dimensions, selection semantics, seven feeder readings, persisted favorite, simulated On/Off and dismissal, target size, loaded offline routes and direct `/house` |
| Browser failures/network  | Local passing run records zero page errors and zero external requests; no HA connection is used                                                                                                                                |
| Isolation/cleanup         | Private/generated inputs and environment sentinels rejected; source symlink refusal, server closure and stuck-child termination tests pass; developer's generated plan unchanged                                               |
| CI artifacts              | Public UI upload: **443,887 bytes** compressed; dependency aggregate: **610 bytes**; seven-day retention, no bundles/source/private inputs uploaded                                                                            |

GitHub step conclusions and artifact metadata were read from the public API. The archived CI artifact contents were not downloaded; detailed local browser/audit aggregates are recorded separately from remote conclusions. UTC run timestamps are on 2026-10-19, corresponding to the user's 2026-10-18 evening in America/Chicago.

## Defect found and corrections

The smoke reproduced a web accessibility defect: Home room tabs had native `accessibilityState.selected` but no web `aria-selected`. `HomeScreen.tsx` now exposes the explicit selected attribute; the browser smoke checks it alongside the existing floor-tab semantics. This one source fix is newer than R03a build 1002. The accepted phone APK and its source/hash evidence remain unchanged; no device was operated for F02/R02.

Two runner assumptions also needed correction: the actual demo header is “Maurice · demo home”, and at widths with the Home miniature the polygon selector must be scoped to `house-scroll`. These initial failed attempts are not counted as passes or additional application defects. The complete three-width run passes after correction.

The first tooling test attempt hit the local sandbox's loopback restriction; rerunning with the required permission passes. A local Python helper's CA-store failure was handled by using the system TLS client to read public CI metadata; no certificate verification was disabled. Neither issue changes repository behavior.

## Dependency gate and limits

The fresh local lockfile audit still reports **63 affected entries: 51 high, 12 moderate, no critical**, rooted in braces, node-forge, sprintf-js and uuid. `check:audit` returns exit 1 and writes an aggregate; the remote audit job likewise fails at that step and preserves its artifact. No finding is suppressed or downgraded, and no failing audit is presented as a passing check. Read the [R01 assessment](dependency-maintenance.md) for exposure and remaining work.

No native signing/build/release automation or branch-protection change is included. Fresh offline web loads, TalkBack, large system text, private household captures, large-inventory performance, S02 Pixel, physical controls and the seven-day household observations remain separate. The UI test checks the 2D route, not 3D performance or renderer reliability.

At this original checkpoint, the next bounded work was **U01**. Its diagnostics/readability implementation and remaining native checks are now recorded in the [U01 ledger](diagnostics-accessibility-validation.md); use the [current delivery order](../README.md#delivery-order) for subsequent work. R01 maintenance continues independently; R03b still needs its own release decision.
