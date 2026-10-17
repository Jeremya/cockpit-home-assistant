# Maurice — global review, 2026-10-17

Maurice has reached a development alpha with a useful Android/HA foundation, household device summaries, saved plans, production spatial navigation and an observation-based command path. The next milestone is a reproducible standalone household trial. More actuator categories and decorative 3D work should follow evidence from daily use.

This review examines the current working tree, including uncommitted work after `45df8a4`. It is a product/architecture and delivery assessment, with refreshed automated checks and dependency triage. It is not a new full phone acceptance run or an exhaustive security audit. [Current status](../README.md), [implementation backlog](../BACKLOG.md) and the dated validation ledgers retain their roles.

## What exists and what it proves

| Area                        | Current delivery                                                                                                                                         | Remaining boundary                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| HA session and credentials  | Official client, initial/sync recovery, foreground handling, native SecureStore and credential journals                                                  | Actual standalone-binary cold starts, backup/update and fault acceptance                                        |
| Home and device views       | Favorites, room filtering, global attention, one summary per physical device, individual readings and diagnostics                                        | Fewer steps for common actions; accessibility and large inventories                                             |
| Household integrations      | Actual Kasa HS103 and Petlibro PLAF103 readable through HA; feeder's 23 visible readings grouped together                                                | Kasa actuation not accepted; proprietary feeder battery/power meaning remains open; no feeding/schedule control |
| House model and 2D          | Public/private source separation, profile-owned plans, explicit reset, area links and persistent entity placement                                        | Actual household marker locations are still user configuration; no geometry editor                              |
| 3D                          | Production use of saved placements, shared selection, marker/resource diffs, pause/disposal and 2D/list fallback                                         | S02 accepted on Seeker within its small-scene scope; Pixel S02 gate and large/long-session budgets remain       |
| Commands C01–C04            | Semantic intents, latest-state validation, outcome revisions/deadlines, debounce/serialization, cancellation/no replay, deterministic offline simulation | Fixture/protocol evidence does not certify hardware                                                             |
| Switch UI C07a              | Explicit On/Off in entity details, guarded captured targets, separate observed state and qualified command result; demo passed in browser and on Seeker  | Real control remains disabled by the HS103 gate, pending physical acceptance and the scope decision below       |
| Distribution and operations | Development client and embedded spatial proof artifacts exist                                                                                            | No accepted household standalone APK, checked-in CI or always-on HA host                                        |

The installed spatial proof APK demonstrates offline rendering feasibility. It does not close R03a, which must exercise the household app's credentials, lifecycle, enabled features and updates without Metro. The development Mac's HA availability is a separate dependency.

## Verified strengths to preserve

The architecture already has the right boundaries. `HomeAssistantBackend` owns transport and recovery. `SessionManager` owns profile/backend lifetime and dispatch coordination. Observed state and transient command outcomes have separate stores. Stable entity keys and aliases support preferences and placements independently of mutable HA entity IDs. The native plan/scene bridge carries presentation and selection, not connections or secrets.

The shared attention policy preserves unknown/unavailable and cached qualifications, rather than deriving device health from a connected member. Physical-device grouping makes the feeder useful without turning every telemetry entity into a main card. Simulated provenance is visible, and request acknowledgement never substitutes for a later observation. These properties matter more than adding another visual effect or vendor adapter.

No architectural rewrite, additional application backend or direct vendor cloud client is justified by this review. Extend the existing semantic command and HA integration boundaries.

## Findings and delivery risks

### 1. The current result is not yet a reproducible repository checkpoint

At review start, `git status --porcelain` reported **42 modified tracked files and 61 untracked entries**; some entries are directories, not individual files. Many delivered modules and their tests exist only in that working tree. HEAD remains the documentation checkpoint `45df8a4`. A clone at HEAD does not contain the application being assessed here.

Before adding another broad feature, review and checkpoint the existing work in coherent commits, including the new source/tests and public proof files. Preserve the user's WIP, exclude ignored household files, and verify a clean checkout with `npm ci` and the public sample. No commit or push was performed during this review.

### 2. The dependency assessment is open, with a runtime path to prioritize

Fresh `npm audit --json` reports **64 affected package entries: 49 high, 15 moderate, no critical**. Deduplicating advisory URLs yields **five underlying advisories**, propagated through Expo/Metro/Jest and other dependency paths. These are not 64 independent exploitable flaws in Maurice.

| Advisory package       | Reported severity | Initial classification; not a completed reachability audit                                                          |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `decode-uri-component` | Moderate          | Prioritize application route/deep-link input: installed Expo Router uses `query-string`, which imports this decoder |
| `node-forge`           | High              | Observed in Expo code-signing tooling; assess the actual build/update use separately                                |
| `braces`               | High              | Pattern-processing dependency propagated through tooling; inspect which inputs and artifacts can reach it           |
| `sprintf-js`           | Moderate          | Formatting dependency in the graph; determine actual call sites and input exposure                                  |
| `uuid`                 | Moderate          | Inspect specific API usage and buffers; package presence alone does not establish exploitability                    |

The official [decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) describes excessive CPU use for malformed input, and identifies 0.5.0 as patched. Local inspection finds `query-string` imports in the installed router's path/state parsers. That makes runtime exposure plausible; this review did not reproduce a Maurice deep-link exploit. The [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) concerns signature verification; its applicability must be assessed against the actual Expo signing path.

R01 should select SDK-compatible patches or a reviewed targeted resolution and validate them in the native app. The audit's suggested Expo 44 downgrade and incompatible Jest/SDK changes are not an implementation plan. No dependency or lockfile was changed here. Resolve or document the relevant exposure for R03a; public distribution retains the stronger R03b gate.

### 3. C07a's activation switch is global to a model

`src/commands/switchControl.ts` has a single `KASA_SWITCH_CONTROL_ACCEPTED` Boolean. With the gate false, both independent synthetic HS103 identities are blocked. With it true, both are eligible; the function has no profile-specific enrollment input. This was reproduced against the actual pure policy with public synthetic data and zero device services.

This is a **conditional rollout/design issue**, not evidence of an enabled unsafe action today: the real gate remains false. Before flipping it, distinguish two separate concepts: a model's supported protocol capability, and the household's selected actuator. Recommended first-release behavior is an explicit per-profile/stable-key enrollment of the intended plug; adding another HS103 should not inherit the first unit's physical acceptance automatically.

Keep this a bounded C07a follow-up. Use validated, non-secret profile preferences or an equivalently explicit scoped configuration; default to no enrolled real actuator, reconcile aliases, reject renamed/replaced entity bindings, and test two plugs and two profiles. Recheck enrollment in the manager's dispatch path before adding a second UI entry point. The UI should consume the same eligibility decision for disabled state. Do not add a new socket/retry strategy or bypass the existing lifecycle guards.

### 4. Native startup reliability still needs investigation

C07a's native ledger records one Fabric mounting SIGSEGV before Home on a development-client restart, followed by successful launches, demo On/Off/foreground checks and saved-HA restoration. The cause is not isolated; this review does not attribute it to C07a, an SDK regression or a particular package. Node tests and successful Hermes exports cannot close this risk.

Carry the crash evidence into R01/R03a. Reproduce with a controlled cold-start sequence, preserve a sanitized native trace and record the exact binary/configuration. Verify the standalone artifact rather than assuming a new bundle fixes it. Avoid unrelated feature edits or an unreviewed SDK migration while isolating the failure.

### 5. Functional evidence is ahead of delivery automation

There is no checked-in `.github` workflow. Browser/phone helpers and export orchestration mostly remain under ignored `.local/`. They provide useful dated evidence but a new contributor or CI cannot run them from a clone. F02 should promote a small sanitized public smoke workflow; R02 should run it alongside type/lint/tests/protocol/export and protect artifact privacy.

U02 also remains valid: Home/detail/summary subscribe broadly to the cockpit store, and entity/readings lists use `ScrollView` with eager mapping. The existing small-home and short 3D measurements do not establish a large-inventory or battery budget. Measure before choosing narrower selectors, indexes or list virtualization; do not perform a speculative rewrite during release preparation.

### 6. Daily-use UX needs a shorter route and less repeated diagnostic prose

The implemented entry path for a physical-device card is summary → show readings → individual entity → power control. The first household trial should establish whether that is too many steps for the lamp. A later bounded UI change can expose the one eligible primary actuator in the summary using the same command component/policy, without quick actions in the scene or a second transport path.

The current control detail also repeats technical coverage/observation explanations around a simple On/Off action. Preserve visible uncertainty, cached state and unconfirmed outcomes; move routine metadata and lengthy explanations into expandable details. Keep the main hierarchy focused on room, device, observed value and deliberate action. U01 should validate TalkBack, large text, focus and disabled/busy announcements on the installed binary. Do not expand this into a complete redesign before daily-use evidence.

## Recommended sequence and exit criteria

| Order           | Bounded work                                 | Exit criterion                                                                                                                                                                                                       |
| --------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0               | Checkpoint existing WIP                      | Reviewed commits contain delivered source/tests; clean checkout builds with the public fallback; private files remain excluded                                                                                       |
| 1               | R01 minimum release assessment               | Five advisory roots classified, relevant fix/mitigation chosen, SDK compatibility retained, native startup incident investigated with explicit outcome                                                               |
| 2               | F02/R02 reproducibility, incrementally       | Small public demo smoke and core checks run from a clone; no personal plan/token required; artifact upload policy is explicit                                                                                        |
| 3               | R03a internal standalone APK                 | Current accepted feature set starts without Metro, retains credentials/preferences across relaunch/update and survives offline/foreground/server-recovery checks on the named phone; binary version/hash recorded    |
| Side acceptance | C07a scope + physical check; S02 Pixel suite | Exact intended plug is enrolled/tested with authorization and restored original state; Pixel evidence is kept distinct from Seeker/S01. Unaccepted features remain disabled or excluded from the trial configuration |
| 4               | Seven-day household trial + U01              | Record useful visits, action/navigation friction, confusing states, native failures and vendor-app returns; address the actual high-frequency problems                                                               |
| 5               | H01-led extensions                           | Select climate, fan, lock or camera work from verified household capabilities and trial need, then implement the corresponding C05/C06/C07b/I01/I02 slice                                                            |

R02 should progress early, but a complete public-release pipeline and every future actuator are not prerequisites for a useful private trial. R03a needs an explicit R01 assessment, not blanket closure of every tooling warning. R03b retains full release acceptance. The 3D Pixel and Kasa hardware gates must not disappear into a generic "done" label.

## Long-term design direction

- Keep HA as the integration platform; Maurice owns the household presentation, per-profile preferences, explicit control enrollment and observed-outcome UX.
- Separate protocol capabilities, verified semantic adapters, and user-selected control permissions. Put dispatch policy in one owner and use it from every native entry point.
- Consolidate reusable outcome presentation before adding more control categories: `commands/presentation.ts` and `switchOutcomeText` currently serve overlapping purposes. Add explicit demo/HA, late and assumed-state context without weakening the existing predicates.
- Keep profile plan/placement identity stable and independent of the renderer. Preserve 2D/list access when 3D fails. Add editor, detailed furniture and effects only when they solve measured household needs.
- Prefer small shared hooks/selectors and focused device adapters over larger screens or vendor-specific sessions. Promote only sanitized acceptance tooling into the repository.
- Defer iOS, household OAuth, activity history, tablets and extra domains until the Android trial establishes demand. If Mac sleep/reachability limits the trial, H02 becomes a concrete hosting task; preserve explicit origin/profile migration.

## Checks and evidence

Fresh in this review: **561 tests / 32 suites pass**, `tsc --noEmit`, ESLint and configured Prettier pass; current npm audit completes with findings, and the synthetic global-gate policy case is reproduced. No application code, dependencies, device state, commit, remote branch or installed binary was changed. The [safe aggregate](../stage0/global-review-proof-2026-10-17.json) records scope and counts; raw audit and local case helper stay ignored.

Reused dated evidence, not rerun here: C07a public browser/offline/native demo acceptance and web/Hermes exports; the C03 official-client loopback proof; S01/S02 and P04/U03/U04 phone ledgers. Physical Kasa switching, S02 Pixel acceptance, standalone household acceptance and complete security reachability analysis remain open.
