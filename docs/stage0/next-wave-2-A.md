# Wave 2 — A: shared Android candidate, phone slots and records

Dated report for lot A of [wave 2](../handoff/parallel/2026-11-16-wave-2.md), 2026-11-17. Base `main` at `0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, branch `work/wave2-A`, delivered as a PR under the PR delivery rule (introduced by PR #1, now in `AGENTS.md`). Only lot A writes this file. The wave-2 plan link resolves once PR #1 is merged.

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
- **Gradle.** It adds an `s02Proof` build type initialized from the app's `release` build type (`initWith`, so it inherits whatever the generated `release` declares, then overrides): `applicationIdSuffix .s02proof`, not debuggable, no minify or shrink, debug signing. Then it runs `:app:assembleS02Proof -PreactNativeArchitectures=arm64-v8a`.
- **Built-in checks.** The APK identity is `com.larrabee.homecockpit.s02proof` and it is not debuggable. The Hermes header of `assets/index.android.bundle` is present. The number of `assets/www.bundle/assets/assets/furniture/*.glb` entries must equal the number of `.glb` files in `assets/furniture/` of the source.
- Output goes to `.local/proof/<sha12>/`, which is ignored. It holds the APK, `build.json`, the logs and `proof.gradle`.

Only JDK 17 and the SDK paths are read from `.env.local`.

### Artifact

| Field | Value |
| --- | --- |
| Source | `0f6d5fb41e1126d4e5fb82f6626458b96f0e59cb`, clean `git archive` |
| Build script | worktree `work/wave2-A` (uncommitted at A1, committed since in `fe728fb`); the script is not part of the source archive |
| applicationId | `com.larrabee.homecockpit.s02proof`, versionName `0.1.0`, versionCode `1` |
| Plan | public sample; the prepared plan has the same content as `sample-plan.json` |
| Features | default variant → 3D enabled; WebView inspector (`EXPO_PUBLIC_S01_PROOF=1`) |
| Signature | debug, certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (same key as C's earlier proof, so in-place update is possible) |
| APK | 44,747,029 bytes, SHA-256 **`66a7f47f75e065d5c44929cc0e21ddc69bc022006312de3f437f1bd5df80580d`** |
| Shared path | `<main checkout>/.local/proof/0f6d5fb41e11/maurice-proof-0f6d5fb41e11-arm64.apk` + `build.json` (ignored) |
| Embedded GLB | **23 / 23** under `assets/www.bundle/assets/assets/furniture/` |
| Embedded Hermes bundle | yes (`c61fbc03c103191f`) |

The APK hash identifies this binary. The command reproduces the procedure, but Gradle/Metro do not guarantee byte-identical output across machines, so it is not a claim of bit-for-bit reproducibility.

### Installation and launch

| Device | Before | Action | Result |
| --- | --- | --- | --- |
| Seeker, Android 16, WebView 157.0.8103.38 | `.s02proof` from C (`b8467632…`, 2026-11-16), Trial `0.1.0-trial.12` in the foreground, dev client, `.s01proof` | `adb -s … install -r` (in-place update, data kept) | Installed hash `66a7f47f…` (`pm path` + `sha256sum`). No `adb reverse`. `am start -W` OK (241 ms). Process alive after 10 s. No `FATAL`. Home "Sample home" with the 2D preview. Trial untouched (`lastUpdateTime` 2026-11-16 13:58:19) |
| Pixel 9 Pro, Android 17, WebView 157.0.8103.50 | **no Maurice package for user 0** (no Trial, no dev client) | `adb -s … install --user 0` | Installed hash `66a7f47f…` (`pm path --user 0` + `sha256sum`), versionName 0.1.0 / versionCode 1. No `adb reverse`. `am start -W --user 0` OK. Process alive. `ReactNativeJS: Running "main"` from the embedded bundle. No `FATAL`. The phone stayed locked (keyguard + dream), so the first screen was **not seen** |

**Pixel incident, diagnosed.** A plain `adb install` stayed blocked for about 50 minutes. It was neither a confirmation prompt nor the lock screen. The phone has a second Android user profile that `shell` cannot access: `pm list packages` without `--user` fails with a permission error on that user. The default install targets every user, so it never finished. Once the blocked process was stopped, `install --user 0` succeeded in a few seconds. **Rule for the Pixel: every `pm`/`install`/`am` command carries `--user 0`.** **Side effect caused by A:** killing the blocked `adb install` client on the Mac (about 09:48) did not abandon the install session on the phone. That session committed at **09:54:59**, once the phone was unlocked, in the middle of C's recette: the same APK (`66a7f47f…`) was reinstalled in place and C's process was killed. C must treat its measurements before 09:54:59 as possibly interrupted. Protocol from now on: never start an install on a locked phone that has a second profile; if an install blocks, check and abandon its session on the phone before handing the phone over. No manual action is needed to install. The owner only has to unlock the phone for the visual recettes.

What this establishes: the binary is **Installed** on both phones and starts without Metro. The first screen was seen on the Seeker only. Rendering the furniture, the spatial journeys, camera and accessibility belong to the B/C/D recettes on this exact binary.

## Phone slots

| Phone | Order | Status |
| --- | --- | --- |
| Seeker | 1. B (accessibility, TalkBack) → 2. D (9 camera scenarios, `adb reverse` on 2 ports) | B done and released (checked by A: font 1.0, accessibility off, hash intact, Trial unchanged). D done and released (checked by A: no reverse, font 1.0, hash intact, Trial unchanged); results in D's report. Free until A3 |
| Pixel 9 Pro | C (spatial) | C's recette done on `66a7f47f`, Pixel **released** by C (checked by A: app stopped, no reverse/forward, hash intact); results in C's report. Free until A3 |

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

- **ADR-19.** At A1 it was an uncommitted change in the main checkout (owner/coordinator); it is now delivered by PR #1. It is not duplicated in this worktree; the two hunks are separate and will merge at integration.
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

## GitHub Actions paused (credits exhausted)

The owner reported on 2026-11-17 that the GitHub Actions credits are exhausted. Before any further push:

| Workflow | ID | File | State before | State after (2026-11-17T16:34:52Z) |
| --- | --- | --- | --- | --- |
| Public checks | `388943613` | `.github/workflows/public-checks.yml` | `active` | `disabled_manually` |
| Dependency audit | `388943612` | `.github/workflows/dependency-audit.yml` | `active` | `disabled_manually` |

- Command: `gh workflow disable <id>`, with the admin rights confirmed on the repository. No run was in progress.
- Unchanged: the workflow files, the tests, the branch protection (none on `main`, no ruleset), GitGuardian (an external app, not Actions). No status was created.
- Consequence: no push or PR from now on gets a remote run. Every new SHA carries **"CI distante non exécutée : crédits épuisés"**. The earlier green runs (`0f6d5fb`, `3a127c0`, `#3 9fcf6e8`) only certify their own SHAs.
- **Reactivation** once credits are back: `gh workflow enable 388943613 && gh workflow enable 388943612`. Then `gh workflow run "Public checks" --ref <branch>` and `gh workflow run "Dependency audit" --ref <branch>` on each open PR branch (both workflows accept `workflow_dispatch`), or push a commit. Check the list with `gh workflow list --all`. The weekly audit `schedule` resumes on its own.

## B/C/D integration plan (prepared 2026-11-17)

State of the worktrees at the time of writing: all three are based on `0f6d5fb`, with **uncommitted** changes and no PR open yet.

| Lot | Files touched | Overlap | Precondition before integration |
| --- | --- | --- | --- |
| B | `src/components/ui.tsx` (`ThemedSwitch` 48 dp), `src/navigation/DetailWorkspace.web.tsx`, new `listFocus.web.ts`, `scripts/check-detail-panel.mjs`, tests | none with C/D | The `DetailWorkspace.web.tsx` change implements the **route-focus extension**, which the wave plan sends for product validation first: the owner's agreement must be cited in the PR |
| C | `src/web/assetBytes.ts` (15 s bound, abort, single settle), `scripts/check-spatial-ui.mjs`, tests | none | Fixture that reproduces the blocked GLB, cited in the PR |
| D | `src/components/camera/useCameraImage.ts` (D3 non-overlap), test | none; `SessionManager` untouched | Defect reproduced in Jest before the fix, cited |

**Order.** #1 (rule + plan) → #2 (A: tooling + records) → B → C → D. B, C and D can merge independently. B goes before C's final recette because `ui.tsx` is a shared primitive. After each merge: typecheck, lint, format, Jest, tooling, then the PR's Public checks.

**After the merge authorization:** `npm run build:proof:android` on the integrated SHA → new APK, recorded here (hash, GLB, installation `--user 0` on the Pixel). Then replay **only** what is affected, on that binary:

| Agent | Recette to replay on the A3 candidate | Phone |
| --- | --- | --- |
| B | 48 dp switch target (lamp/feeder loop) + text at 200 %; web focus covered by `check:detail-panel` in CI | Seeker, short slot |
| C | Native furniture loading (models/fallbacks), marker → detail → Back, floor change; the bound itself stays proven by the fixture | Pixel, then Seeker if needed |
| D | D3 background/resume scenario during a read + one nominal fixture scenario | Seeker |

Rules: one install per phone between two recettes, `--user 0` on the Pixel, Trial 1012 never replaced.

## A3 — assembled candidate and validation matrix (2026-11-17)

**Remote CI not run: credits exhausted** for every SHA below (workflows paused, see above). The earlier green runs certify only `0f6d5fb`, `3a127c0` (#2) and `9fcf6e8` (#3).

### Candidates

| Candidate | Local branch | SHA | Content (merges at exact SHAs, no merge into `main`) |
| --- | --- | --- | --- |
| 1 | `candidate/wave2-1` (pushed, no run) | `948e642b4b566244a4a6ea240a300bcbf7494d1a` | `0f6d5fb` + #1 `41b506b` + #2 `816d444` + #3 B `9fcf6e8` + #4 C `3cff2ba` + #5 D `f8b0144` |
| 2 | `candidate/wave2-2` (local) | `5de3c2fc1db40a8f37d558217f953add3e123bb3` | candidate 1 + #6 B token `fd77a0f` |

Merging produced no conflicts. The other agents' branches were not rewritten.

### Local campaign (Node 24.11.1, `CI=1`, `EXPO_OFFLINE=1`, sample plan, short `TMPDIR`, sequenced steps)

| SHA | Command | Result |
| --- | --- | --- |
| `948e642` | `check:public-inputs` (before and after the export), `typecheck`, `lint`, `format:check` | pass |
| `948e642` | `npm test -- --watch=false` | **88 suites / 1172 tests** pass |
| `948e642` | `test:tooling` | 43/43 |
| `948e642` | `proof:dependencies`, `proof:protocol`, `proof:camera` | pass |
| `948e642` | `export:android -- --source-maps` + `check:runtime-dependencies -- dist android`, `check:audit` | pass |
| `948e642` | `check:ui`, `check:spatial-ui`, `check:detail-panel`, `check:web-auth` (in sequence) | 4/4 pass (66/81/74/67 s) |
| `948e642` | tracked files after the campaign | unchanged |
| `5de3c2f` | same full campaign | all pass; **Jest 1174** (+2 token tests), tooling 43/43, 4/4 browser recipes; tracked files unchanged |

### APKs (`npm run build:proof:android -- --revision <sha>`, `.s02proof`, sample, 3D, debug signing)

| SHA | APK SHA-256 | GLB | Installation |
| --- | --- | --- | --- |
| `948e642` | `adcdd1da50650303d194f15f13b6ee583836684feb331e44d600d12dd751f83e` | 23/23 | Pixel (`--user 0`, 10:47:52) and Seeker (in place). Installed hash checked; `Running "main"` without Metro; no FATAL; no `adb install` client or session pending before each handover |
| `5de3c2f` | `8f9a9079a2029309ef6148248f0d008666514111f3e3a04757e9c7eb66f5b7f7` | 23/23 | Seeker, in place after D's release (11:16): installed hash checked, `Running "main"` without Metro, no FATAL, no pending install; for B's token proof |

### Native recettes on `adcdd1da` (`948e642`)

| Agent | Device | Recipe | Result | Limits |
| --- | --- | --- | --- | --- |
| C | Pixel 9 Pro, Android 17, WebView 157.0.8103.50 | Plan 3D; marker → detail → Back; touch selection; floor change; Home/resume; real context loss → Retry; 5 × 5 s orbits | 17 models / 0 fallbacks, 2 labels, 2 markers; journeys OK; 0 hidden or idle frames; no automatic retry, Retry 443 ms; **median 117.8 rendered fps**, 0 janky / 2854, GPU HWUI p99 ≤ 3 ms | Native non-regression of C3 only: the HTTP block cannot be reproduced on `file://` (the bound is proven by fixture/Jest). Short gestures, no thermal or WebGL timer |
| C | Seeker, Android 16, WebView 157.0.8103.38, Mali-G615 MC2 | same protocol; 2 placements recreated through Place device (demo profile of the proof package) | 17/0, 2 labels, journeys OK, Retry 720 ms; **median 119.0 rendered fps**, 1 janky / 5952, GPU HWUI p99 ≤ 10 ms, 32 °C stable | same |
| B | Seeker | 48 dp switches (`Show Front door`, `Show token`) at 100/200 %, touch 6 dp from the edge; lamp 1 press on/off; feeder open/Back | 48×48 dp, toggles OK and restored; loops OK → **#3 validated natively** | TalkBack not replayed on this binary |
| B | Seeker | Token baseline **without #6** (public fixture, `adb reverse` of its port only) | Google autofill session on the field (FillResponse with 2 datasets, "Passwords" chip); no save prompt in this run; a `SAVE_SHOWN` at 09:52 in the history (consistent with D) | Behaviour is not deterministic; nothing saved |
| D | Seeker (fixture `f8b0144`, effective Expo fetch, `adb reverse` 8124/8125, public token) | D2 truncated body (scenario 6); D3 background at 3 s / resume at 5.4 s during scenario 7; cross-origin redirect (3); image (1); Forget; late result after Forget | D2: "could not be loaded", **no partial frame** (partial frame on `66a7f47f`). D3: **1 request** (2 on `66a7f47f`), closed at 14,999 ms, next poll at 15.8 s. Redirect refused, B = 0 requests. Image OK. Forget: new frame after reconnect. Late result (10,010 ms) not reused → **all PASS** | Seeker only (Pixel not run). A truncated body without `Content-Length` (chunked) stays undetectable. No cancellation on leave (documented). No autofill prompt seen in these 3 connections |
| B | Seeker, APK `8f9a9079…` (`5de3c2f`, with #6) | Token with #6: `settings get secure autofill_service`, `dumpsys autofill` after focusing the field, `device_config list autofill` | **#6 NOT EFFECTIVE on Android**: an autofill session still starts on the field (STATE_ACTIVE, FillResponse with 1 dataset) and Gboard still shows "Passwords", whether the token is masked or shown. Probable cause: `autofill trigger_fill_request_on_unimportant_view=true` (Android 14+), which ignores `importantForAutofill="no"`. Save prompt absent, but it was also absent in the baseline, so no difference is proven | Release build without verbose logs, so the view's importance was not read. Real prevention would need native code (`AUTOFILL_TYPE_NONE`, a react-native patch): **product decision**. #6 stays a draft |

PR heads after the candidate: #5 is at `3b8f349`. `git diff --stat f8b0144 3b8f349` shows `docs/design/camera-images.md` only, checked by A, so the candidate still certifies D's code. #7 (H01 report, docs) at `1e80a9d` is not part of the candidate.

**Summary.** On `948e642`: #3 (B), #4 (C, native non-regression) and #5 (D2/D3) are validated on the devices named above. #6 is built and installed but **not effective** on Android 16, pending an owner decision. Phones at the end: Pixel with `adcdd1da`, Seeker with `8f9a9079`. Both are released and clean (no reverse, font 1.0, accessibility off). Trial 1012 was not touched (`lastUpdateTime` 2026-11-16 13:58:19). No PR was merged.

## Next step (A3)

1. Receive the B/C/D patches. C has announced a C3 fix (`src/web/assetBytes.ts`: 15 s bound, abort, single settle), which is **not in `66a7f47f…`**.
2. Check each diff, integrate on a new SHA, then run typecheck/lint/format/Jest/tooling and push only if mandated.
3. `npm run build:proof:android` on that SHA. Install it in a free slot, then replay the affected recettes (C: loading/journeys; D: fixed scenarios; B: affected journeys). The `66a7f47f…` APK does not certify any later fix.

## Privacy correction (2026-11-17, evening)

D's review of #2 found the two phones' serial numbers, an absolute local path and a detail of the personal phone's user profiles in this public report. They are removed from the current text. Earlier commits on this branch still contain them. Removing them from history would need the owner to choose a squash merge for #2, or a rewrite of this branch; the closeout leaves that choice to the owner.
