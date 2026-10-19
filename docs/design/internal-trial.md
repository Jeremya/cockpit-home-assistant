# R03a — standalone Android candidate

The trial uses the actual Android `release` variant with embedded Hermes JavaScript, a dedicated local signing key and the isolated application ID `com.larrabee.homecockpit.trial`. Its name is **Maurice Trial**, scheme `mauricetrial`. It installs alongside the development client; credentials/preferences are separate and are entered through ordinary onboarding. This is an internal trial, not public-release acceptance.

The first candidate exposes HA observations, summaries, favorites, room links/placements, the 2D plan and simulated demo commands. That accepted 1002 binary keeps real Kasa disabled. **M01 Trial 1009** adds explicit per-device enrollment and is accepted on Pixel 9 Pro for the user-observed household lamp cycle; its [named-binary and physical acceptance](../stage0/power-enrollment-validation.md) is separate from the complete 1002 suite. 3D and the scene lab are gated out of this variant so S02's Pixel acceptance remains separate. Diagnostics identifies version/build, source and bundled-plan provenance. The [R01 assessment](../stage0/dependency-maintenance.md) carries the dated tooling findings and unexplained Fabric incident into exact-binary acceptance.

## Reproducible local build

Requirements: Node 24, `npm ci` with development dependencies/install scripts, JDK 17, Android SDK/NDK, Gradle-compatible native build tools, `unzip`. Set `JAVA_HOME`, `ANDROID_HOME`, optionally `ANDROID_USER_HOME` and `GRADLE_USER_HOME`; the runner can also read those four tool paths from ignored `.env.local`. It does not load other configuration from that file.

```sh
npm ci
npm run build:trial:android -- --build-number 1001
```

The runner copies allowlisted source into a new temporary directory, excludes private/generated files, installs the lockfile and R01 patch, prepares the public sample and regenerates Android using the checked-in config/plugin. Expo transforms use a new temporary cache. The existing generated Android project and prepared plan are not changed. No Metro server is needed to run the resulting app.

Output is ignored `.local/trial/sample/build-1001/`: APK, build manifest, signing/manifest inspection and build logs. The manifest records source revision/digest, dirty-source status, build/version, APK hash and signing-certificate hash. Acceptance is initially **candidate**, until that exact APK has passed phone checks. Use a greater build number for each update. The runner verifies package/version, non-debuggable release, isolated scheme, absence of the development launcher and development/storage permissions, embedded Hermes bytecode, disabled backup and explicit HTTP support.

Private configuration is never selected implicitly. Only after an explicit household choice, use:

```sh
npm run build:trial:android -- --build-number 1002 --private-plan .local/home-plan.json
```

That output goes to `.local/trial/private/` and contains the plan. Keep it local; do not attach or upload it. A source revision, demo mode or public-looking screenshot does not sanitize that APK. HA tokens are never part of the build and must be entered through the app.

## Signing, updates and data

The first build generates a dedicated RSA signing key and password record under ignored `.local/trial/signing/`, with private file permissions. Gradle receives the values through environment variables; app config and the APK contain neither password nor private key. Keep a secure local backup of both files: losing the key prevents in-place updates of this trial package. The runner never replaces a key when its password record is missing.

Install with `adb -s <device> install -r <apk>`; launch `com.larrabee.homecockpit.trial/.MainActivity`. Reuse the same key/package and increment the version code to preserve SecureStore and AsyncStorage through updates. Uninstalling this trial deletes its local data; reconnect through onboarding after reinstall. The development app's credentials are not migrated or read.

Android backup is disabled for the trial. Explicit cloud-backup and device-transfer rules exclude the credential-protected data domains used by preferences and SecureStore; a restored preference-only profile must not be mistaken for a restored native token. SecureStore's normal encryption remains in place. This policy trades automatic restore for a consistent fresh onboarding after reinstall; export/import and account recovery are separate work.

HA HTTP remains an explicit opt-in on the connection screen and is supported by the actual native network configuration. No OTA update service or update-signing workflow is configured. Keep production logs free of tokens; acceptance checks scan device logs without printing secrets.

## Installed-binary acceptance

Use `scripts/trial-ha-fixture.mjs` for terminal errors and recovery without altering the household server. It binds only loopback, speaks the official client's HA protocol, accepts only the public token `maurice-trial-proof`, reports counters and rejects every service call by default. M01's explicit `--power-proof` option permits only the closed simulated plug actions described in the [power contract](power-enrollment.md#fixture-and-verification-boundaries). Connect a named phone through `adb reverse`; no real device can be actuated by this fixture. Temporary fixture tests, real read-only HA checks and explicitly authorized physical checks must be identified separately in the evidence.

Record the device/OS and exact APK hash. With Metro stopped and its adb reverse removed, check first launch offline, demo observations/actions, sample assets and floor switching, absent 3D/lab entry points, profile/preferences persistence through process death and a signed binary update, foreground resync, cold start without the server, reconnect to a fresh snapshot, server restart, terminal auth/version errors surviving foreground, Retry/Settings, Forget and consistent fresh state after reinstall. Check enabled summary/link/placement flows, native backup/signing rules and production log redaction. Real actions require explicit per-device enrollment and authorization for the physical test; ordinary HA verification remains read-only. Keep Pixel and Seeker results separate; an unavailable phone is an open acceptance boundary.

The [Expo release-build guide](https://docs.expo.dev/guides/local-app-production/) and [variant guide](https://docs.expo.dev/build-reference/variants/) explain the build/signing and application-ID boundaries. The [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/) and [Android backup rules](https://developer.android.com/identity/data/autobackup) describe the platform storage/restore behavior.
