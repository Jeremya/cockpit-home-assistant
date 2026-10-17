# S01 — native Three.js feasibility

Date: 2026-10-15 (America/Chicago). Scope: the existing Expo DOM/Three.js lab in the working tree after `45df8a4`, with a public two-floor fixture and fake markers. No HA credentials, authenticated image URLs, device payloads or device service calls enter the scene.

## Decision

**Accepted: Three.js in Expo DOM is feasible for S02 on the Pixel 9 Pro and Seeker.** Both phones pass the embedded/offline, bridge, rendering and lifecycle suite on the same APK. Reuse this renderer and its native host in S02. The production spatial view remains ticket S02. This report covers a small, single-floor feasibility scene; it does not certify large homes, battery consumption, iOS or standalone household distribution (R03).

## Artifact and environment

- Expo 57.0.29, React Native 0.86.3, React 19.2.3, Three.js 0.186.1, Android ARM64/Hermes. No dependency was added or upgraded for this validation.
- Optimized embedded build: `NODE_ENV=production`, `EXPO_PUBLIC_S01_PROOF=1`, `debuggable=false`, release configuration with minification/resource shrinking disabled and a generated debug signing key. This is an isolated research APK, not a signed release candidate.
- Package `com.larrabee.homecockpit.s01proof` preserves the normal app's saved profiles and credentials. Native main bundle has the Hermes bytecode header; three DOM asset files are packaged under `assets/www.bundle/`. Native WebView inspection is enabled only in development or by the explicit S01 proof flag.
- APK: `.local/android/artifacts/maurice-s01-proof-arm64.apk`, **44,921,978 bytes**, SHA-256 **`6f8470d9a2cac69f28e244e20f6af7fa9982e3e621b12bca6ccb7b9f2d3bbe3a`**. Binary/build logs remain ignored.
- Geometry: [S01 public fixture](fixtures/s01-public-plan.json), with an L-shaped floor, a concave living room, a cutout, three rooms, low preview walls and three fake markers. Public fixture ID is present in the embedded bundle; the current private plan ID is absent. The private generated plan is restored after export/build.
- Renderer setting: 0.6-unit preview walls, antialiasing, pixel ratio capped at 2, no damping/continuous animation. This does not assert measured household wall heights.

## Measurement definitions

`renderer ready` starts inside the DOM component's mount effect and ends after its first successful `renderer.render`. `host ready` starts when the native scene host mounts and ends when the async readiness callback reaches native. It includes WebView/DOM initialization and bridge delivery, but excludes app process/React Native startup and navigation before the scene mounts. Cold start here means force-stop/relaunch, not an OS reboot or cleared shader caches.

Interaction FPS is **frames submitted by the renderer / pointer interaction duration**. P95 is spacing between animation-frame timestamps during that gesture; it is not GPU execution time or an Android compositor/presented-frame measurement. A real five-second ADB touch swipe orbits the native WebView; the counter is read afterward through the local Chrome inspector. The bounded read-only `sceneProbe` does not render or poll per frame. A separate three-second unchanged frame counter proves idle behavior. Initial layout/selection/resize invalidations can legitimately add idle frames; the idle cumulative total is not a leak metric.

Selection tests send touches to projected fixture targets in the actual Android WebView and assert the resulting native selection label. A two-pointer pinch must preserve selection. Desktop Chrome separately exercises an out-and-back orbit ending at its starting point, the concave cutout, responsive widths and actual resource disposal.

## Results

| Device / Android / WebView | Host ready | Renderer ready | Five-second orbit | P95 frame spacing | Idle / hidden / unfocused frame delta |
| --- | ---: | ---: | --- | ---: | --- |
| Pixel 9 Pro / 17 / 154.0.8037.107 | 382 ms | 129 ms | 591 frames / 4971.8 ms = **118.9 fps** | 8.4 ms | **0 / 0 / 0** |
| Seeker / 16 / 154.0.8037.106 | 558 ms | 136 ms | 596 frames / 5001.1 ms = **119.2 fps** | 8.4 ms | **0 / 0 / 0** |

Both exceed the ≥30 rendered-fps gate. Each completed all native checks below, including three resource-stable remounts and context-loss recovery. The complete aggregate values, resize widths and offline readiness are retained in the [machine-readable report](scene-proof-2026-10-15.json). These are individual short measurements, not statistical distributions or long-run thermal tests.

Earlier Seeker development measurement: 549 frames / 4964.1 ms = 110.6 rendered fps, 396 ms renderer readiness and zero idle frame delta. That run used Metro and private geometry; it is preliminary evidence only, not an apples-to-apples comparison with the final public-fixture APK. No private geometry or IDs are retained here.

## Lifecycle and failure checks

The native suite checks these behaviors on the isolated proof package:

1. Pick a concave room, then a fixture marker; tapping the floor cutout leaves native selection unchanged. Pinching does not select a room or marker.
2. Hide via `visible=false`: no pending frame and zero frame delta over three seconds. Show: a fresh frame arrives.
3. Push native Settings while the lab stays mounted: zero frame delta over three seconds and `visible=false`. Back returns to a visible scene.
4. HOME for three seconds, then resume the existing Activity: zero hidden-render count and only the expected resume invalidations. This is a short background transition, not a long OS suspension/eviction trial.
5. Temporarily change Android's display size, verify changed scene width and constant 380 CSS-pixel height, then restore the previous override. The app remains portrait; this does not test landscape.
6. Three native unmount/remount cycles: WebView inspector page count returns to zero on each unmount; each new scene returns to the same geometry/texture counts. This checks native container teardown and bounded scene resources, not total process PSS or a long-run memory soak.
7. Force a real WebGL context loss: native 2D fallback appears, the native room list still selects Kitchen, and deliberate Retry mounts a working 3D scene. The lab's fault flag clears on retry.
8. Remove USB reverse forwarding for Metro and disable Wi-Fi, force-stop/relaunch the proof APK, and verify DOM assets load from `file:///android_asset/www.bundle/`. Disable the WebView cache, block HTTP/HTTPS/WS/WSS through the inspector and reload the DOM scene successfully. Cellular connectivity was not disabled; embedded file URLs and the network-blocked reload establish the asset path. Restore Wi-Fi and any prior Metro forwarding afterward.

Desktop Chrome additionally verifies 320/430/768 CSS-pixel widths without horizontal overflow, zero idle/hidden frame deltas, and teardown of 15 geometries, 14 unique materials and six label textures. The observer is disconnected, eight owned listeners are removed, OrbitControls is disposed, the group is emptied, scheduled rendering is cancelled, and the WebGL context is explicitly lost. Three.js's historical `renderer.info.memory.textures` counter retains one internal texture after disposal; it is not reported as zero. The six scene-owned textures are disposed and the lost context releases its GPU resources.

## Changes made while measuring

- Use one WebGL context per mount; avoid allocating a separate availability-probe context.
- Stop queued rendering as visibility changes, including document visibility. Resume with explicit invalidation; suspend the readiness watchdog while inactive or unfocused.
- Classify gestures by maximum excursion, not only the final pointer position; an out-and-back orbit cannot become a tap. Ignore multi-touch selection.
- Reset gesture timing/frame statistics per interaction and measure the native-host readiness separately from renderer initialization.
- Dispose unique resources once, clear marker references when rebuilding floors, and avoid rebuilding equal geometry merely because the asynchronous bridge recreated its object.
- Reject callbacks from failed, unmounted or obsolete attempts and unknown current room/marker IDs. Late readiness cannot revive a failed scene.
- Fit all floor bounds to the camera frustum at the current aspect ratio, including perspective at the near edge. The first visual check exposed clipping; the final proof verifies every outline corner stays in frame on narrow screens.
- Keep the DOM canvas inside its host on web, and let the Android WebView retain touch gestures inside the native ScrollView.
- Retain a native room-list alternative, a 2D failure fallback and a working explicit Retry. The lab can open native Settings to measure route focus without inventing a second scene store.

## Reproduction and retained evidence

The normal development route is `homecockpit://scene-lab`, available through Diagnostics in a development build. It uses the current profile plan, which may be private. For shareable proofs always prepare the public fixture explicitly:

```sh
COCKPIT_PLAN_FILE=docs/stage0/fixtures/s01-public-plan.json npm run house:prepare
npx expo export --platform web --output-dir .local/house-validation/s01-web
npm run house:prepare
```

The local measurement helpers are retained in ignored `.local/android/build-s01-proof.py`, `.local/android/s01-native.mjs`, `.local/house-validation/export-s01.py` and `.local/house-validation/check-s01-browser.py`. They are local lab tooling, not checked-in CI (F02/R02 remain open). The build helper uses a temporary Gradle init script: create build type `s01Proof` from `release`, set application ID suffix `.s01proof`, matching fallback `release`, disable debuggability/minification/shrinking, use the debug signing config, and set app label `Maurice S01 proof`. Build `:app:assembleS01Proof` with `-PreactNativeArchitectures=arm64-v8a`; supply `NODE_ENV=production`, `EXPO_PUBLIC_S01_PROOF=1` and the fixture plan path during preparation/bundling. Restore generated plan bytes in a `finally` block.

On each unlocked, USB-authorized phone, install that APK with `adb -s <local-serial> install --no-streaming -r` (the initial streaming transfers exceeded the USB timeout; serialized non-streaming installs succeeded), then explicitly target its package when opening `homecockpit://scene-lab`. Never commit the serial. Discover the package's WebView inspector socket by PID, forward it locally, and read `[data-s01-scene].sceneProbe`. Use real native input for the sustained swipe and native navigation for the lifecycle checks above; do not equate a desktop screenshot with Android acceptance. Report only aggregates and public fixture identifiers.

Raw local reports/captures live under `.local/house-validation/s01/`. Aggregate device results are retained with this report without private geometry or hardware identifiers. All test-induced network/display overrides are restored. The normal app's credentials are never copied into the proof package.

Repository verification: **196 tests / 19 suites pass**, including the scene callback/lifecycle regressions; TypeScript, ESLint and configured Prettier checks pass. Public-fixture web export and Android embedded Hermes/DOM build pass. The S01 proof APK does not close dependency assessment, household HA behavior without Metro, daily-trial acceptance or release-signing work in R03.

## S02 handoff

Use the existing `CockpitSceneView` and `HousePlan`; do not introduce another renderer, entity store or HA connection. Feed P04 saved placements through native selectors and the existing sanitized bridge. Share floor/room selection and stable-key detail navigation with 2D/list. Native code must revalidate callbacks against the current profile/plan/placement state.

Before production use, replace fixture-only presentation with U04's current condition semantics, diff changed markers/materials instead of rebuilding everything, preserve accessible list/2D alternatives, and verify reduced motion and larger household scenes. Add S02-specific regression coverage for removed/hidden entities, profile changes, unknown/stale markers and repeated selection updates. This small feasibility result does not promise a production frame budget for cameras, textures, shadows or many more devices.
