# Android native validation

Date: 2026-10-15. Target: Pixel 9 Pro (Android 17), ARM64, package `com.larrabee.homecockpit`.

## Build environment

| Component           | Version / configuration                          |
| ------------------- | ------------------------------------------------ |
| Host                | Apple Silicon Mac                                |
| Java                | Temurin OpenJDK 17.0.20.1+1 (local installation) |
| Gradle wrapper      | 9.3.1                                            |
| Expo / React Native | 57.0.29 / 0.86.3                                 |
| Android SDK         | API 36; minimum API 24                           |
| Build Tools         | 36.0.0; AGP also installs its 35.0.0 default     |
| NDK                 | 27.1.12297006                                    |
| CMake               | 3.22.1                                           |
| Native architecture | `arm64-v8a`                                      |

The SDK, Gradle cache and Android user preferences were installed under `.local/android/`, which is ignored by Git. The official Google command-line-tools ARM64 archive was checked against the checksum in Google's SDK repository metadata before extraction. No Android Studio installation was needed for this command-line build.

`.env.local` records this machine's `ANDROID_HOME`, `ANDROID_USER_HOME`, `GRADLE_USER_HOME` and `JAVA_HOME`. It is ignored by Git. Expo's Android command loads these values automatically, so `npm run android` can use this local SDK. Other machines can use their own existing SDK/JDK paths.

The native build sets `NODE_ENV=development` and uses the generated Gradle wrapper with `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4 --console=plain`. The generated `android/` project is ignored by Git; changes to native configuration belong in `app.json` or an Expo config plugin.

## Build correction

The installed Homebrew JDK 25 ran Gradle and compiled the Kotlin modules, but failed in the Android Prefab/CMake configuration task: a restricted-native-access warning from Java was treated as an error by the Android build tooling. A locally downloaded Temurin JDK 17 replaces it for this project, matching the Android Gradle Plugin's documented JDK baseline. Its archive was verified against the SHA-256 supplied by Adoptium before extraction. No system Java installation or shell profile was changed.

## Artifact and reproduction

The development APK is stored at `.local/android/artifacts/home-cockpit-debug-arm64.apk` (89,463,461 bytes). SHA-256: `26db62de64e6ec793010a74ba37968a4f8af208c8ab6ddec7c14914991c4243e`. It is signed with the generated debug key and is excluded from Git.

`npm run android` loads the local SDK/JDK configuration and builds/installs through Expo. `npm start -- --localhost --port 8081` runs Metro; USB reverse forwarding on port 8081 delivers the development bundle to the Pixel. HA itself was reached using the Mac's LAN address over Wi-Fi, independently of this Metro tunnel.

For a direct build without a connected phone, run from the repository root with these local tool locations (adjust for another machine):

```sh
npx expo prebuild --platform android --no-install
export ANDROID_HOME="$PWD/.local/android/sdk"
export ANDROID_USER_HOME="$PWD/.local/android/user"
export GRADLE_USER_HOME="$PWD/.local/android/gradle"
export JAVA_HOME="$PWD/.local/android/jdk/jdk-17.0.20.1+1/Contents/Home"
cd android
NODE_ENV=development ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4 --console=plain
```

The generated APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Installation used `adb install -r` on the authorized USB device. Hermes was enabled in the compiled BuildConfig, and the uncompressed `libhermesvm.so` ZIP entry's offsets matched segments mapped from the installed APK into the running Cockpit process. The app's native interface and HA connection both executed on the Pixel.

## Acceptance checks

| Check                                                          | Status                                                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK tools installed and expected packages present              | Passed                                                                                                                                                                                  |
| Gradle wrapper runs and configures native Expo modules         | Passed                                                                                                                                                                                  |
| ARM64 debug APK assembled                                      | Passed: 89,463,461 bytes; ARM64 only; `libhermesvm.so` included                                                                                                                         |
| Pixel detected and USB debugging authorized                    | Passed: Pixel 9 Pro, Android 17                                                                                                                                                         |
| APK installed; app launches with Hermes                        | Passed: app renders on the Pixel; `libhermesvm.so` mapped from the installed APK; Hermes enabled in BuildConfig                                                                         |
| Offline demo navigation and entity details                     | Passed: Explore demo home, Side door detail, simulated observation and no physical controls                                                                                             |
| HA setup using the supplied token and the Mac's LAN address    | Passed over Wi-Fi; Home shows Synced with HA                                                                                                                                            |
| Token survives process restart and reconnects automatically    | Passed: force-stop, relaunch and automatic HA sync without token entry                                                                                                                  |
| Native pull-to-refresh requests a fresh epoch                  | Passed: sync epoch 2 → 3, ready with 44 entities and fresh registries                                                                                                                   |
| Initial offline launch recovers after Wi-Fi returns            | Passed: Wi-Fi disabled, process cold-started with Metro still over USB; non-ready state observed; automatic recovery 13 seconds after Wi-Fi enabled, no Retry                           |
| Background/foreground resynchronizes without a stuck banner    | Passed: same running app resumes via launcher, sync epoch 1 → 2, ready with 44 entities and fresh registries                                                                            |
| Server restart/reconnect removes deleted entities              | Passed: temporary synthetic sensor raises native count 44 → 45; HA stop shows reconnecting; HA start restores ready with 44 entities and all registries fresh after 8 seconds, no Retry |
| Invalid token preserves Settings/Retry after foreground return | Passed: auth rejection remains terminal after a real HOME/launcher cycle; Retry and Connection settings remain visible                                                                  |
| Forget prevents automatic reconnection after process restart   | Passed: Forget returns to welcome; cold relaunch permits starting the offline demo without an HA connection                                                                             |

The server-restart fixture was a temporary state created through `POST /api/states/sensor.cockpit_recovery_probe`, after checking that it did not already exist. It has no backing integration, so it disappears when HA restarts. Diagnostics on the Pixel observed the added entity, the disconnected session, then the authoritative replacement count with fresh registries. A subsequent API check confirmed the fixture absent. No device services were called. This verifies removal of an ephemeral entity during a transport outage; deletion/recreation of real registry identities remains covered by the separate mapper/protocol tests, not by this native fixture.

## Interface follow-up

The same installed development client rendered the updated midnight palette and bundled Feather font, the room-filtered grid, global attention and the observed-state detail. On the Pixel, selecting Kitchen showed its four demo observations; opening Fridge temperature showed 37 °F with explicit simulated provenance. The normal HA connection was restored afterward: 44 total entities, 35 visible, all registries fresh. The current HA demo has no area assignments; its Unassigned group is not counted as a room.

These interface changes were delivered by Metro. The APK size, hash and native build source recorded above still describe the earlier native artifact; no new native module was added. The [design direction](../design/2026-10-15-interface-direction.md) includes shareable browser captures using only Cockpit's simulated data.

The debug development client needs Metro (`npm start`) to load the app. The machine-readable results are in [the Android proof report](android-proof-2026-10-15.json). Actual vendor compatibility, physical controls, camera images, 3D rendering and production signing remain separate gates.

JDK baseline reference: [Android Gradle Plugin 8.12 compatibility](https://developer.android.com/build/releases/agp-8-12-0-release-notes?hl=en).
