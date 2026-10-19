# R03a Pixel 9 Pro acceptance — 2026-10-18

**Maurice Trial build 1002 is accepted for the bounded internal trial on Pixel 9 Pro, Android 17 (API 37).** This extends the earlier Seeker acceptance using exactly the same signed ARM64 APK, with the public sample plan, 2D navigation and read-only household HA observations. Real controls and trial 3D remain disabled.

The [safe Pixel proof](internal-trial-pixel-proof-2026-10-18.json) records the individual native checks. The [original acceptance ledger](internal-trial-validation.md) retains the Seeker evidence and shared artifact, build, signing, privacy and dependency assessment; those checks are not relabeled as fresh Pixel runs.

| Identity           | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Application        | `com.larrabee.homecockpit.trial`, **Maurice Trial**                               |
| Final version      | `0.1.0-trial.2`, code **1002**                                                    |
| Final APK SHA-256  | `80f4fa803992be53801917fcefa8fa9b60c0f2159d4e4697341e20b9aa89650b`                |
| Update baseline    | Code **1001**; same signing certificate                                           |
| Source revision    | `02b5ac647578d1edc2b5d6f383e10e5cc0b469bb`; no rebuild or application-code change |
| Native RN Build ID | `89dd2a6210340221565500c9f9f21b1bf299c568`                                        |

## Native results

The trial package was absent before installation. Every ADB operation explicitly targets the Pixel while the Seeker remains attached. Only the newly created fixture profile is removed during the reinstall test; the development application's package and data are not modified. Its install/update metadata remains unchanged.

| Case                          | Pixel result                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed update 1001 → 1002     | Native credential, favorite and room link retained                                                                                                 |
| Ten cold starts without Metro | Final binary reaches Home; no new native crash                                                                                                     |
| Observation lifecycle         | Live changes and foreground snapshots show the new value                                                                                           |
| Network/server recovery       | Cold start with unavailable fixture and fixture-process replacement recover without Retry; the replacement snapshot supersedes the old observation |
| Terminal auth/version errors  | Remain visible after background/foreground; Retry/Settings stay available; explicit Retry recovers after correcting the fixture                    |
| Spatial preferences           | Touch/save, marker-to-reading navigation, restart persistence, floor move and removal pass                                                         |
| Forget and reinstall          | Forget persists after restart; fresh reinstall has empty onboarding without Metro                                                                  |
| Actual household HA           | LAN HTTP opt-in, fresh registries, native token persistence and two device summaries/readings pass                                                 |
| Actual Wi-Fi interruption     | Wi-Fi disabled for an offline cold start, restored in cleanup; automatic reconnection passes without Retry                                         |
| Final sample/demo scope       | Three sample floors, absent 3D, redirected lab deep link and simulated On/Off pass; restart restores the saved household connection                |

Initial installation, update and spatial checks ran with the embedded release while an old project Metro was still listening on port 8081. The initial helper checked only 8082. After detecting it, the project server was stopped, both Pixel development forwards were removed, and the lifecycle suite including ten cold starts was rerun. Fresh reinstall/onboarding, server restart, household Wi-Fi recovery and final demo checks then ran without either Metro port. This changes the test environment and evidence, not application code.

The fixture records **zero service calls**, including on both sides of its process restart. Household tests perform observations and navigation only; they neither actuate devices nor restart the real HA server. The known token is absent from the checked native process logs. Raw device logs, credentials and screenshots stay ignored locally. No new native crash is detected across the accepted phases.

At handoff, Wi-Fi is enabled, the fixture is stopped and its Pixel reverse removed, Metro is stopped, and Maurice Trial displays the saved household connection.

## Scope and next steps

This is acceptance of the named **2D/read-only standalone trial**, not S02 production-3D acceptance on Pixel. S02 requires its own enabled artifact and measurements. C07a scoped enrollment/physical actuation, TalkBack/large text, actual cloud/OEM restore, the seven-day household observations and public distribution remain open. The original R01 development-client native incident is still unexplained; successful starts of this different release artifact do not diagnose it. Four tooling advisories remain tracked.

Visual inspection of the public Floor 2 screenshot also shows a polish item: a marker placed near a room-label center can obscure the room name with its icon/caption. This is tracked under U01; resolving the label collision must preserve the saved physical point and the accessible marker list. It is not a failed placement/navigation check.

The previous **573-test / 35-suite** source checkpoint and build/manifest/privacy checks still apply to these unchanged APKs; JavaScript checks were not rerun for this documentation-only update. Next engineering work remains **F02/R02 public smoke and CI**, alongside the proposed household trial, followed by U01 from observed friction.
