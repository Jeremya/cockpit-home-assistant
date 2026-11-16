---
name: Maurice product
description: Use for any product decision on Maurice — roadmap and prioritisation, MVP scope, feature definition, UX trade-offs, acceptance criteria, stakeholder or CEO-style reviews, or deciding whether something is really "done". Load this before proposing features, rewriting the roadmap, or writing a dated review.
---

# Maurice — product lens

## The product in one paragraph

Maurice is a private household app for Android and Chrome desktop that puts a
Home Assistant home in your pocket. It shows the house (rooms, plans, devices,
readings) and performs a deliberately small set of verified actions. The
character — a disapproving 1970s French butler — sets the tone: calm, terse,
competent, never chatty. The promise is **trustworthy everyday use**, not the
largest feature list.

Positioning line: *« Maurice s'occupe de tout. Vous, de rien. »*

## Product principles (non-negotiable)

1. **Truth before convenience.** An observed state, a cached value, an accepted
   request and an unconfirmed command are four different things. Never let the
   interface imply more certainty than the evidence supports. "Unknown" and
   "unavailable" are never all-clear.
2. **Home Assistant is the integration, not a detail.** Maurice does not invent
   a device cloud, a scheduler or a second source of truth. HA owns devices,
   automations and history; Maurice owns presentation, session, scoped control
   and local preferences.
3. **One real action beats five tentative ones.** A control category ships only
   after explicit, per-device permission and a physically observed cycle on a
   named binary. "The button rendered" is not product delivery.
4. **Short daily loops.** The household must be able to (a) see what matters,
   (b) act on the lamp in at most two presses from Home, (c) understand the
   feeder without opening 23 readings. Optimise those loops, not screens.
5. **The house is the hero.** Personal geometry, real device names and a
   recognisable Home outrank dashboards, settings and explanatory copy.
6. **Private by construction.** Personal house geometry may be rendered locally
   for the authorized profile — that is what the plan is for. It must never
   reach Git, committed fixtures, demo or sample builds, public documentation
   or published screenshots. Demo mode uses sample geometry only. Tokens and HA
   payloads are held to the same rule.
7. **One app, two surfaces.** Android and Chrome share screens, components,
   session logic and command rules. A desktop-only fork is a product failure
   unless it is presentation-only.
8. **Reversible and explicit.** Reset, revoke, forget and sign out are
   deliberate acts with visible consequences. No silent migration, no silent
   grant, no silent replay.

## Who it is for

- **Primary:** a technically comfortable owner of a Home Assistant household
  who wants a fast, quiet phone view of the house and one trusted action.
- **Secondary:** the same person on a wide Chrome window, doing setup and
  review with keyboard and mouse.
- **Explicitly not yet:** guests, multi-occupant OAuth, public consumers, iOS
  users. Do not design for them by accident.

## The MVP ladder (current product plan)

`M00 → M01 → M02 → M03 → M04 → M05` — measure each exit criterion; do not
declare a lot done from code alone. The canonical text is
`docs/reviews/2026-10-19-household-mvp-review.md`.

| Lot | Visible outcome | Exit criterion |
| --- | --- | --- |
| **M00** | Credible validation base | focus regression reproduced/corrected; smoke passes repeatedly; supervised TalkBack |
| **M01** | The living-room plug really works | one explicitly enrolled identity; others refused; physically observed cycle; initial state restored; no replay |
| **M02** | It is *your* home | real plan, real links, two real placements, relevant favourites; survives restart |
| **M03** | A home that is pleasant and fast | house and favourites immediately visible; lamp in ≤2 presses; feeder understood; 200 % text preserved |
| **M04** | A spatial view worth opening | 3D enabled only in an accepted candidate; real house readable; stable selection/return; 2D fallback; ≥30 fps interaction |
| **M05** | The household uses it for a week | HA available throughout; no token re-entry; useful-use and fallback-to-vendor-app log recorded |

After M05: choose **one** additional H01 integration based on actual need, then
its focused UI. Cameras/history/notifications are a later product bet.

## Where the product actually stands

Always re-read `docs/README.md` and `docs/BACKLOG.md` before quoting status;
this skill is a lens, not the ledger. At the 2026-10-27 review:

- Read-only HA foundation, recovery, credentials, demo home: implemented and
  natively exercised.
- Home, device summaries, attention semantics, 2D plans, placements, profile
  plans: implemented; native acceptance varies by feature and binary.
- One scoped switch action (HS103) and demo lamp: delivered; accepted on Pixel
  Trial 1009. Other control categories are **not** delivered.
- Chrome desktop: shared screens, keyboard, browser HA connection. Browser
  sign-in uses OAuth + PKCE (ADR-08) with opt-in remembered sessions in
  IndexedDB, so it is no longer page-memory-only; the browser-auth recette has
  not run on remote CI, so treat it as implemented, not release-proven.
- Camera still images: detail display implemented; native acceptance and
  motion/event association open.
- 3D: code integrated; phone acceptance and the release flag remain gates.
- Seven-day household use: **not observed**. Public distribution: **not done**.

## Prioritisation rules

1. **Close the loop before opening a new category.** A half-proven action
   (built, not physically observed) outranks a new integration or a new screen.
2. **Prefer removing steps to adding chrome.** The lamp path
   `Home → summary → readings → reading → action` is a product bug, not an
   argument for a new dashboard.
3. **Honesty is a feature.** Never trade a stale/unavailable indicator for
   visual calm. Instead, shorten the permanent explanation and keep the
   qualifier.
4. **Accessibility is part of the MVP**, not a hardening phase: 48 dp targets,
   320/430/768/1440 widths, 100/150/200 % text, web keyboard and focus return,
   TalkBack as a supervised acceptance.
5. **Hosting is part of the product.** An autonomous APK does not make an
   HA server autonomous. If the Mac sleeps, H02 becomes an MVP condition.
6. **Do not add a second system** (state store, favourites model, credential
   store, plan format, command path) to solve a local UX problem.
7. **Dependency and release gates are product gates.** The audit exceptions
   expire 2026-11-02; the strict audit is a public-release gate.

## Scope guardrails / anti-goals (until explicitly re-decided)

- No locks, climate, fans, covers or feeder controls without verified hardware
  and a scoped permission model.
- No scene/automation builder inside Maurice; HA owns automation.
- No camera motion/event feed, recording browser, or notification strategy
  before hosting and privacy are designed.
- No public app-store distribution, account system, analytics, social features
  or family/guest roles.
- No iOS runtime work; no widget, watch or voice surface.
- No geometry editor or full plan import/export for the first household.
- No name-heuristic device semantics: verified adapters only.
- No desktop-only redesign that forks the shared UI.

## Evidence ladder — never collapse it

1. **Implemented** — code exists.
2. **Automated** — behaviour tests pass on that revision.
3. **Built** — a named artifact/APK exists for that revision.
4. **Installed** — it runs on the target device.
5. **Observed** — the human saw the physical effect (light on, state restored).
6. **Used** — the household kept using it over days.

Write claims at the level you actually reached. "Trial 1011 is built" ≠
"accepted". "Seeker passes" ≠ "Pixel accepted". "S02 evidence" ≠ "3D shipped".
Reusing an older consent, binary or proof for a newer change is a defect.

## Product decision checklist

Before saying yes to a feature, answer all of these in writing:

- Which of the three daily loops does it shorten? By how many steps?
- What does the user see when the device is unavailable, stale, or the command
  is accepted but not confirmed?
- Which evidence level can we reach now, on which exact device/binary?
- Does it need a new permission? Is it denied by default and revocable?
- Does it add a second source of truth, store or migration?
- What is the smallest version that proves the value? What do we deliberately
  not build?
- Does it work at 320 px, 200 % text, keyboard-only web, and with reduced
  motion?
- What private data could leak into a bundle, log, capture or fixture?
- Which platform is authoritative for acceptance, and who performs it?
- How is it reversed or decommissioned?

If a question has no answer, the feature is not scoped yet.

## A product review looks like this

1. **Pin the checkpoint** — commit, date, branch, what is actually in the tree.
2. **Verdict** — one paragraph: stage (alpha / daily-usable / release-ready) and
   the single most important next investment.
3. **What exists vs what is missing** — a table of domain → state → MVP limit.
4. **Prioritised findings** — each with evidence, user impact, and the boundary
   of the claim (not reproduced, not physically tested, etc.).
5. **Direction** — concrete composition/interaction proposal, not a mood board.
6. **Lots and exit criteria** — measurable, with dependencies.
7. **Verification scope** — what was read, run, reused and *not* run.

Keep dated reviews immutable checkpoints: append a follow-up section or link a
newer ledger rather than rewriting old results.

## Definition of done (product)

A delivery is done when:

- the user-visible outcome is described in one sentence;
- the exact revision and binary are named;
- automated behaviour tests cover the new rule;
- the intended platform acceptance was performed, or the gap is stated;
- privacy/accessibility/error states were checked;
- `docs/README.md`, the ticket in `docs/BACKLOG.md` and the relevant dated
  ledger are updated without erasing older evidence;
- the rollback or revocation path exists.

## Traps to reject on sight

- "634 tests pass, so the MVP is done." Test counts measure coverage, not daily
  value.
- "The demo integration exercises HA, so the vendor works." HA demo entities
  are not household hardware.
- "The flag exists, so enable it." Enabling a model-wide flag is not enrolling
  one device.
- "The web preview looks right." Preview ≠ touch, safe areas, GPU, TalkBack.
- "We'll add the qualifier later." Trust is the product; qualifiers are not
  polish.
- "One more control category will make it feel complete." Daily use and
  reliability make it feel complete.
