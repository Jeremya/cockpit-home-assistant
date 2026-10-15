# Stage 0 and read-only foundation results

Date: 2026-10-14. Starting point: `5071157`, specification v3. That commit contained specifications only, so this implementation created the application scaffold and the read-only foundation.

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
| Behavioral/unit/component tests | 26 tests passed across 7 suites |
| Official-client protocol proof | Passed over a real loopback WebSocket: authentication, compressed snapshot, immediate fresh resync, removed entity, coalescing, ping and forced reconnect; no device service calls |
| Android native prebuild | Passed; manifest includes Internet permission, cleartext LAN support and SecureStore backup rules |
| Android export | Passed; Hermes bundle generated (approximately 2.8 MB), not an APK |
| SDK dependency alignment | `expo install --check` passed |
| Web demo export | Passed; web is a preview, not a native credential-persistence target |
| Browser workflow (Chrome, mobile viewport) | Passed: demo startup, rooms, stable-key detail navigation, favorites, URL validation, entity settings; no page errors |
| HA Container | Running on port 8123; initial owner setup remains incomplete |

The protocol proof runs under Node, not Hermes. The Android bundle compiles the actual official client for Hermes, but running it on the Pixel is still required to prove runtime behavior.

## Review corrections made while implementing

- The lower-level entity subscription explicitly disables automatic resubscription (`resubscribe: false`): Cockpit owns epochs and must not create competing restored subscriptions.
- Optional registry timeouts count as settled metadata for readiness. Event-subscription registration does not delay the usable first snapshot.
- Unsubscribe promises can reject when a socket is closed. Cleanup consumes those rejections; the real WebSocket proof caught and verified this fix.
- Failed registry access preserves known entity identity, while a successful registry response that removes an entry is authoritative. Re-created entities do not acquire an old UUID's preferences.
- SecureStore has no key enumeration API. A metadata journal records a pending safe storage ID before writing its token, so a partial save can be repaired. Save/forget mutations are serialized.
- The installed test renderer and worklets versions were aligned with the selected React/Expo versions instead of accepting incompatible latest transitive peers.

## Pending native and household gates

- Finish HA onboarding at `http://localhost:8123` and create a dedicated user's long-lived token. No owner account or password was created automatically.
- Install Android SDK / Android Studio, build and install the development client, then validate URL/token setup, SecureStore, HTTP WebSocket plus authenticated images, background recovery and reconnect on the Pixel 9.
- Validate every real vendor integration against the inventory. Neither the app's demo mode nor HA's demo integration proves Ring, Nest, Schlage, SmartThings or AIRTAP compatibility.
- Run the 3D feasibility prototype on the Pixel before Stage 3 implementation.
- Implement the Stage 2 command tracker and controls, including confirmation/ordering/no-replay tests, then camera images with verified freshness and redirect handling. The current UI exposes no physical controls.
- Validate iOS only when a target device and signing path are available.

## Dependency audit

The pinned SDK 57 dependency graph still reports npm audit findings, including transitive Expo/Metro/Jest tooling and a router URI-decoding path. The compatible `npm audit fix` was run; findings requiring incompatible SDK/Jest changes remain. At this checkpoint npm reported 64 findings (49 high, 15 moderate), with no critical finding. Do not treat the read-only development foundation as a production release. Resolve these through a deliberate compatible upstream update/patch or a reviewed SDK upgrade; a forced downgrade to the audit tool's suggested older Expo release was not applied.

Reproduce with `npm audit`. Keep this gate open before shipping a production binary or exposing a development server beyond the intended local development network.
