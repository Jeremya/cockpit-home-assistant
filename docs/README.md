# Maurice — project status and documentation

Updated: 2026-10-15, after commits `a505fec` (S01 prototype), `81ac459` (P01/P02 and review corrections), and `da62474` (Maurice branding).

This page is the reference for **what exists, what has been verified, and what comes next**. The [backlog](BACKLOG.md) owns implementation contracts and ticket acceptance. Dated reviews and validation reports preserve their checkpoint; their old counts and open questions are not the current project status.

## Current status

Maurice is an Android-first, read-only household app connected to Home Assistant. The native foundation and 2D plan work on the Pixel. Two real devices are connected. Safe controls, camera images and a standalone build remain to be delivered.

| Delivery                                                                | Status                              | Evidence and remaining boundary                                                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| HA session, recovery and native credentials                             | Done for the development foundation | [Native validation](stage0/android-validation.md), [foundation results](stage0/results.md); standalone-binary acceptance remains separate           |
| Native Home, favorites, rooms, entity details, settings and diagnostics | Implemented                         | Browser/native checks in [interface direction](design/2026-10-15-interface-direction.md); broader sensor attention semantics remain U04             |
| Offline simulated home                                                  | Implemented                         | Explicitly simulated; neither this nor HA's demo entities certify real integrations                                                                 |
| Native 2D plan and F01                                                  | Done                                | [Pixel acceptance](stage0/floor-plan-validation.md); multiple floors, room picking and offline use                                                  |
| P01/P02: spatial preferences, profile plan, explicit reset              | Done                                | `81ac459`; migration and regression tests pass; native seeding and reset cancellation recorded, full reset behavior covered by automated tests      |
| Kasa HS103 and Petlibro PLAF103                                         | Partial H01                         | Read-only HA/backend proofs pass; physical actuation and complete native household presentation remain unverified; [inventory](stage0/inventory.md) |
| S01: native Three.js feasibility                                        | In progress                         | `a505fec` supplies a fixture scene and instrumentation; the kept Pixel measurements and acceptance report are still missing                         |
| P03/P04: room links and entity placements                               | Not started                         | Storage fields exist; no association or placement UI is implemented                                                                                 |
| U03/U04: device summaries and attention semantics                       | Not started                         | A feeder currently produces 23 visible entities; generic battery/problem/connectivity rules need implementation                                     |
| C01–C07: command tracking and controls                                  | Not started                         | Backend service-call primitives exist; no semantic command tracker or physical control UI                                                           |
| I01/I02: authenticated camera images and events                         | Not started                         | Backend request descriptor exists; native transport isolation and image UI are unproven                                                             |
| R01/R02/R03: maintenance, CI and standalone distribution                | Not completed                       | Audit remains open; no checked-in CI or accepted standalone APK                                                                                     |
| H02 and iOS                                                             | Deferred / hardware-dependent       | HA remains on the development Mac; iPhone validation and signing path are absent                                                                    |

Maurice is the user-facing name. Existing `home-cockpit`, `homecockpit` and `Cockpit*` package names, routes, identifiers and filenames are retained for continuity; this is not a second app.

## Latest verification checkpoint

The 2026-10-15 review of the implementation now recorded in the commits above ran:

- **96 repository tests across 13 suites:** pass.
- **5 additional local regressions** reproducing the earlier P01/P02 review issues: pass. Corresponding regression coverage is also present in the repository.
- TypeScript, ESLint and the configured Prettier check: pass.
- Petlibro through the actual HA backend: connected, 23 visible readings, resolved area and fresh entity/device/area registries. Kasa state readable. No device service calls were sent.

Earlier reports retain their original test counts, APK hashes and export results. These are dated evidence, not a fresh build of the current tree. **No new native build, S01 performance acceptance or dependency audit was performed during the CEO review or documentation cleanup.**

## Delivery order

This is the working order following the [CEO review](superpowers/specs/2026-10-15-maurice-ceo-review.md). Work on one bounded ticket per change; priorities are not calendar estimates.

1. **P03:** explicitly link plan rooms to HA areas. Keep unlinked devices visible.
2. **U03 and U04:** readable physical-device summaries and trustworthy attention. These can advance independently of placement and must precede stronger all-clear messaging.
3. **C01 → C02 → C03 → C04 → C07a:** finish the safe command path, then the first real Kasa lamp control. Preserve observed truth and never replay commands after reconnect.
4. **R03a:** a standalone APK for internal household trials, with dependency assessment and native acceptance. This can ship read-only before the command path is complete.
5. **P04 → S02**, only after **S01 passes:** device placement and a useful production spatial view with 2D/list fallback.
6. Extend **H01**, then locks/climate/fans and cameras according to verified hardware and actual household needs. Complete release hardening before **R03b** public distribution.

Finish the existing **S01** experiment alongside independent work: record Pixel startup, interaction performance, picking, offline assets, idle/background pause, teardown and failure fallback. A screenshot does not close S01. Work on **R01**, reproducible UI checks **F02**, and CI **R02** can also proceed independently. Coordinate ownership before editing the same shared modules concurrently.

The first useful household trial should answer simple questions about the lamp and feeder and, once enabled, confirm the lamp action. Proposed trial: seven days without Metro, noting useful visits, confusing states and reasons to reopen vendor apps. Availability of HA is a separate dependency: a standalone app still needs the Mac server to stay reachable until H02.

## Reading map

| Document                                                                                                                                                                                             | Role                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Root README](../README.md)                                                                                                                                                                          | Product introduction, setup and runnable commands                                |
| [Implementation backlog](BACKLOG.md)                                                                                                                                                                 | Current tickets, dependencies, technical contracts and next-agent prompt         |
| [Functional and technical specification](superpowers/specs/2026-10-14-home-cockpit-design.md)                                                                                                        | Product contracts and future requirements; explicitly labels implementation gaps |
| [Interface direction](design/2026-10-15-interface-direction.md)                                                                                                                                      | Visual principles, native UI evidence and spatial boundaries                     |
| [Floor-plan guide](design/floor-plans.md)                                                                                                                                                            | Actual geometry format, profile behavior, build preparation and privacy          |
| [Household inventory](stage0/inventory.md)                                                                                                                                                           | What is known and proved per real device                                         |
| [Foundation results](stage0/results.md)                                                                                                                                                              | Historical implementation, protocol and dependency evidence                      |
| [Android validation](stage0/android-validation.md)                                                                                                                                                   | Historical native artifact and session/fault checks                              |
| [Floor-plan validation](stage0/floor-plan-validation.md)                                                                                                                                             | F01 acceptance and later P01/P02 native observations                             |
| [CEO review](superpowers/specs/2026-10-15-maurice-ceo-review.md)                                                                                                                                     | Dated product assessment and rationale for the working priorities                |
| [Review 1](superpowers/specs/2026-10-14-home-cockpit-review.md), [review 2](superpowers/specs/2026-10-14-home-cockpit-review-v2.md), [foundations plan](superpowers/plans/2026-10-14-foundations.md) | Historical design input; not unfinished implementation queues                    |

## Updating the documentation

When completing a ticket, update its status/evidence in `BACKLOG.md` and the affected row here. Change the README if visible behavior or setup changed; change the spec if a contract changed. Add dated evidence to the relevant validation report with the tested scope and limitations. Preserve old results rather than replacing their numbers with a newer test count.

Use only public sample data in committed fixtures, builds and captures. Private plans, identifiers, tokens, full HA payloads and personal validation artifacts stay ignored. An exported bundle prepared with the personal plan **contains that plan**; choosing demo mode does not sanitize the artifact.
