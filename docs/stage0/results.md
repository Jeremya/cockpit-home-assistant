# Stage 0 and read-only foundation results

Date: 2026-10-14. Starting point: `5071157`, specification v3. That commit contained specifications only, so this implementation created the application scaffold and the read-only foundation.

Updated: 2026-10-15 after lifecycle/credential recovery corrections and installed Pixel validation, starting from `422aafd`. The specification is now v4.

## Implemented

- Expo SDK 57, Android development-client configuration, Router, TypeScript strict, Zustand and native persistence; exact package resolution in `package-lock.json`.
- Home with attention items, favorites and room sections; entity detail; connection settings; visibility/favorites/room overrides; diagnostics; explicitly simulated demo mode.
- Official HA client authentication and transport, with an independent decoder for the actual compressed entity stream.
- Complete replacement snapshots, explicit subscription epochs, coalesced resync, stale-epoch rejection, bounded required synchronization and optional registry timeouts.
- HA configuration-derived temperature units, identity preservation during registry failure, alias migration and structural sharing for unchanged entity records.
- Generation guards, foreground resynchronization, heartbeat recovery and intentional-disconnect handling.
- Origin-bound credentials with safe SecureStore keys, interrupted-write journal and serialized credential mutations. Observed entity states are never persisted as live truth.
- Local HA Container and a non-secret seed configuration; runtime/authentication data is excluded from Git.

## Verified here

| Check | Result |
|---|---|
| TypeScript strict checking | Passed |
| ESLint | Passed |
| Behavioral/unit/component tests | 47 tests passed across 8 suites (26 tests at the original foundation checkpoint) |
| Official-client protocol proof | Passed over real loopback WebSockets: authentication, compressed snapshot, immediate fresh resync, removed entity, coalescing, ping, forced reconnect, disconnect during first sync, active stream after resync timeout, and automatic sync retry; no device service calls |
| Android native prebuild | Passed; manifest includes Internet permission, cleartext LAN support and SecureStore backup rules |
| Android export | Passed; Hermes bundle generated (approximately 2.8 MB) |
| Native Android build and installed-app checks (2026-10-15) | ARM64 debug APK assembled and installed on Pixel 9 Pro / Android 17; Hermes, HA over Wi-Fi, native token persistence, foreground/refresh, auth-error recovery actions, Forget and demo/entity navigation passed. [Validation details](android-validation.md) |
| SDK dependency alignment | `expo install --check` passed |
| Web demo export | Passed; web is a preview, not a native credential-persistence target |
| Browser workflow (Chrome, mobile viewport) | Passed: demo startup, rooms, stable-key detail navigation, favorites, URL validation, entity settings; no page errors |
| HA onboarding (2026-10-15) | HTTP 200 on port 8123; user, core configuration, analytics and integration onboarding steps all report complete |
| Authenticated HA instance (2026-10-15) | Passed with the locally supplied token against HA `2026.10.1`: 44 entities, entity/device/area registries fresh, ping, fresh/coalesced resync, simulated foreground and forced reconnect; no service calls. [Recorded result](ha-proof-2026-10-15.json) |

The protocol proof runs under Node. The installed Pixel app separately exercised the official client under Hermes, including a real Wi-Fi connection to HA and the native lifecycle/storage checks documented in [Android validation](android-validation.md). This is a debug development client using Metro over USB; a standalone release APK has not been validated.

The configured-instance proof is repeatable with `HA_ALLOW_INSECURE_HTTP=1 npm run proof:ha`. The token is read from the ignored, owner-only `.local/ha-token` file (or `HA_TOKEN_FILE`) and never printed. The recorded first snapshot took 34 ms in one Node/loopback run; this is not a native-device performance measurement. Simulated foreground exercises the backend lifecycle API, not the Android OS. Entity presence alone does not establish vendor compatibility.

## Review corrections made while implementing

- The lower-level entity subscription explicitly disables automatic resubscription (`resubscribe: false`): Cockpit owns epochs and must not create competing restored subscriptions.
- Optional registry timeouts count as settled metadata for readiness. Event-subscription registration does not delay the usable first snapshot.
- Unsubscribe promises can reject when a socket is closed. Cleanup consumes those rejections; the real WebSocket proof caught and verified this fix.
- Failed registry access preserves known entity identity, while a successful registry response that removes an entry is authoritative. Re-created entities do not acquire an old UUID's preferences.
- SecureStore has no key enumeration API. A metadata journal records a pending safe storage ID before writing its token, so a partial save can be repaired. Save/forget mutations are serialized.
- The installed test renderer and worklets versions were aligned with the selected React/Expo versions instead of accepting incompatible latest transitive peers.

## Lifecycle review corrections (2026-10-15)

- The HA backend owns foreground liveness and recovery status. Terminal authentication/version errors survive background/foreground transitions, with Retry and Settings still accessible.
- Disconnecting during the first sync cancels that candidate without closing the client's connection or disabling its reconnect loop. Initial connection creation failures now have real retries; bootstrap no longer labels ordinary network failures as saved-credential failures.
- Candidate subscriptions coexist with the committed stream. A failed candidate cannot freeze updates or advance the displayed `syncEpoch`. The backend retries initial connection and synchronization failures at 1, 2, 4, 8, 16, then 30 seconds, while the official client continues to own existing transport reconnections.
- Foreground restarts heartbeat in `finally`, including when its first ping fails. Stop invalidates pending work and cancels retry/heartbeat timers. Tests also cover late connection completion and a foreground ping finishing after backgrounding.
- Requested settings are recorded before preferences load. Retry targets that request; Forget reads the committed active profile after queued saves settle. Credentials are also saved if an initially failed connection recovers later.
- Registry events during a refresh trigger a follow-up refresh. Unreachable errors include the specification's `likelyCauses`, as possibilities rather than a falsely precise network diagnosis.
- Durable cleanup ids cover superseded tokens after metadata commit and deletion after Forget. Credential reads and mutations share one queue. Restart repairs pending writes, pending deletion and metadata whose secret is missing.

Regression tests reproduced the original foreground-status, initial-sync interruption, frozen-stream, wrong-profile Forget, preferences-Retry, lost-registry-event and superseded-token defects before those fixes. Additional tests cover initial offline recovery and backoff, terminal retry suppression, resumed heartbeat and cancellation. The real-client protocol proof independently exercises the initial-disconnect ordering and timeout recovery.

## Pending native and household gates

- Complete the remaining Pixel fault checks: cold start without Wi-Fi, automatic recovery after network return, HA restart and entity removal while disconnected. Native authenticated camera images remain a later Stage 2 check.
- Validate every real vendor integration against the inventory. Neither the app's demo mode nor HA's demo integration proves Ring, Nest, Schlage, SmartThings or AIRTAP compatibility.
- Run the 3D feasibility prototype on the Pixel before Stage 3 implementation.
- Implement the Stage 2 command tracker and controls, including confirmation/ordering/no-replay tests, then camera images with verified freshness and redirect handling. The current UI exposes no physical controls.
- Validate iOS only when a target device and signing path are available.

## Dependency audit

The pinned SDK 57 dependency graph still reports npm audit findings, including transitive Expo/Metro/Jest tooling and a router URI-decoding path. The compatible `npm audit fix` was run; findings requiring incompatible SDK/Jest changes remain. At this checkpoint npm reported 64 findings (49 high, 15 moderate), with no critical finding. Do not treat the read-only development foundation as a production release. Resolve these through a deliberate compatible upstream update/patch or a reviewed SDK upgrade; a forced downgrade to the audit tool's suggested older Expo release was not applied.

Reproduce with `npm audit`. Keep this gate open before shipping a production binary or exposing a development server beyond the intended local development network.
