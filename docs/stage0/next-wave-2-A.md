# Wave 2 — A: shared Android candidate, phone slots and records

Dated report for lot A of [wave 2](../handoff/parallel/2026-11-16-wave-2.md), 2026-11-17. Base `main` at `0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, branch `work/wave2-A`, delivered as a PR under the PR delivery rule (PR #1). Only lot A writes this file. The wave-2 plan link resolves once PR #1 is merged.

## Summary

| Item | Maturity reached | Limit |
| --- | --- | --- |
| A1 — public proof APK of `0f6d5fb` | **Built** (reproducible command) + **Installed** and **launched without Metro** on the Seeker and the Pixel | No recette is accepted by this report; the Pixel's first screen was not seen (phone locked) |
| Phone slots | Seeker → B, then D; Pixel → C | Assigned by message, ADB always with `-s` |
| A2 — records | ADR-17/OQ-09 annotated, OQ-06 resolved, D02/D03 rows and integration links updated | Product decisions OQ-01/02/03 and ADR-18 left open |
| A3 — final candidate | Not started | Waits for the B/C/D fixes (C3 fix already announced, not in this APK) |

## A1 — public proof APK

### Command

```sh
npm run build:proof:android                 # HEAD
npm run build:proof:android -- --revision <sha>
```

New files: `scripts/build-proof-android.mjs`, `scripts/lib/proof-android.mjs` (identity + Gradle init) and `scripts/__tests__/proof-android.test.mjs`. This turns the ignored `.local/android/build-s02-proof.py` helper into a public command. The differences from that helper:

- **Exact source.** The script takes `git archive` of the commit into a temporary directory. No working-tree edit, ignored file, `.local/` or `.env*` enters the build. `npm ci` runs in that directory.
- **Clean environment.** It strips `EXPO_PUBLIC_*`, `COCKPIT_PLAN_*` and `MAURICE_*`, then sets `COCKPIT_PLAN_FILE=src/spatial/sample-plan.json`, `NODE_ENV=production`, `CI=1`, `EXPO_NO_DOTENV=1`, `EXPO_OFFLINE=1` and `EXPO_PUBLIC_S01_PROOF=1`. The last one is the existing inspector gate the spatial probes use.
- **Default variant.** `MAURICE_VARIANT` is unset, so `buildFeatures.spatial3d` is true. The `withTrialAndroid` plugin and the Trial key are untouched.
- **Gradle.** It adds an `s02Proof` build type copied from `release`: `applicationIdSuffix .s02proof`, not debuggable, no minify or shrink, debug signing. Then it runs `:app:assembleS02Proof -PreactNativeArchitectures=arm64-v8a`.
- **Built-in checks.** The APK identity is `com.larrabee.homecockpit.s02proof` and it is not debuggable. The Hermes header of `assets/index.android.bundle` is present. The number of `assets/www.bundle/assets/assets/furniture/*.glb` entries must equal the number of `.glb` files in `assets/furniture/` of the source.
- Output goes to `.local/proof/<sha12>/`, which is ignored. It holds the APK, `build.json`, the logs and `proof.gradle`.

Only JDK 17 and the SDK paths are read from `.env.local`.

### Artifact

| Field | Value |
| --- | --- |
| Source | `0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, clean `git archive` |
| Build script | worktree `work/wave2-A` (uncommitted); the script is not part of the source archive |
| applicationId | `com.larrabee.homecockpit.s02proof`, versionName `0.1.0`, versionCode `1` |
| Plan | public sample; the prepared plan has the same content as `sample-plan.json` |
| Features | default variant → 3D enabled; WebView inspector (`EXPO_PUBLIC_S01_PROOF=1`) |
| Signature | debug, certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (same key as C's earlier proof, so in-place update is possible) |
| APK | 44,747,029 bytes, SHA-256 **`66a7f47f75e065d5c44929cc0e21ddc69bc022006312de3f437f1bd5df80580d`** |
| Shared path | `/Users/jeremy/dev/cockpit-larrabee/.local/proof/0f6d5fb41e11/maurice-proof-0f6d5fb41e11-arm64.apk` + `build.json` (ignored) |
| Embedded GLB | **23 / 23** under `assets/www.bundle/assets/assets/furniture/` |
| Embedded Hermes bundle | yes (`c61fbc03c103191f`) |

The APK hash identifies this binary. The command reproduces the procedure, but Gradle/Metro do not guarantee byte-identical output across machines, so it is not a claim of bit-for-bit reproducibility.

### Installation and launch

| Device | Before | Action | Result |
| --- | --- | --- | --- |
| Seeker `SM02G4061971427`, Android 16, WebView 157.0.8103.38 | `.s02proof` from C (`b8467632…`, 2026-11-16), Trial `0.1.0-trial.12` in the foreground, dev client, `.s01proof` | `adb -s … install -r` (in-place update, data kept) | Installed hash `66a7f47f…` (`pm path` + `sha256sum`). No `adb reverse`. `am start -W` OK (241 ms). Process alive after 10 s. No `FATAL`. Home "Sample home" with the 2D preview. Trial untouched (`lastUpdateTime` 2026-11-16 13:58:19) |
| Pixel 9 Pro `47091FDAP000S2`, Android 17, WebView 157.0.8103.50 | **no Maurice package for user 0** (no Trial, no dev client) | `adb -s … install --user 0` | Installed hash `66a7f47f…` (`pm path --user 0` + `sha256sum`), versionName 0.1.0 / versionCode 1. No `adb reverse`. `am start -W --user 0` OK. Process alive. `ReactNativeJS: Running "main"` from the embedded bundle. No `FATAL`. The phone stayed locked (keyguard + dream), so the first screen was **not seen** |

**Pixel incident, diagnosed.** A plain `adb install` stayed blocked for about 50 minutes. It was neither a confirmation prompt nor the lock screen. The phone runs a second Android profile, `UserInfo{11:User:1030}` (probably Private Space), which `shell` cannot access: `pm list packages` without `--user` fails with `Shell does not have permission to access user 11`. The default install targets every user, so it never finished. Once the blocked process was stopped, `install --user 0` succeeded in a few seconds. **Rule for the Pixel: every `pm`/`install`/`am` command carries `--user 0`.** No manual action is needed to install. The owner only has to unlock the phone for the visual recettes.

What this establishes: the binary is **Installed** on both phones and starts without Metro. The first screen was seen on the Seeker only. Rendering the furniture, the spatial journeys, camera and accessibility belong to the B/C/D recettes on this exact binary.

## Phone slots

| Phone | Order | Status |
| --- | --- | --- |
| Seeker `SM02G4061971427` | 1. B (accessibility, TalkBack) → 2. D (9 camera scenarios, `adb reverse` on 2 ports) | B: go given, APK already installed. D: waits for B's explicit release, then A's go |
| Pixel `47091FDAP000S2` | C (spatial) | Go given to C after the hash check; owner unlock needed for visual interaction |

Rules sent to each agent:

- Always `adb -s <serial>`.
- Do not reinstall a candidate that is already installed.
- Never touch `com.larrabee.homecockpit.trial` (Trial 1012) or the dev client.
- No personal profile reset.
- Release the phone explicitly when done.
- A installs nothing while a recette is running.

## A2 — records

Changes in the worktree (not committed):

- `docs/architecture/decisions.md`, ADR-17: a dated **Correction (2026-11-17)** after the October text, which is kept. Embedding of the GLBs is proven. Their native loading failed at `ebce4f0` (WebView `fetch` refused on `file://`) and has been fixed since `45be3f1`. What October actually saw is not inferred.
- `docs/architecture/open-questions.md`: OQ-09 gets an **Annotation (2026-11-17)**. Embedding and loading are now separate, and the presence of the files no longer counts as rendering evidence. OQ-06 is marked **RESOLVED 2026-11-17**, with the list of the statements that were fixed.
- `docs/README.md`: a "Next wave integrated" paragraph links the four integration commits `a5342bb`/`c7ff0ad`/`45be3f1`/`0f6d5fb` to their reports and notes that "not committed" in those reports refers to their worktrees. It also fixes the stale D02 statements: the overview sentence "browser credentials stay in memory", the D01 row (memory-only scope kept as history) and roadmap item 3.
- `docs/BACKLOG.md` §4: the D02 row (Not started → Implemented on web) and the D03 row (panel delivered ≥ 1024 px).
- `package.json`: adds the `build:proof:android` script.

Not done here, on purpose:

- **ADR-19.** It is present as an uncommitted change in the main checkout (owner/coordinator). It is not duplicated in this worktree; the two hunks are separate and will merge at integration.
- **`proof:camera` description.** `docs/design/camera-images.md` §Verification still describes the three paths from before the fixture. That document belongs to D; D should update it in its lot. The `README.md` I01 row stays correct (redirect isolation through `npm run proof:camera`).
- **H01 inventory** (2 Bitaxe BM1370 reported by D; Nest/Schlage/SmartThings/Ring not configured in HA). This waits for `next-wave-2-D.md` before `inventory.md` and the registers are updated.

## Checks run (worktree `work/wave2-A`)

| Check | Result |
| --- | --- |
| `npm ci` (worktree) | pass; prepared plan has the same content as the sample |
| `npm run build:proof:android -- --revision 0f6d5fb…` | pass (Java 17, install, prebuild, assemble, identity/Hermes/23 GLB checks) |
| `npm run test:tooling` | **43/43** (including the 2 new `proof-android` tests) |
| `npm run lint`, `npm run format:check` | pass |
| `git diff --check` | pass |

The docs touched were not Prettier-clean at the base already, and they are outside `format:check`. Jest was not rerun: no application or Jest-covered file was changed. The `0f6d5fb` CI is the one recorded in the wave-2 plan.

## Next step (A3)

1. Receive the B/C/D patches. C has announced a C3 fix (`src/web/assetBytes.ts`: 15 s bound, abort, single settle), which is **not in `66a7f47f…`**.
2. Check each diff, integrate on a new SHA, then run typecheck/lint/format/Jest/tooling and push only if mandated.
3. `npm run build:proof:android` on that SHA. Install it in a free slot, then replay the affected recettes (C: loading/journeys; D: fixed scenarios; B: affected journeys). The `66a7f47f…` APK does not certify any later fix.
