# R03a standalone Android acceptance — 2026-10-18

**Maurice Trial build 1002 is accepted for the bounded internal trial on Seeker (Android 16) and Pixel 9 Pro (Android 17).** Both phones run the same signed APK without Metro and connect to household HA in read-only use, with the user-selected public sample. The original Seeker checkpoint below is retained; the subsequent [Pixel ledger](internal-trial-pixel-validation.md) and [Pixel aggregate](internal-trial-pixel-proof-2026-10-18.json) record its separate battery. S02's Pixel production-3D measurements remain open. This is not public-release acceptance or completion of the proposed seven-day observation period.

The [trial architecture/build guide](../design/internal-trial.md) owns reproducible staging, signing, install/update and data policy. The [safe aggregate proof](internal-trial-proof-2026-10-18.json) records checks and exact artifacts; private/native raw logs remain ignored.

## Artifact identity

| Item                        | Recorded value                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Source revision             | `02b5ac647578d1edc2b5d6f383e10e5cc0b469bb`, clean source for both builds                                                           |
| Source digest               | `655d4296d9a1f4bdaf9c3b49182dba8d547de86c1495d950a0a1fb6a684d3734`                                                                 |
| Application                 | `com.larrabee.homecockpit.trial`; launcher **Maurice Trial**, scheme `mauricetrial`                                                |
| Accepted version            | `0.1.0-trial.2`, version code **1002**, ARM64                                                                                      |
| Accepted APK SHA-256        | `80f4fa803992be53801917fcefa8fa9b60c0f2159d4e4697341e20b9aa89650b`                                                                 |
| Earlier update baseline     | Build **1001**, SHA-256 `9afba40d3fc2644274a303567c2e20e1414a7ad5a7e2ada67a6744d29c0f8533`                                         |
| Signing certificate SHA-256 | `7191b909f58f9900cbfeb875c8d61ad5261efff9463b53b3e522c6b872261153`; same key for both versions                                     |
| Runtime                     | Seeker, Android 16; Hermes embedded bytecode, Fabric, release variant, non-debuggable                                              |
| Native RN library Build ID  | `89dd2a6210340221565500c9f9f21b1bf299c568`                                                                                         |
| Toolchain                   | Node 24.11.1, npm 11.11.0, Temurin JDK 17.0.20.1+1, Gradle 9.3.1, build-tools/compile/target API 36, min API 24, NDK 27.1.12297006 |

The local final APK is `.local/trial/sample/build-1002/maurice-trial-1002-arm64.apk`. Build receipts/logs are beside it; the stable private signing material stays under `.local/trial/signing/`. No key, token, private plan, installed application data or APK is committed. Later documentation-only commits do not change these tested source trees or this binary.

The accepted feature set is HA observations, device summaries/readings, favorites, room links/placements, 2D floors, diagnostics/settings and simulated demo commands. Real Kasa controls remain gated; 3D and the lab are unavailable in this variant. The APK contains the sample layout, not the household geometry. Trial preferences and credentials are separate from the development client's package.

## Installed-device evidence

This section records the original **Seeker** run. The [Pixel report](internal-trial-pixel-validation.md) separately records the later Android 17 acceptance, including its test-environment correction.

The first connection and update checks use the disposable loopback HA fixture. Household checks then use the actual native connection over Wi-Fi; they send no HA service and do not restart or modify the household HA server. The named final binary is used for the lifecycle, spatial, reinstall and household cases below. The earlier build is retained specifically as an update baseline.

| Case                             | Result and scope                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Metro dependency              | Project Metro stopped, development reverse removed; explicit launcher activity loads the embedded app                                                           |
| Signed binary update             | `1001 → 1002` with `adb install -r`; fixture credential in SecureStore, favorite and area link retained                                                         |
| Ten cold starts                  | Final release binary reaches Home ten times without Metro; no new native crash                                                                                  |
| Live/foreground observations     | Fixture state changes render, and foreground resync presents the fresh value                                                                                    |
| Server unavailable at cold start | Recovers automatically after fixture return; no manual Retry                                                                                                    |
| Actual server-process restart    | Disposable fixture process replaced; final app replaces the previous observation with the new initial snapshot without Retry                                    |
| Terminal errors                  | Fixture auth rejection and unsupported HA version remain terminal across foreground; Retry/Settings stay available and explicit Retry recovers after correction |
| Spatial preferences              | Native touches save a placement, marker opens the stable reading, process restart retains it, moving floors and removal pass                                    |
| Forget/reinstall                 | Forget removes the fixture connection across restart; uninstall/reinstall of this newly created trial package returns to empty onboarding                       |
| Household HA                     | Native HTTP opt-in and LAN connection pass; all three registries fresh; **91 visible entities** at the checkpoint                                               |
| Household navigation             | Two actual device summaries and related readings opened; no proprietary telemetry interpretation is added by this test                                          |
| Actual Wi-Fi loss/return         | Seeker Wi-Fi briefly disabled, app cold-started without HA, Wi-Fi restored; automatic recovery passes without Retry                                             |
| Household native token           | Process restart reconnects; no re-entry; known token absent from the checked native process logs                                                                |
| Final demo/plan scope            | Final APK checks sample floors, absent 3D, lab deep-link redirect and simulated On/Off; restart restores saved household HA                                     |

The fixture reports **zero service calls** across the recorded phases, including before/after its process restart. Real checks use observations/navigation only. Wi-Fi is restored. The separate development package's data and the original prepared private plan remain unchanged.

The two candidate APKs each have **1,220 decompressed files** checked for the known HA token, private-plan identifiers, local signing key and signing password; no match is found. Manifest/badging and compiled XML inspection confirm non-debuggable release, embedded Hermes bytecode, isolated scheme, no development launcher, blocked development/storage permissions, cleartext support for the explicit HA opt-in and disabled backup. The compiled rules exclude the credential-protected data domains used by SecureStore/preferences from cloud backup and device transfer. Actual cloud restore/OEM transfer was not performed; reinstall consistency was checked directly.

## Native incident and remaining limits

R01's original development-client Fabric incident remains unexplained. Its `libreactnative.so` Build ID differs from this release artifact. The ten successful release cold starts and the later lifecycle/navigation checks are new bounded evidence; they do not diagnose that earlier crash or prove long-term reliability. Keep the original [R01 record](dependency-maintenance.md) and capture the exact artifact/trace if a native incident recurs during the trial.

The npm audit refreshed on **2026-10-18** still reports **63 affected package entries (51 high, 12 moderate), four underlying tooling advisories**: braces, node-forge, sprintf-js and uuid. The R01 decoder fix/bridge stays installed and verified. No audit finding is suppressed; public distribution still requires R03b's stronger assessment and R02 automation.

**573 tests / 35 suites pass**, along with typecheck, lint and formatting. The decoder proof passes; the official-client loopback protocol proof still passes with 18 fake services. Both native candidates are built from freshly installed public staging directories with the locked R01 patch applied. A standalone Gradle release build provides the native/Hermes acceptance here; it is distinct from the older JS-only exports.

Some initial phone-helper attempts needed correction: the Connect label, the initial connection's retryable error presentation, a second attached phone requiring explicit Seeker selection, and registry rows below the visible viewport. These were automation expectations, not application code fixes; their failed attempts are not counted as passes. One inspection helper also had to resolve optimized Android resource filenames through the resource table before reading compiled backup XML.

The unavailable-server banner may currently show the generic “try again” wording while the backend automatically retries. Automatic recovery is verified; clearer retry wording belongs to U01 and trial feedback. TalkBack/large text, large inventories, other controls, cameras, iOS, S02 Pixel and the seven-day reliability period are not certified by this checkpoint. Phone orchestration remains local; the portable build and fixture are checked in, while F02/R02 automation remains open.

## Proposed seven-day household trial

Start when ready, using **Maurice Trial** on the Seeker or Pixel 9 Pro with the sample layout. HA still runs on the Mac; Mac/network availability remains H02 work. Existing HA devices stay connected through HA; the app's real controls remain disabled.

For each useful visit, note the task, whether the observation answered it, confusing states/navigation, any return to a vendor app, and any crash/restart/network context. Counts and short descriptions are enough; no analytics or raw HA data is needed.

| Period   | Focus                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Day 1    | Open the app in ordinary household use; check the devices/readings that matter and choose a few favorites       |
| Days 2–3 | Use favorites and related readings; note extra taps or explanations that obscure the useful value               |
| Day 4    | Note background/network behavior in normal use; preserve any unexpected stale/unknown state or restart context  |
| Days 5–6 | Continue ordinary use; count useful visits and reasons for reopening vendor apps                                |
| Day 7    | Review usefulness, confusion, native incidents and vendor-app returns; select the next bounded UX/hardware work |

Next engineering work: **F02/R02** reproducible public smoke and CI while the trial runs, then focused **U01** improvements from observed friction. C07a enrollment/physical acceptance and S02 Pixel remain independent side gates. The trial is ready to start; seven days of household observations have not been collected yet.
