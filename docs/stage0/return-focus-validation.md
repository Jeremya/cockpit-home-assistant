# M00 — return-focus regression and accessibility acceptance

Date: 2026-10-19. M00 follows the [household MVP review](../reviews/2026-10-19-household-mvp-review.md) and [U01 acceptance](diagnostics-accessibility-validation.md). The [architecture](../design/diagnostics-accessibility.md#navigation-and-focus) defines the request and cancellation contract.

## Reproduction and cause

An isolated sample-only browser run on clean `a909f9d` reproduced the lost marker focus on its first return at 320 px. The only application instrumentation was a diagnostic log in the staged copy of the helper. Waiting two animation frames in the detail screen allowed the hidden plan's layout notifications to settle. The marker count then became zero; the restoration attempt logged no target. The marker subsequently reappeared, but the unchanged ten-second focus assertion failed. There were no page errors or external requests, and the developer's plan stayed unchanged.

RN Web measures the hidden screen as zero-sized; `FloorPlanView` has no projected marker layout at that size. `HousePlanScreen` previously returned `undefined` both for an invalid origin and for that temporarily missing ref. The web helper abandoned the request in either case and did not observe child-list mutations. This reproduces a concrete path to the CI symptom; it does not claim every earlier failed run was instrumented.

## Correction

- A valid origin with a missing ref returns `null`; invalid profile/plan/floor/view/placement origins return `undefined`.
- The web helper observes node attachment and navigator exposure, then rechecks the origin before focusing. It also handles a disconnected ref being replaced.
- Only confirmed DOM focus completes the request. Visibility can refuse focus even when layout rectangles exist; a later visibility mutation can complete it.
- Success, invalidation and route cleanup disconnect observation. No retry timer, focus-forcing test code, assertion suppression, timeout increase, geometry change or physical service was added.

## Local source and browser checks

- New regressions first failed on the old helper: late-mounted marker, replacement of a disconnected ref, and focus refused until visibility changes.
- Corrected targeted suites: **25 tests pass**. Origin guards cover removed/hidden placements, profile replacement, plan replacement, floor/view changes and blur.
- Full Jest: **607 tests / 39 suites pass**; **6 Node tooling tests pass**.
- TypeScript, lint and formatting pass.
- Extended isolated public smoke passes at **320/430/768**: three marker returns and one named-row return per width, with hidden-screen layout settling before each return. No assertion retry wrapper; zero page errors and external requests; developer plan unchanged; server/browser closed.

These local checks use the working changes based on `a909f9d`; exact committed-source CI and native acceptance are recorded below when available. Raw diagnostics and public captures remain ignored under `.local/m00/` and `artifacts/ui/`.

## Remaining acceptance at the source-fix checkpoint

Clean Linux CI and the supervised Seeker TalkBack pass are pending. The user confirmed availability to listen. A new exact signed candidate will preserve credentials/preferences and use the public demo for the listening route. No browser result closes spoken-feedback acceptance. R01's separate dependency audit and S02/physical-control gates are unchanged.
