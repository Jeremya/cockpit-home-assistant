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

The first passing browser run used working changes based on `a909f9d`. A second complete run passes on clean **`62bd0a5e3a2ffe0946d16c79692d9c6479273cc4`**, the committed fix, with the same twelve return-focus assertions. The [safe aggregate](return-focus-proof-2026-10-19.json) retains the failing baseline and the exact clean passing report. Raw diagnostics and public captures remain ignored under `.local/m00/` and `artifacts/ui/`.

## Exact candidate and acceptance

The [Public checks run](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39277773409) for clean `62bd0a5` **passes**. Its separate dependency audit fails; R01 remains open.

Maurice Trial **1006**, package `com.larrabee.homecockpit.trial`, is built from that same clean revision and installed as a signed update on Seeker / Android 16. APK SHA-256: `0d820e196383572e287bdda8c9ad294ba84b9dab2d903118d9dcf2db8f16e56b`. Certificate SHA-256: `7191b909f58f9900cbfeb875c8d61ad5261efff9463b53b3e522c6b872261153`. The embedded sample/Hermes release, disabled development launcher/backup and disabled real controls/3D pass the build checks. Installation preserves app data and verifies the installed APK hash.

The user confirmed availability to listen. The first M00 native attempt again encountered TalkBack onboarding and did not establish app-level focus. Its accessibility settings, temporary demo placement and saved ready HA connection were restored. The subsequent supervised attempt avoids UiAutomator while TalkBack is active. At that intermediate checkpoint acceptance was pending; the final 1007 route and feedback are recorded below. A browser result does not close spoken-feedback acceptance. S02 and physical-control gates are unchanged.

The live 1006 attempt opened the demo lamp from both the marker and named row, returned to the plan, and selected Study. Captures show the selected Study row and accessibility focus on its revealed heading, but the return captures still show the header Back button outlined rather than the originating reading. Spoken feedback remains awaiting the user's response. Accessibility settings, the temporary placement and saved ready HA connection were restored. No physical services were sent.

The native follow-up waits for incoming native-stack `transitionEnd` before scheduling accessibility focus. In the installed Expo Router source this event is emitted by `onAppear`; route focus happens earlier. This is a lifecycle correction to validate on the next exact candidate, not a claim that build 1006 has passed native return-focus acceptance. Unit tests keep all origin guards and verify cancellation before screen exposure. Browser assertions remain unchanged.


## Final Seeker route — build 1007

The native exposure correction is in **`12b04e8f8f39b4deb10ff341f2d3381a57ecb962`**. `83a8c73a9eaa0dee6d61528c8806eec4a7db1e02` only formats its test; application source is unchanged. The final local full suite is **608 tests / 39 suites**, with 26 tests in the two focus-related suites. TypeScript and lint pass, and final formatting passes. The six tooling tests and protocol proof recorded earlier are reused. A fresh complete public smoke on clean `12b04e8` passes all three widths and twelve focus returns, with no page errors/external requests, unchanged developer plan and closed server/browser.

Maurice Trial **1007** is built from clean `12b04e8`, with the same package, sample plan, signing certificate and disabled real-control/3D scope as 1006. APK SHA-256: **`5305583369951830812821676fc65720d3a2cb58307b046f0c585cc73524d5ac`**. Installation is a signed update without clearing data; the installed APK hash is verified. This is a standalone embedded-Hermes release, without Metro.

On Seeker / Android 16, with TalkBack active, the final captures show:

| Route | Observed result |
| --- | --- |
| Marker → lamp detail → Android Back | Accessibility outline returns to the originating lamp marker |
| Named placed row → lamp detail → Android Back | Accessibility outline returns to that named lamp row |
| Explore Study | Selected row retained; detail revealed; accessibility outline on Study heading |

The user confirms **“Oui, les annonces sont claires sur cette dernière passe.”** This closes the spoken-feedback check for this supervised route. Their later positive feedback on 1006 is also retained, but its header-outline captures were not substituted for the final visual acceptance.

The active-service setting is verified without UiAutomator during listening. Focus is assessed from screenshots, not a claimed TalkBack node dump. Android input injection drives the scripted route; this does not constitute an exhaustive touch-exploration/traversal audit. TalkBack's system guidance overlay remains visible in the captures. No screenshots or private geometry are published; their hashes are in the [aggregate](return-focus-proof-2026-10-19.json).

Accessibility settings are restored to their prior values, the temporary demo placement is removed and zero demo placements verified, and the saved household HA session returns ready. No physical HA service is called. Earlier build 1005's 100/150/200% text checks retain their own source/binary; they are not relabeled as a new 1007 font battery. Pixel, terminal-action TalkBack traversal, complete reading order and other enabled-feature acceptances remain separate U01/phone scope.

The [latest source CI](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39279840689) is queued when this acceptance is recorded; it is not counted as a pass. The earlier web-fix CI is green. R01's independent dependency audit remains open. The intermediate `12b04e8` test-formatting issue is corrected by `83a8c73`; no application code changes between them.


## Subsequent CI conclusion

The final M00 documentation source `e05d88e` passes [Public checks](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39280755699). Its separate audit failure was the known four-advisory R01 finding, not a focus regression. The [dependency CI follow-up](dependency-ci-validation.md) records the actual uuid fix and user-approved expiring policy for the three remaining tooling advisories. This supersedes the queued status recorded above without changing the 1007 phone evidence.
