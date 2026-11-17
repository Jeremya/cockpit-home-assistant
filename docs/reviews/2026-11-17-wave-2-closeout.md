# Wave 2 closeout — 2026-11-17

Coordinator: agent A. This document is the closeout for the [wave 2 plan](../handoff/parallel/2026-11-16-wave-2.md). It covers three things:

- the decision table for the wave 2 PRs;
- the merge batch;
- the procedure for moving to a daily candidate and starting M05.

`main` is still at `0f6d5fb`. **No PR is merged.** Merging needs the owner's explicit instruction, and `main` has no branch protection or ruleset to bypass or change. The lot reports that each PR carries are dated checkpoints. They stay unchanged and become reachable once their PR is merged.

**Remote CI:**
- The Public checks and Dependency audit workflows are **disabled since 2026-11-17T16:34:52Z** because the Actions credits are exhausted. The reactivation procedure is in [wave 2 A](../stage0/next-wave-2-A.md#github-actions-paused-credits-exhausted).
- Every SHA pushed after that time is marked **"CI distante non exécutée : crédits épuisés"**.
- GitGuardian, an external app, still runs.

## 1. Reference checkpoint

| Item | Value |
| --- | --- |
| Recommended candidate | `candidate/wave2-1` = **`948e642b4b566244a4a6ea240a300bcbf7494d1a`**, i.e. `0f6d5fb` plus `--no-ff` merges of #1 `41b506b`, #2 `816d444`, #3 `9fcf6e8`, #4 `3cff2ba` and #5 `f8b0144` |
| Proof APK | `com.larrabee.homecockpit.s02proof` 0.1.0 (1), SHA-256 `adcdd1da50650303d194f15f13b6ee583836684feb331e44d600d12dd751f83e`, built by `npm run build:proof:android -- --revision 948e642…`. It uses the public sample plan, has 3D on, and contains 23/23 GLBs |
| Local campaign on that SHA | 17/17 steps; Jest 88 suites / 1172 tests; tooling 43/43; protocol, camera and dependency proofs; privacy guard; Android export with runtime guard; 4/4 browser recipes. No tracked file changed. See [wave 2 A](../stage0/next-wave-2-A.md#a3--assembled-candidate-and-validation-matrix-2026-11-17) |
| Installed proof APKs (17 Nov evening) | Pixel 9 Pro: `adcdd1da` (the checkpoint). Seeker: `8f9a9079` (`5de3c2f`, with #6). Before any further Seeker replay of `948e642`, reinstall `adcdd1da` there (proof package only, never the trial) |
| Excluded | **#6** (token autofill). The local candidate `5de3c2f` (APK `8f9a9079…`) was built only to test it, and it is not recommended (§3) |

**Merge simulation (2026-11-17, rerun at heads #1 `41b506b`, #2 `334ec6b`, #3 `6394ba7`, #4 `1b1ac4b`, #5 `3b8f349`, #7 `d690675`).** Starting from `0f6d5fb`, these heads merge without conflict. Outside `docs/`, the resulting tree is **identical** to `948e642`. Later changes are documentation only:

- `docs/stage0/next-wave-2-A.md`;
- `docs/stage0/next-wave-2-C.md`;
- `docs/design/camera-images.md`;
- `docs/stage0/next-wave-2-D.md`.

Per the owner's instruction, **no rebuild** is needed for these documentation changes. The campaign and the native results of `948e642` remain the reference.

## 2. Evidence reconciled in this closeout

Every result below comes from the public **proof** APK and the sample plan. None comes from an accepted daily binary, and none is on `main` yet.

| Area | Result | Device / binary | Limits |
| --- | --- | --- | --- |
| Accessibility (B, #3) | Native switches are 48 × 48 dp at 100 and 200 % text. A touch 6 dp inside the edges toggles them, and the lamp and feeder loops pass. Before the fix (APK `66a7f47f`), the switch measured 47 × 27 dp and its edge did not respond. TalkBack ran under owner supervision on `66a7f47f` | **Seeker**, `adcdd1da` | Pixel not measured by B. "Place device" sits under the tab bar until scrolled (T-C1, to be classified) |
| Web focus (B, #3) | Route presentation follows the panel rule: probe 16/16, `check:detail-panel` 26/26 | Browser, `948e642` | Owner agreement given in B's session; to be confirmed at merge |
| 3D (C, #4) | Non-regression with the 15 s asset bound: 17 models, 0 fallback | **Pixel** `adcdd1da`: median 117.8 rendered fps, 0 janky out of 2854 frames. **Seeker** `adcdd1da`: median 119.0 fps, 1 janky out of 5952 frames | C3 (a GLB that never finishes) is proven only by Jest and the web recipe, because the APK reads assets from `file://`. No sustained thermal run |
| Camera (D, #5) | D2: a truncated frame is refused on native. D3: no second request on resume. Cross-origin redirect refused, Forget and reconnect, late result dropped | **Seeker** `adcdd1da` | A cut chunked body (no `Content-Length`) is still not detected. **Pixel 9 Pro, same APK, run by C (17 Nov evening): all five scenarios pass** (truncated, background/resume with a single request, redirect refused with 0 requests to origin B, Forget/reconnect, late result after Forget). Reported to A; C's written record is pending |
| Token autofill (B, #6) | **Not effective on Android 16.** With #6, an autofill session still opens on the token field and the keyboard still offers "Passwords" | **Seeker** `8f9a9079` (`5de3c2f`) | Android 14+ (`trigger_fill_request_on_unimportant_view`) ignores `importantForAutofill="no"`. A "Save password" prompt was seen once on the Seeker (09:52, on `66a7f47f`). **On the Pixel, Google Password Manager also offered to save the token** (`adcdd1da`, without #6; C declined it) |

## 3. PR decision table

The "code tested" column gives the SHA built into `adcdd1da`. Every agent shares one GitHub account, so a formal GitHub approval is impossible. "Independent review" therefore means a written cross-review by another agent, posted as a PR comment.

| PR | Head now | Code tested | Changes since the test | Independent review | Blockers / open points | Decision proposed to the owner |
| --- | --- | --- | --- | --- | --- | --- |
| [#1](https://github.com/Jeremya/cockpit-home-assistant/pull/1) agent PR rule, ADR-19, wave 2 plan | `41b506b` | `41b506b` (docs) | none | A: no blocker ([comment](https://github.com/Jeremya/cockpit-home-assistant/pull/1#issuecomment-6959134692)) | "a PR triggers CI" is outdated since the workflows were disabled (noted here, checkpoint unchanged) | **Merge first** |
| [#2](https://github.com/Jeremya/cockpit-home-assistant/pull/2) proof APK tooling, A records | `334ec6b` | `816d444` | report `next-wave-2-A.md`; ADR-17 note names the binaries | D: **privacy blocker** ([comment](https://github.com/Jeremya/cockpit-home-assistant/pull/2#issuecomment-6959197957)), fixed in `334ec6b` (phone serials, local path, profile detail removed); tooling no blocker. B: no blocker (temp dirs `maurice-proof-*` never removed, non-blocking) | earlier branch commits still contain the serials (see §4, history); later SHAs not run (credits exhausted) | **Merge second**, after D confirms the fix |
| [#3](https://github.com/Jeremya/cockpit-home-assistant/pull/3) B: route focus, 48 dp switch, grid | `6394ba7` | `9fcf6e8` | `next-wave-2-B.md` only (serial removed; native proof posted as a [comment](https://github.com/Jeremya/cockpit-home-assistant/pull/3)) | C: requested | owner confirmation of the focus rule "Même règle que le panneau"; Seeker serial removed by B from the report, the body and the comment (`6394ba7`); old revisions remain in GitHub's edit history, which the owner can delete; draft, to mark ready | **Merge third** after C's review and the owner's confirmation |
| [#4](https://github.com/Jeremya/cockpit-home-assistant/pull/4) C: GLB bound, spatial recette | `1b1ac4b` | `3cff2ba` | report `next-wave-2-C.md` only | A: no blocker ([comment](https://github.com/Jeremya/cockpit-home-assistant/pull/4#issuecomment-6959122233)) | C3 not proven on device (accepted limit); **phone serials** in `next-wave-2-C.md`, redaction requested from C; draft, to mark ready | **Merge fourth** |
| [#5](https://github.com/Jeremya/cockpit-home-assistant/pull/5) D: camera D2/D3 | `3b8f349` | `f8b0144` | `camera-images.md` only | B: no blocker ([comment](https://github.com/Jeremya/cockpit-home-assistant/pull/5#issuecomment-6959152064)). Its note (no test for a still-mounted card during Forget) was answered by D: not reproduced, code unchanged, limit recorded in #7 §5 | camera passes on the Pixel too (C, record pending); draft, to mark ready | **Merge fifth** |
| [#7](https://github.com/Jeremya/cockpit-home-assistant/pull/7) D: H01 report, HA demo removal | `d690675` | — (docs, not in the candidate) | — | B: no blocker after correction ([first verdict](https://github.com/Jeremya/cockpit-home-assistant/pull/7#issuecomment-6959152435), [withdrawn](https://github.com/Jeremya/cockpit-home-assistant/pull/7#issuecomment-6959167175)): the same device models and identifiers are already public in `docs/stage0/inventory.md` on `main` | product decision on the compact Bitaxe presentation (not a merge blocker); separate owner question: redact the existing public inventory? | **Merge sixth**, after confirmation by its author |
| [#6](https://github.com/Jeremya/cockpit-home-assistant/pull/6) B: token out of autofill | `fd77a0f` | `fd77a0f` in `5de3c2f` | — | — | **not effective on Android** (§2) | **Excluded.** Owner chooses: (a) native react-native patch for `AUTOFILL_TYPE_NONE` (a dependency change, under the R01 review); (b) keep it for web only and accept the Android limit; (c) close it |
| this PR, central docs closeout | — | — (docs) | — | D: requested after opening | depends on #2 (stacked) | **Merge after #2** (GitHub retargets it to `main`) |

## 4. Merge batch: order, dependencies and controls

Order: **#1 → #2 → this PR → #3 → #4 → #5 → #7**, with #6 outside.

- **#1 first.** It carries ADR-19 and the PR rule. #2 adds an ADR-17 note in the same `decisions.md`; the merge was simulated and is conflict-free.
- **#2 before this PR.** This PR is stacked on `work/wave2-A`.
- **Code PRs #3, #4 and #5.** They touch disjoint files, so their order among themselves does not matter. The order above follows the wave's lot order.

Rules for the owner, or for whoever holds an integration mandate:

1. **Merge commits by default, not rebase.** A merge keeps each tested SHA as an ancestor of `main`, so the native evidence stays tied to its commit. Squash is only for the case in rule 4.
2. **Draft PRs.** Each author marks its draft ready (`gh pr ready <n>`) once its review has passed. Nobody marks someone else's draft ready.
3. **Check after each merge, and once at the end:**
   ```sh
   git fetch origin
   git diff --stat 948e642b4b566244a4a6ea240a300bcbf7494d1a origin/main -- . ':!docs'
   ```
   The output must be **empty** once #1–#5 are merged. If it is not empty, the code is no longer the code that was tested: stop, rerun the local campaign, then rebuild the proof APK and replay the affected recipes.
4. **Serials in branch history.** The current text is being cleaned. The earlier commits of #2, #3 and #4 still contain the phone serial numbers, and a merge commit would carry them into `main`'s history. The pushed branches are already public, so only the `main` history is at stake. The owner chooses between:
   - accepting them, since a phone serial number is low-sensitivity;
   - squash-merging those three PRs, which loses the tested SHA as an ancestor. The proof stays tied by tree equality: the non-doc diff against `948e642` must be empty;
   - having each author rewrite their own branch.
5. **No auto-merge.** Workflows stay paused and protections are left as they are. Never put a fake status or a `[skip ci]` in place of a check.
6. **After the batch.** Record the `main` SHA in `docs/README.md`. Note "CI distante non exécutée : crédits épuisés" for it. If the non-doc diff is empty, cite the `948e642` campaign as the reused evidence.

## 5. M05 start: proposed daily candidate

M05 is **not started**. Tests, proof APKs and recipes do not start the seven days. Day 1 is the first day the owner actually uses the daily binary at home, on the installed binary, with the journeys in step 4 accepted.

### Proposed binary

| Item | Proposal | Why |
| --- | --- | --- |
| Source | the `main` SHA after the batch in §4. Its non-doc tree must equal `948e642` | evidence for this code: campaign, accessibility, 3D and camera |
| Variant | **internal trial**, `npm run build:trial:android -- --build-number 1013 --private-plan <owner's private plan>` | the household's personal plan and the trial signing key, so it updates 1012 **in place** and keeps the personal profile. The proof APK uses the public sample and a separate package, so it is not a daily binary |
| 3D | **off**, as in the trial variant (`src/config/build.ts`, OQ-03) | 3D is proven on the sample plan only. Turning it on for M05 is a separate owner decision |
| Package | `com.larrabee.homecockpit.trial`, versionCode 1013 | **replaces Trial 1012**, so it needs the owner's explicit instruction, which has not been given |
| Record | APK SHA-256, signing certificate (must equal 1012's), source SHA, private-plan digest, `build.json` | same provenance as the proof APKs |

The build and install stay blocked until two things happen: the owner authorizes the merge, and the owner explicitly allows replacing 1012.

### Phone

The **Seeker** (Android 16). It holds Trial 1012 (`4230f52`, installed 2026-11-16 13:58:19) and its personal profile, so an in-place update keeps the household session.

The Pixel 9 Pro is not chosen:
- it has no Maurice trial or personal profile now: Trial 1009 is no longer installed, so the CEO review's "1009 stays accepted on the Pixel" describes its date, not the current phone;
- its second user profile requires `--user 0` on every `pm`, `am` and `install` command;
- it stays the 3D/performance comparison phone.

The M01 lamp enrollment was accepted on Pixel Trial 1009. **It does not carry over to the Seeker.** On the Seeker the lamp starts with no grant, and any control needs a new enrollment plus a physical cycle the owner authorizes.

### Home Assistant availability (2026-11-17)

- **HA runs in Docker on the development Mac.** Container `homeassistant` 2026.10.1, up about 4 h when checked.
- **Health check without a token:** `/manifest.json` returns 200 and `/api/` returns 401 (alive, authentication required). No token was used or copied.
- **Since D's cleanup (#7), the HA `demo` integration is no longer loaded** (restart on 2026-11-17). What remains: Kasa, Petlibro and two Bitaxe; Ring is not connected.
- **Risk for seven days:** the Mac's sleep setting is `sleep 1`, and it stays awake only because of `caffeinate` and agent sessions. If the Mac sleeps, HA disappears and so does the trial. Before day 1, the owner either keeps the Mac awake on mains power for the week (for example `caffeinate -s`, or the system setting) or chooses H02 (always-on HA, with an explicit profile move). Each HA outage is logged, not hidden.
- Whether the phone can reach HA from the home network is not proven by this check. It is the first journey in step 4.

### Procedure (in order, each step recorded)

1. **Merge:** the owner authorizes the batch in §4. Run the non-doc diff check against `948e642`.
2. **Build:** `build:trial:android` from the merged SHA, build 1013, private plan, on a clean checkout. Record the APK hash, the certificate and the plan digest **privately** in `.local/trial/`. The public record holds hashes only.
3. **Install on the Seeker**, only after the owner explicitly allows replacing 1012:
   - `adb -s <Seeker serial>`, always targeting the serial;
   - check that no other `adb install` is pending on the host or the device, and that no agent holds the phone;
   - `install -r` update in place, never an uninstall;
   - check the installed version (versionCode 1013) and the hash.
   - Neither the Pixel nor the proof package is touched.
4. **Household journeys to accept, by the owner, on the installed binary:**
   1. Cold start without Metro, then connect to HA over the home network with the owner's own token. The token is typed by the owner and never captured. Because #6 is excluded, entering the token can open a Google Autofill session and offer "Save password". Before typing, the owner either turns Autofill off themself (Settings → Passwords & autofill → None, then back on afterwards), or declines with "Never". No agent changes this setting over adb.
   2. Home: real devices, no `demo` entity, personal plan, room names readable at 100 % and 200 % text. Three `device_tracker.demo_*` entities stay in HA until its next natural restart. Maurice does not display that domain.
   3. Rooms, then device detail, then Back, for the Kasa lamp, the Petlibro feeder and one Bitaxe (read-only). Observe how dense the Bitaxe cards are: 44 visible readings and 5 noisy "issues" per card (88 sensors across both Bitaxe) are expected until the §7a decision in #7.
   4. Background and resume, airplane mode and recovery, with honest states and no replay.
   5. Forget the session, then reconnect.
   6. Optional, separately authorized: enroll the lamp and run one physical On/Off cycle that restores the original state.
   7. Camera: not available in HA today (Ring not connected), so this journey is **not applicable** for the week rather than failed. The same applies to the Schlage lock: if the owner connects it to HA before day 1, it gets a read-only journey (state only, no control).
5. **Day 1:** the owner states that the journeys are accepted and that daily use begins. Record the date. The backlog's M05 row becomes "In progress (day 1 = date)".
6. **Daily log:** [M05 usage log](../stage0/m05-usage-log.md). The public file holds counts and categories only. Details that identify the household stay in the existing private journal `.local/ux09/usage-journal.md` (status "not started").
7. **Exit after 7 days:** useful-use verdict, vendor-app returns, confusing states, native failures and HA outages. Then the backlog decisions (R03b, H02, controls).

## 6. Open owner decisions

1. **Merge authorization** for the batch in §4, the merge mode given the serials in branch history (§4.4), and confirmation of B's focus rule.
2. **#6:** native patch, web-only scope, or closing it.
3. **Inventory and #7:** whether to keep naming the household's security devices in the public `inventory.md` (already on `main`), and the compact Bitaxe presentation.
4. **M05:** permission to replace Trial 1012 with 1013, and the HA availability choice (keep the Mac awake or H02).
5. **SmartThings (Samsung appliance):** per the HA documentation, free API access is being withdrawn in favour of a paid "Personal Plan" (USD 4.99/month). This is not verified on this account. Subscribe, or keep the appliance out of scope (#7).
6. **iPhone:** Safari web preview within the current scope, or a formal iOS opening through an ADR.
