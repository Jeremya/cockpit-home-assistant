# Architecture Decision Register

- **Audit date:** 2026-10-28
- **Scope:** decisions recovered from Flex (Claude Code, Codex, Pi) cross-checked against the implementation at `ae89d81` plus the uncommitted working tree.
- **Rule applied:** the code is the source of truth for status. A historical claim of "done" is treated as an implementation *claim*, not a verified fact.

**Evidence classes used below**

| Class | Meaning |
| --- | --- |
| PROPOSAL | An agent proposed it; nothing accepted yet |
| ACCEPTED | Explicitly adopted by the owner or a later agent, recorded in a spec/contract |
| CLAIM | An agent reported it implemented |
| VERIFIED | Confirmed by reading code and/or running the cited tests |

Flex sources:

- **C1** = Claude Code `c21494da-fd24-46cf-ba92-b290964236f9` (2026-10-14) — original spec v1→v3
- **X1** = Codex `01a13b80-df0b-7952-ab83-100f0ffefdf7` (2026-10-14→22) — reviews, Stage 0 build, handoff
- **C2** = Claude Code `79fc3c80-33fc-479c-8579-0d502752a641` (2026-10-15)
- **C3** = Claude Code `e977d16c-3b5a-4e24-a7e3-ff80b64b28d2` (2026-10-19) — D03 desktop
- **C4** = Claude Code `13555a8c-5d87-49db-973d-49b74640d52d` (2026-10-20) — UX01/UX03
- **C5** = Claude Code `4bc74258-9695-4fa1-99cb-e32470c3a7f9` (2026-10-22) — browser auth
- **C6** = Claude Code `b340b28b-c1a9-4d6a-a78e-73c1951d5a5c` (2026-10-26) — A01 acceptance
- **P** = Pi cell — **no independent Maurice decisions.** Only two sessions (`01a1831e`, `01a182da`), both meta-sessions querying Flex about this repo. Not used as decision evidence.

---

## Register

| ID | Decision | Status | Historical evidence | Code evidence | Confidence |
| --- | --- | --- | --- | --- | --- |
| ADR-01 | HA is the single integration point; app maps HA **domains + capabilities**, never brands | IMPLEMENTED | C1 msg 57, 73 (PROPOSAL→ACCEPTED); X1 msg 133 (ACCEPTED) | `src/core/capabilities.ts:18` domain switch; `src/core/types.ts:56` `OBSERVATION_DOMAINS`; `src/session/types.ts:13` `HomeBackend` | High |
| ADR-02 | No in-app Matter/Thread controller; Matter arrives via HA | IMPLEMENTED | C1 msg 57 (ACCEPTED aspect of ADR-01); spec §1.6, §3.2 | No Matter commissioning code anywhere; single backend pair only | High |
| ADR-03 | Commands are an explicit outcome lifecycle, not optimistic UI + rollback | IMPLEMENTED (extended 5→6 states) | C1 v1 had 10 s rollback; X1 msg 133 P1 rejected it; C1 msg 109, 214 (ACCEPTED) | `src/commands/types.ts:122` `CommandStatus`; `src/commands/CommandTracker.ts:62` | High |
| ADR-04 | Security-sensitive commands are never automatically replayed after reconnect | IMPLEMENTED | X1 msg 133 P1; C1 msg 214 (ACCEPTED) | `CommandScheduler` has no retry path; `CommandTracker.ts:62` "never a … retry"; `switchControl.ts:172-173`; 336 targeted tests pass | High |
| ADR-05 | One authoritative subscription per sync; generation/epoch guards; stale candidates never commit | IMPLEMENTED | X1 msg 133, 235 P1 (2 rounds); C1 msg 109, 214 (ACCEPTED) | `HomeAssistantBackend.ts:91,97,425,432`; `:499 resubscribe: false`; `:594 activeEpoch = epoch`; `entityStream.ts:29` | High |
| ADR-06 | Entity, physical device, HA area/room and map placement are four separate concepts | IMPLEMENTED | C1 v1 "one Device = one entity" → X1 msg 133 P2; C1 msg 109 (ACCEPTED); C2 msg 2292 (convergent) | `src/core/types.ts:26,66,74`; `src/spatial/placements.ts` | High |
| ADR-07 | Credential SecureStore key is an opaque random ID, never URL-derived | IMPLEMENTED | X1 msg 235 P1 (invalid key chars); C1 msg 214 (ACCEPTED) | `src/services/credentials.ts:17-21` regex guard; `:71` `randomId().replaceAll("-","")`; test asserts `profile.uuid123.token` | High |
| ADR-08 | Browser sign-in uses OAuth + PKCE S256 owned by Maurice; never the client's `getAuth()` | IMPLEMENTED (web) | C5 `docs/design/browser-auth.md` "Verified facts" (VERIFIED against HA 2026.9/10.0/10.1); X1 msg 235 context | `src/services/auth/authTransaction.ts:131`; `tokenEndpoint.ts:4`; `credentialStorage.web.ts` memory-only | High |
| ADR-09 | One shared responsive app and reading order for phone + desktop (supersedes desktop-only D03 slice) | IMPLEMENTED | C3 msg 1089 (D03 desktop-only) → X1 msg 17001, 17025 ("une seule identité") → C4 msg 565 (shared layout) | `src/screens/HomeScreen.tsx` single tree; UX01 tests; `detailNavigation` single-Home (`d7ac3fc`) | High |
| ADR-10 | 3D is a first-class cross-platform renderer, disabled only in standalone trial builds | IMPLEMENTED | C3 msg 1089 (3D toggle); X1 msg 16991 (rules); C6 msg 1546 ("aucune entrée 3D" = trial) | `src/config/build.ts:12` `spatial3d: !buildInfo.trial`; gates `HousePlanScreen.tsx:358,410`; `HomePlanOverview.tsx:53,112` | High |
| ADR-11 | One-press power from the shared card, on **both** phone and Chrome | IMPLEMENTED | C4 msg 1563 + `docs/handoff/UX03-card-action.md` ("Sur téléphone et Chrome") | `src/components/DeviceSummaryCard.tsx:106`; `src/components/controls/CompactPowerAction.tsx` | High |
| ADR-12 | Single Zustand store; versioned persisted preferences separate from live state | IMPLEMENTED | C1 msg 73 (ACCEPTED); spec §3.1, §3.3 | `src/core/store.ts:1,18`; `src/preferences/types.ts:43` `schemaVersion: 3` | High |
| ADR-13 | UI never holds raw HA service strings; all writes go through a typed facade with captured targets | IMPLEMENTED | C1 msg 109; spec §3.1; `docs/design/commands.md` | `src/commands/facade.ts:10`; `src/commands/types.ts` `CommandTarget`/`CommandFacade` | High |
| ADR-14 | 2D plan ships first; 3D is a separate, later milestone | IMPLEMENTED | C1 msg 73, 109 (staged roadmap); X1 msg 133 roadmap | `react-native-svg` 2D `FloorPlanView`, 3D behind S02; both present | High |
| ADR-15 | D03 in-panel device detail (open detail without leaving Home) | PARTIALLY_IMPLEMENTED | C3 msg 1089 (ACCEPTED; desktop-only); X1 msg 17025 reframed it | `DetailWorkspace.web.tsx` + `DetailPane.tsx` exist but are **web + ≥1024 px only** (`layout.ts:6`); native uses Stack routes | High |
| ADR-16 | No Maurice backend, no Maurice accounts, no push infra | IMPLEMENTED | Spec §1.3, §1.6 (ACCEPTED) | No server code; auth delegated to HA; `app.config.js` has no backend URL | High |
| ADR-17 | 3D presentation is one design system over the existing renderer; palette, wall heights, cutaway, camera and furniture scales are rendering-only previews, never measurements | IMPLEMENTED (P0 + P1) | Owner approval 2026-10-28 (current session); `docs/design/3d-asset-system.md` | `src/web/sceneStyle.ts`, `src/web/sceneWalls.ts`, `src/web/CockpitScene.tsx`, `src/web/modelCamera.ts` | High |
| ADR-18 | Home uses the premium cockpit visual direction (Concept C): near-black surfaces, cyan/mint/amber semantics, home pulse, compact architectural preview, category quick filters, room cards, compact device cards, reduced-motion-aware native entrances and a shell-hosted mobile bottom bar; data, command and navigation contracts are preserved | ACCEPTED (P0 + P1 + P2 visual core) | Owner selected C 2026-10-28; `docs/design/ui-redesign-2026-10-28.md` §11 | `src/theme.ts`, `src/screens/HomeScreen.tsx`, `src/components/MainTabBar.tsx`, `src/components/home/{HomePulse,HomeArchitecture,FadeIn}.tsx`, `useReducedMotion.ts`, `HomePlanOverview.tsx`, `src/components/DeviceSummaryCard.tsx`, `src/screens/DiagnosticsScreen.tsx` | High (selection) / Medium (not device-observed) |

---

## Rationale, alternatives and findings

### ADR-01 — HA as the only integration point

**Rationale.** HA already bridges Matter, Thread, Zigbee, Z-Wave and vendor clouds; everything becomes an entity in a domain. Mapping by domain makes new devices appear with no app change.

**Alternative considered and rejected.** A `DeviceAdapter` interface with a second, non-HA backend (C1 msg 57). This was dropped: the spec's §1.6 non-goals explicitly refuse "support for hypothetical non-HA hubs", and the code has a single pair (`HomeAssistantBackend` / `DemoBackend`) behind `HomeBackend` (`src/session/types.ts:13`).

**Finding.** The *extensibility* half of the original proposal was quietly reclassified as a non-goal. This is coherent, but it means early documents promising a pluggable backend no longer describe the system. The interface that survived is a session/transport seam, not a device-model seam.

### ADR-03 / ADR-04 — command lifecycle and no replay

**Rationale.** A 10-second rollback could display "Locked" after a door actually unlocked but lost its response. Observed state and requested state must never be conflated.

**Alternative rejected.** Optimistic local state with rollback (the House Control model). Explicitly declined again at C3 msg 1089 ("Not adopted").

**Findings.**

1. The accepted decision names **five** states (`sending, accepted, confirmed, failed, unconfirmed`). The shipped enum has **six** — `superseded` was added in C03 for pending continuous intents (`src/commands/types.ts:122`). The extension is deliberate and documented in `docs/design/command-scheduling.md`; it is not drift.
2. No-replay is structural, not a convention: `CommandScheduler` holds only *unsent* work, `CommandTracker` "owns observations/outcomes only: never a transport, service payload or retry" (`CommandTracker.ts:62`), and the reconnect path in `HomeAssistantBackend` retries the *connection*, never a service call. Verified by 336 passing tests across `src/commands`, `src/session/homeAssistant`, `src/services/auth`.
3. `switchControl.ts:172-173` surfaces the guarantee to the user in both demo and real wording. This is a verified fact, not a claim.

### ADR-05 — synchronization

**Findings.** Both halves of the corrected decision are present and testable:

- **Freshness:** every sync opens a *new* subscription (`resubscribe: false`) and the first event rebuilds state from an empty collection (`entityStream.ts:29`), so a cached collection cannot be reused. This is precisely the defect X1 raised at msg 235.
- **Stale protection:** candidate epochs coexist with the committed stream and only swap on success (`HomeAssistantBackend.ts:425-432`, `:594`), and `transportGeneration` invalidates in-flight work when the transport is torn down (`:91`, `:259`).

**Residual risk.** `SessionManager` carries a *second* counter (`generation`, `SessionManager.ts:89`) alongside the backend's `epoch`. They guard different layers (profile/backend lifetime vs. snapshot age) and are both used consistently, but two overlapping names for "which world am I in" is a comprehension hazard for future changes. Tracked in `open-questions.md`.

### ADR-07 — credential storage

**Finding (a near-miss worth recording).** `profileIdFor` still returns a URL-bearing value — `ha:${normalizeUrl(origin)}` (`src/session/homeAssistant/url.ts:45`). That *looks* like the bug X1 caught. It is not: the profile **id** and the SecureStore **key** were deliberately separated, and the secret key is derived from a random `storageId` guarded by `^[a-zA-Z0-9_-]+$` (`credentials.ts:17-21, 71`). A future refactor that "simplifies" these into one value would silently reintroduce the original defect. There is no test asserting that the two stay distinct.

### ADR-08 — browser authentication

**Verified facts** (C5 `docs/design/browser-auth.md`, independently re-checked there against HA core `2026.9.0`, `2026.10.0`, `2026.10.1`):

- HA accepts `code_challenge` with `S256` only; `plain` is a 400.
- Authorization codes are bound to `(client_id, code)` and **popped before the verifier check** — a failed exchange burns the code, so exactly one attempt is correct.
- Refresh tokens do **not** rotate; access tokens are per-second JWTs.
- The official client's `getAuth()` sends **no PKCE**, which is why Maurice owns the transaction and only re-uses `Auth`/`createConnection` afterwards (`tokenEndpoint.ts:4`).

**Implementation.** The transaction is `sessionStorage`-scoped and single-use, stores only `state`/`verifier`/origin (never a token), is consumed before inspection, and rejects with a closed set of reasons (`authTransaction.ts`). Browser credentials are memory-only (`credentialStorage.web.ts`). This matches the verified findings.

**Boundary.** Browser sign-in is web-only. Native still uses the long-lived-token path (`credentials.ts`, SecureStore). That is consistent with the spec (§3.3 "iOS deferred"), but see `open-questions.md` — the product status table still lists D02 as "Not started" while C01–C04 are integrated.

### ADR-09 / ADR-15 — mobile vs desktop

This is the one place where the historical record and the code disagree in an interesting way.

**Sequenced history.**

1. **C3 msg 1089 (2026-10-19 16:22)** — D03 accepted a *desktop-only* slice: two panes, side device panel, "The phone keeps its current Home… No native screen changes."
2. **X1 msg 17001/17025 (2026-10-19 22:21)** — the owner asked for a phone frame on the desktop "pour garder une même version"; Codex answered with one visual identity, one set of journeys, layout may vary by space.
3. **C4 msg 565 (2026-10-20)** — UX01 shipped the shared layout and renamed the smoke selector `desktop-overview` → `home-overview` "because the block now exists at every width."
4. **`d7ac3fc` / `448e700`** — a later fix kept *one* Home across the panel threshold and confined the panel to desktop.

**Status.** ADR-09 (shared content) is IMPLEMENTED and holds across the tree. ADR-15 (the D03 panel) survived only as a **web-only, ≥1024 px** presentation layer; native never got it, and the spec now records "in-panel detail deferred, not delivered."

**So:** the desktop-specific *design* was genuinely replaced by a shared responsive layout. The remaining desktop-only element is a navigation presentation detail, not a second UI. This is consistent — but the reversal was recorded only in prose summaries, never as a superseding decision record. See `open-questions.md` OQ-01.

### ADR-10 — 3D rendering

**Finding: the "web-only 3D" reading of the history is wrong.** 3D is not web-only in code. `CockpitSceneView` is imported unconditionally by `HousePlanScreen`, `HomePlanOverview` and `SceneLabScreen`, and it renders on native. What is true is that **standalone trial builds disable it**: `buildFeatures.spatial3d = !buildInfo.trial` (`src/config/build.ts:12`), gated at `HousePlanScreen.tsx:358,410` and `HomePlanOverview.tsx:53,112`.

That gate explains the A01 acceptance line "aucune entrée 3D" (C6 msg 1546) without implying a scope reduction. The gate is an explicit, tested feature flag.

**Undocumented part.** The *reason* the trial disables 3D is only inferable from the comment at `build.ts:11` ("S02's Pixel acceptance is independent of the first standalone trial"). No ADR records that mobile 3D is "implemented but not part of the trial product". The spec (§1.5 criterion 6) still promises 3D as a Stage 3 acceptance target. Treat this as a product-status question, not drift — see `open-questions.md` OQ-03.

### ADR-17 — 3D presentation layer

**Rationale.** The existing renderer, bridge, lifecycle and placement model are kept; the visual
layer is isolated in `src/web/sceneStyle.ts` (palette, preview heights, cutaway facing) and
`src/web/sceneWalls.ts` (pure outline/partition planning). `CockpitScene` consumes those values for
materials, caps, plinth, lighting, shadows and framing.

**Constraint.** Wall heights, cutaway depth, plinth size and camera elevation/margin are rendering
previews. They are not measurements, not HA story heights and not persisted preferences. The
cutaway direction is fixed per camera mode; orbiting does not rebuild geometry.

**P1 extension.** Furniture is now bridged (`SceneFloor.furniture`) and rendered through an
optional, allowlisted `PlanFurniture.variant`. The 23 Kenney GLBs are CC0 and committed with
`KENNEY-LICENSE.txt`; each model is normalized by its runtime bounding box and re-materialed.
Older plans without a variant fall back by kind. Furniture remains decoration with no entity, room
link or command path.

**Finding.** The camera elevation (`48° → 38°`), proportional `0.05` margin and furniture scale
targets are user-visible changes approved by the owner, not drift. Evidence is Implemented +
Automated (1015 tests, `check:spatial-ui`) plus an observation on the Seeker dev client; there is no
standalone 3D-enabled build, GPU measurement or Pixel acceptance. `PlanLine` still has no door kind.
The Gradle APK path (`export:embed`) embeds the GLBs; a release APK built from this tree contained
all 23 and rendered the furnished sample offline on the Seeker. The `expo export` JS/OTA artifact
still omits them, which OQ-09 records as a tooling residual rather than a standalone blocker.

### ADR-18 — Home visual direction (Concept C)

**Decision.** The owner selected the **Premium Smart Home Cockpit** after reviewing three rendered
directions. P0 is implemented: a near-black stage, cyan/mint/amber status language, a Home pulse with
real room/device/alert counts, category quick filters, room cards and a compact Home-only bottom bar
(Home, Rooms, Plan, Settings).

**Trade-off.** The analysis recommended Concept B because it makes the house the hero. C is
status-first; the house remains one tap away through Plan and the existing plan card. The owner
accepted that trade-off. P1 should add a compact architectural preview to the pulse area so the house
stays present without returning to a full hero.

**Preserved contracts.** `SessionManager`, preferences, the command facade/scheduler/tracker, HA
protocol, existing routes, room/area selection, attention/coverage semantics and the 3D
lifecycle are unchanged. The new bottom bar is a navigation addition for compact Home; P1 will host
it in the workspace shell for all destinations.

**P1.** The bottom bar moved to the root shell and appears only on Home/Rooms/Plan/Settings; attention
is compact, its coverage explanation moved to Diagnostics, quick actions show real values, and
device cards use compact C surfaces. Content padding clears the bar on the four destinations.

**P2.** A compact static architectural preview sits above the pulse on compact Home (no second 3D
renderer); native entrances are reduced-motion-aware while web stays deterministic for the public
screenshot recette; quick tiles and room cards get quiet press feedback.

**Maturity.** Implemented + Automated (1015 tests, `check:ui` at 320/430/768/1440, `check:spatial-ui`,
type/lint/format; clean public captures). P1 was **Built/Installed/Observed** on the Seeker local
release; the P2 release built but the Seeker disconnected before installation. It is not a named
candidate; TalkBack, 200% text, iOS safe areas, native P2 motion and native performance are not
accepted; the APK is private and not shareable.

---

## What the code does *not* show
| Claim found in history | Code reality |
| --- | --- |
| "DeviceAdapter interface so another backend can be added later" (C1 msg 57) | Reclassified as a non-goal; only a session seam exists (ADR-01) |
| "D02 persistent browser sign-in — not started" (project status table) | C01–C04 are integrated on `main`; `authStore.ts` implements opt-in remembered sessions. The status table is stale. |
| "In-panel detail deferred, not delivered" (project status) | `DetailPane` + `DetailWorkspace.web.tsx` are delivered and gate-verified on web at ≥1024 px (ADR-15) |
| "3D disabled" (trial notes, README) | True only for the `internal-trial` channel; 3D ships on dev native and web (ADR-10) |

## Verification performed for this audit

- Read: spec v17, `docs/design/{commands,command-outcomes,command-scheduling,browser-auth,desktop,detail-panel-navigation}.md`, `docs/handoff/UX0{1,3}.md`, project status.
- Ran: `npx jest src/commands src/session/homeAssistant src/services/auth` → **17 suites, 336 tests, all passing.**
- Read implementation: `core/{types,capabilities,store}.ts`, `commands/{types,tracker,scheduler,switchControl}.ts`, `session/{types,SessionManager}.ts`, `session/homeAssistant/{HomeAssistantBackend,entityStream}.ts`, `services/{credentials,credentialStorage.web}.ts`, `services/auth/{authTransaction,tokenEndpoint,authStore}.ts`, `navigation/*`, `components/{layout,DeviceSummaryCard,controls/CompactPowerAction}.tsx`, `config/build.ts`, `screens/HousePlanScreen.tsx`.

*No application code, dependency, configuration or test was modified by this audit.*
