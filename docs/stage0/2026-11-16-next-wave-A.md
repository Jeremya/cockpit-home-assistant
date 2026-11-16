# Next wave — A: validation base and build compatibility

Dated report of lot A from [the 16 November next wave](../handoff/parallel/2026-11-16-next-wave.md). Evidence level: **Automated** for the source and **JS artifacts produced** for the candidate. No APK was built, installed or observed. The coordinator owns reconciliation of `docs/README.md`, `docs/BACKLOG.md` and the ADR/OQ registers.

## Checkpoint

- Base `ebce4f06f730b6311a24634d40e7afc314fedf92`, isolated worktree `work/next-wave-a` created **outside** the main checkout, with its own `node_modules` and no `.local/`.
- Node 24.11.1, npm 11.11.0, macOS (darwin 25.5). `npm ci --include=dev --no-audit --no-fund` passed, and the tracked files did not change.
- The worktree change is uncommitted: `jest.config.js` (+4 lines) and the new `scripts/__tests__/jest-discovery.test.mjs`. Nothing was committed or pushed.

## 1. Jest discovering agent worktrees — reproduced and fixed

**Reproduction** on the main checkout (`ebce4f0`, five agent worktrees under `.claude/worktrees/`): `jest --listTests` lists **462** files. **381** of them are under `.claude/`. The other 81 are exactly `git ls-files` filtered on `__tests__/**/*.test.ts(x)`. The jest-expo preset defines no `testPathIgnorePatterns`, so only Jest's default `/node_modules/` applied.

**Fix** (`jest.config.js`):

```js
testPathIgnorePatterns: ["/node_modules/", "<rootDir>/\\.claude/"],
modulePathIgnorePatterns: ["<rootDir>/\\.claude/"],
```

The exclusion is anchored at `<rootDir>`, so it does not hide any tracked suite. `modulePathIgnorePatterns` also keeps the duplicate `home-cockpit` packages of the worktrees out of the haste map.

**Regression test** (`scripts/__tests__/jest-discovery.test.mjs`, run by `npm run test:tooling`): it creates a temporary probe worktree under `.claude/worktrees/`, then requires that the discovered list equals the tracked list exactly. It removes only what it created.

- Before the fix: **fail** (`a .claude/ worktree suite was discovered`).
- After the fix: **pass**.
- The fixed config applied to the contaminated main checkout: **81** files, **0** under `.claude/`.

Out of scope, intentionally: the sibling worktrees `~/dev/maurice-*` live outside `<rootDir>` and were never discovered. No old worktree was deleted.

Side effect for the coordinator: `scripts/build-trial-android.mjs` includes `jest.config.js` in the source digest, so the next trial's provenance hash will change even though the bundle does not.

## 2. Remote CI at the exact SHA

Read through `gh run list --commit ebce4f0…`, without inferring anything from local runs:

| Workflow | Run | headSha | Conclusion | Jobs |
| --- | --- | --- | --- | --- |
| Dependency audit | [43962209373](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/43962209373) | `ebce4f06f730…` | success | Dependency policy (2026-11-16 21:39:02→21:39:16Z) |
| Public checks | [43962209753](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/43962209753) | `ebce4f06f730…` | success | Tests/protocol/Android JS; Public UI; 3D web lifecycle (software WebGL); detail panel; browser sign-in, all success (21:39:02→21:41:37Z) |

This is the CI result for `ebce4f0` as pushed, without this lot's fix. In CI no `.claude/` exists, so the contamination was local only.

## 3. Clean public checkout — local chain

The same environment as `public-checks.yml` (`CI=1`, `EXPO_NO_DOTENV=1`, `EXPO_OFFLINE=1`, `COCKPIT_PLAN_FILE=src/spatial/sample-plan.json`, isolated `TMPDIR`), on the worktree with the fix:

| Step | Result |
| --- | --- |
| `check:public-inputs` (before and after the exports) | pass |
| `typecheck`, `lint`, `format:check` | pass |
| `npm test -- --watch=false` | **81 suites / 1146 tests pass** (58 s) |
| `test:tooling` | **37/37 pass** (including the new discovery test) |
| `proof:dependencies`, `proof:protocol`, `proof:camera` | pass |
| `export:android -- --source-maps` + `check:runtime-dependencies -- dist android` | pass |
| `check:audit`, `check:audit:strict` | pass (local registry on 2026-11-16) |
| `git status` after the chain | only the two lot-A files |

Harness note for the other agents: on macOS, `tsx` opens a Unix socket under `TMPDIR`. A long scratchpad path exceeds the roughly 104-byte limit and fails with `listen EINVAL` before any proof runs. Use a short `TMPDIR` (`mktemp -d -t mx`), as CI does with `RUNNER_TEMP`. This is not a repository defect.

## 4. Expo paths touched by the overrides

A clean audit does not prove compatibility, so I located the consumers and then exercised each path.

| Override | Real consumers (`node_modules`) | Path exercised | Result |
| --- | --- | --- | --- |
| `zod@^3.25.76 → 4.6.7` (in `@expo/cli`) | `start/server/DevToolsPlugin.schema.js`, `createMCPDevToolsExtensionSchema.js` (dev server, devtools plugins/MCP) | `expo start --dev-client --port 8099`: `/status` running, Android manifest 200, **Android dev bundle 200** (1692 modules, 7.4 MB, 9.3 s), web index 200. The schemas were then executed directly: valid accepted, invalid rejected, `.url()` enforced | pass. The project has no devtools plugin, so `start` loads the schema without parsing a real plugin; the direct run covers that gap |
| `glob@^13 → 14.0.6` | `@expo/cli` (`export/embed/exportEmbedAsync`, `metro/router`, `prebuild/renameTemplateAppName`, `utils/glob`), `@expo/config` (`Config.js`), `@expo/config-plugins` (`android/Paths`, `Package`), `@expo/fingerprint` (`ProjectWorkflow`), `@expo/metro-config` (`getWatchFolders`) | `expo config --type public`; `expo prebuild --platform android --no-install` (**43 files**, same count as the [dependency-ci ledger](dependency-ci-validation.md) for the default variant); `expo export:embed --platform android --dev false`; `fingerprint:generate --platform android`; `export:android`; `expo start` (router/watch folders) | pass |
| `minimatch@^10.2.2 → 11.0.8` | `@expo/fingerprint`, `@typescript-eslint/typescript-estree` | `fingerprint:generate` (hash `730b524b…`); `lint` | pass |

**Not exercised:** Gradle `assembleRelease`/`assembleDebug` (with the Hermes compilation of the embedded bundle), `expo run:android`, and an install on a device. The `export:embed` + prebuild chain is the JS/config part of the APK build; the native part stays with the coordinator.

## 5. Validation candidate (integrated source, sample)

The candidate is identified, not installed:

| Item | Value |
| --- | --- |
| Source | `ebce4f0` + the lot-A diff (`jest.config.js`, the tooling test). Neither file is in the bundle |
| Plan | public sample (`COCKPIT_PLAN_FILE=src/spatial/sample-plan.json`, no `.local/`) |
| Variant | default (`MAURICE_VARIANT` unset): `extra.maurice` is absent, so `buildInfo.trial=false` and **3D is enabled** (`src/config/build.ts`) |
| OTA/JS export | `dist/_expo/static/js/android/entry-1d11bc52….hbc`, SHA-256 `eb39320362c7a2d23a1b21193c99966ea6b7c21720647e2ad42d8bc5ebd53b35`; 55 assets, including **23 `.glb`** |
| APK path (`export:embed`) | `index.android.bundle` (non-Hermes, before Gradle), SHA-256 `460dd1af48aa597e9d62ed3b97704b29dda8f4a933b66ff9c2f5ceac5bc2a432`, 2,268,379 bytes; 31 Android resources plus **23 `.glb` under `www.bundle/assets/assets/furniture/`**, as recorded in OQ-09 |

These hashes are local JS artifacts, not APK hashes. Metro bundles are not guaranteed reproducible between machines, so compare them only within one environment.

**Path for C (3D allowed, without touching Trial 1012):** use the existing default-variant build path, which is distinct from the trial package and keeps 3D enabled. The documented debug path is in [android-validation](android-validation.md) (`NODE_ENV=development`, `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a`, dev client + Metro). The release/`export:embed` path is the one that settled [OQ-09](../architecture/open-questions.md) (GLBs under `assets/www.bundle/…`). Do not set `MAURICE_VARIANT=trial`; it is the only variant that turns 3D off. The coordinator triggers the build and assigns the phone slot.

## Limits and next step

- No APK built, no device, no HA, no remote CI on the fix (it is not pushed).
- The strict audit was green on 2026-11-16 against the registry of that day. It is not a lasting state.
- For the coordinator: (1) review and integrate the lot-A diff; it does not change the lockfile, so the other agents' base stays the same; (2) push it and read the CI for that SHA; (3) build the APK candidate from the default variant on that SHA for C; record its APK hash and the presence of the 23 GLBs in `assets/www.bundle`.
