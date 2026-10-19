# Switch control — C07a

C07a was implemented on 2026-10-17. The 2026-10-19 [M01 extension](power-enrollment.md) adds direct summary controls and replaces the model-global Boolean with explicit profile/device-bound enrollment, enforced in SessionManager. Default remains denied; Trial **1009** on Pixel 9 Pro is accepted for the explicitly enrolled household lamp after a user-observed On/Off cycle with the original Off state restored. The [M01 ledger](../stage0/power-enrollment-validation.md) records the exact scope. The offline demo lamp is enabled. Other actuators stay outside this slice.

The [global review](../reviews/2026-10-17-global-review.md#3-c07as-activation-switch-is-global-to-a-model) reproduced that this Boolean enables all matching HS103 identities, not just the tested household plug. M01 replaces that gate; testing one plug alone still does not authorize other devices.

## Architecture and scope

`DeviceDetailScreen` mounts `components/controls/SwitchControl.tsx`, keyed by profile, session, stable key and resolved entity ID. Existing observed-value presentation stays authoritative. The component imports only runtime `commands`, `commandStore` and `session`; there is no backend import, service JSON, optimistic switch state or promise-based success inference.

`commands/switchControl.ts` owns the first-release scope and sanitized outcome wording. Demo eligibility is limited to the public lamp's exact registry/device identity. Hardware eligibility requires a TP-Link HS103/HS103(US), the `tplink` integration, matching stable registry/entity/device bindings, a main visible/enabled entity, fresh entity/device registries and an exact profile/device enrollment. A manufacturer or display name alone does not enable a control. The demo fridge's Power cool, HA's built-in demo entities and Petlibro switches remain disabled. Locks, climate, fans, feeding, images and scene controls are not added.

`getCapability` and `assessEntity` are reused. Both buttons are disabled for cached/non-ready/background, unavailable, unknown, disabled or out-of-scope readings. The action matching the current observed On/Off state is disabled as well. Each button has an explicit accessible device/action name, disabled/busy state and a minimum 48-point touch target; status updates use a polite live region.

## Dispatch and outcomes

A manager-issued target is captured for the rendered interaction. Its memoization includes profile/session/entity/epoch and eligibility changes. A press rechecks current profile, mode, session, entity binding, lifecycle, scope and observation quality before dispatch. It reads the latest command synchronously as well as subscribing to a narrow outcome selector, so two presses within one render cannot send twice. `sending` and `accepted` keep both buttons disabled until confirmation or a qualified terminal/uncertain result; settling the acknowledgement alone does not release them.

The component handles `refused` and `no-op` as local feedback. A `started` request is tracked exclusively by C02; no result-promise callback changes component observations. Switch requests do not use the continuous queue. Readiness changes invalidate captured targets through C03; a stale press cannot capture a replacement home's same key and act on it. Unmount/profile/session changes discard local feedback. The app lifecycle also clears feedback.

Requested On/Off and command status are presented separately from the observed value. Accepted means waiting for a report. Confirmed describes a later observation, preserving late-reconciliation and assumed-state qualifiers; it does not claim causality or a recent physical poll. Failure warns that the device may still have changed. Unknown/deadline results ask for verification and have no automatic retry. Every demo status explicitly says simulated and never exposes the tracker's generic HA error or raw backend messages. Dismissal hides the latest result without falling back to an older one; dispatch guards remain independent of visibility.

## Verification and remaining gates

The following is the earlier **2026-10-17 C07a checkpoint**. Its disabled hardware gate and standalone/TalkBack follow-ups describe that binary; subsequent R03a, M00 and M01 acceptance is recorded in the [current project status](../README.md).

- **561 tests / 32 suites** pass. C07a adds 20 scope/presentation cases and 15 component tests through the actual SessionManager, scheduler, tracker and injected DemoBackend. Coverage includes On/Off, both acknowledgement/observation orders, same-render repeated presses, accepted-but-unobserved exclusion, rejection with a later effect, timeout/late reconciliation, deadlines, missing/unknown interpretation, cached/background, stale session/target, immediate refresh invalidation, a new external observation producing no-op feedback without transport, dismissal and excluded actuators.
- TypeScript, ESLint and configured Prettier checks pass. Existing C01–C04 and UI/spatial regressions remain passing.
- Public-sample web and Android Hermes/DOM exports pass, with the original prepared private plan restored afterward. Chrome verifies On/Off and result dismissal offline, 320/430/768 CSS pixel layouts, no overflow/page errors and 48-pixel action targets. Private browser reports and captures stay under ignored `.local/`.
- The real HA read-only preflight finds one available TP-Link HS103 main switch with matching `tplink` registry metadata. No physical service is sent by preflight, tests, export or browser checks.
- Native Seeker demo acceptance passes: On/Off observations and confirmed outcomes, background/foreground state retention, then saved HA restoration after process restart. An initial development-client restart produced a Fabric mounting SIGSEGV before Home; subsequent starts and the completed demo suite pass. Retain this startup incident for R01/R03a investigation rather than claiming crash-free operation. Native inspection of the real Kasa detail also confirms the pending gate is visible and both controls stay disabled. Physical Kasa acceptance is pending and the hardware gate remains false.
- S02 Pixel acceptance, standalone distribution, TalkBack and all other physical control categories retain their own gates. Existing installed development-client JS validation is not an independently distributed APK.

## Next implementation

M01's scoped lamp acceptance is complete on Pixel build 1009. Next is **M02 household personalization**: explicitly apply the intended profile plan, link HA rooms, place the proven lamp and feeder, and curate readings/favorites. Preserve power grants during spatial edits. R03a standalone acceptance is already recorded on build 1002 for both phones; M01 is a separate, narrower binary extension. Locks/climate/fans require their own verified-hardware work and deliberate UI.
