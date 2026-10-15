# 2D floor-plan validation

Date: 2026-10-15. Base commit: `db239bf` plus the floor-plan changes recorded with this report.

| Check                                  | Result                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/component/build-preparation tests | 57 pass across 10 suites, including geometry validation, public fallback, sanitized failure, offline screen rendering, floor switching and room picking                  |
| TypeScript, lint, formatting           | Passed                                                                                                                                                                   |
| Browser export                         | Passed                                                                                                                                                                   |
| Configured-plan browser workflow       | Passed: all floors, polygon picking, printed dimensions, cleared selection after floor change, offline interactions after loading, widths 320/430/768 px; no page errors |
| Android Hermes export                  | Passed, approximately 3.1 MB                                                                                                                                             |
| Native SVG build                       | Passed: ARM64 debug APK, `react-native-svg` 15.15.4, existing JDK 17 / Expo 57.0.29 / React Native 0.86.3 setup                                                          |
| APK installation                       | Passed with `adb install -r`; app data preserved                                                                                                                         |
| Native floor/room interaction          | Awaiting device unlock; do not infer this from successful compilation or browser checks                                                                                  |

The new development APK is `.local/android/artifacts/home-cockpit-house-debug-arm64.apk` (95,996,378 bytes), SHA-256 `4cfae3cbf1743d2bd91de87fdb75f88753539abfd5b634684800ad3891845ac6`. The earlier APK/report remains unchanged. Its direct build command matches [Android validation](android-validation.md), with the new SVG dependency autolinked by React Native.

The installed client still loads JavaScript through Metro over USB. The personal image trace, original reference, generated plan module, exported bundles and screenshots stay in ignored local paths. The public repository contains only the reusable viewer, preparation/validation code and an independent sample. Browser source-dimension checks do not verify measured building dimensions. This is 2D validation; the native 3D rendering/performance gate remains open.
