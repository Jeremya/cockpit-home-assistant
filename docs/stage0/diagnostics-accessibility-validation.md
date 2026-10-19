# U01 validation — 2026-10-19

**Diagnostics, 2D readability and focus behavior are implemented. Native accessibility acceptance remains partial.** The [architecture guide](../design/diagnostics-accessibility.md) owns the contracts; the [safe aggregate](diagnostics-accessibility-proof-2026-10-19.json) separates source/browser checks from exact phone binaries.

## M00 follow-up

The [M00 ledger](return-focus-validation.md) supersedes the unresolved web finding below. It reproduces the missing-marker layout race, records the correction and passing extended browser/CI checks, and tracks the additional native transition-exposure correction. Trial 1007 now passes the scoped Seeker marker/list return and Study reveal, with user-confirmed clear speech. Preserve the distinct scope of U01 build 1005 text checks, M00 exact candidates and the broader accessibility flows still untested.

## Earlier review follow-up

The [2026-10-19 household review](../reviews/2026-10-19-household-mvp-review.md) checked the later documentation-only commit `2c496be`. Its functional/export CI job passes, but marker return focus fails at 430 px with the browser document active; a fresh local three-width run passes. The earlier passing runs below remain valid observations, but web return-focus stability is **not accepted**. M00/U01/R02 must reproduce and correct the intermittence; its exact cause remains unproven. No new native check was performed during that review.

## Implemented behavior

- Session messages distinguish automatic recovery from terminal authentication/version errors. Retry and Connection settings remain available. Possible causes are qualified and optional; raw transport details and invalid version strings are not displayed.
- Diagnostics exposes cached/fresh state alongside saved revision, unresolved links and placements. Reading diagnostics does not remove reconciliation metadata.
- Screen labels avoid fixed 48 dp marker targets. Room labels stay inside their polygons; captions collapse when necessary. Physical placement coordinates and polygon picking are unchanged. Named lists retain all rooms and eligible placed readings.
- Room-list selection reveals its detail and requests heading focus. Returning from a placed reading restores the originating marker/list focus only while route, identity, floor, view and placement remain valid. Web focus waits for removal of navigator hiding/inert state; pending work is cancelled on leaving the route.

## Repository and browser evidence

The first implementation is `f698d53`; `10a3841` adds explicit return focus and stale-placement guards. Local type/lint/format, **594 tests / 38 suites**, and the three-width public smoke pass at that checkpoint. Two additional DOM tests exercise deferred visibility and cancellation in the platform-specific focus helper.

The final platform-specific helper and its two DOM regressions are in `f3b3aa1`; **596 tests / 39 suites**, TypeScript, lint and formatting pass locally. The [final clean Linux run](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39262054448) also passes both functional/Android-export and three-width UI jobs.

The [successful Linux run for `173995a`](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39261299560) passes functional checks, six tooling tests, decoder/protocol proofs, Android Hermes/DOM export and UI smoke at **320/430/768**. Its browser log records zero page errors/external requests, unchanged generated plan and all U01 scenarios passing. GitHub logs were read; archived screenshots were not downloaded.

The first two Linux attempts failed the new marker-return-focus assertion. The application gained explicit guarded restoration; the runner also activates its headless window before testing focus, without selecting or focusing a DOM target. The successful run already reported the marker active and document focused before that activation. Do not infer a confirmed headless-window defect from the earlier failures. The final visibility helper additionally handles the navigator exposing its route after the route-focus event, rather than relying on a fixed delay.

## Native evidence and exact scope

Maurice Trial **build 1005**, package `com.larrabee.homecockpit.trial`, was built from clean `f3b3aa1f1d7580a8146b3d8fd799b1546d603bd9` and installed as a signed update on **Seeker / Android 16**. Its APK SHA-256 is `7846c7e1c2c7f6356b451aa3a4adbfe6c77ef9ba08e0fd8b725d7cea7aa8a235`; certificate SHA-256 is `7191b909f58f9900cbfeb875c8d61ad5261efff9463b53b3e522c6b872261153`. The public sample is bundled; real controls, production 3D and the lab remain disabled. The binary runs without Metro.

| Native check | Result |
| --- | --- |
| Signed update preserves saved HA connection | Pass; normal restart returns to synchronized HA without entering credentials |
| System text at 100%, 150%, 200% | Pass on build 1005; each scale set and read through Android settings |
| Floor/room selected semantics | Pass in the native accessibility tree at all three scales |
| Floor important targets | At least 48 dp at all three scales, using device density and native bounds |
| Selecting the lower room-list row | Study detail appears in the viewport at all three scales |
| Bedroom label/marker collision | Unsaved demo draft placed at its public label anchor; room name remains readable; crowded caption collapses at 200% |
| Cleanup | Drafts cancelled; original font scale restored; saved household HA session restored; no new app crash observed |
| TalkBack spoken feedback and native return focus | Not yet accepted |
| Pixel U01 battery | Not run; optional extension after the user selected Seeker as the reference |

Raw phone XML/screenshots and helpers stay ignored in `.local/u01/`; only sample/demo screens were captured. No credentials were reentered, existing placements replaced, phone data cleared or physical HA services called. TalkBack attempts created a temporary demo placement only after confirming the demo had zero placements; each attempt removed it and verified zero placements again. Build 1003 was an earlier passing visual/text candidate; it predates the explicit return-focus correction and is not final focus evidence.

Earlier **build 1004**, from clean `10a38417ff2be41d68f6a71401d9d2bfbc89bce0` (APK SHA-256 `193552c7d9f9d80c292dd30bd7ee8c62fffcfc5b8d0b3e70ad9ff3b633123cb1`), passed the same three-scale visual/semantic battery before the final platform-helper extraction. The complete battery was repeated and passed on build 1005; its exact build receipt and installed APK digest are in the aggregate. R03a **build 1002** remains the separately accepted older household battery on both phones; these bounded U01 checks do not repeat its complete fault/update/reinstall suite or certify public release.

## TalkBack attempt on build 1005

The first adapter used the upstream class name rather than the installed manifest component. After correcting the component and binding the installed TalkBack 17.1 service, its first-use tutorial remained in front of the app and intercepted the attempted traversal. The installed service returned no node hierarchy for the requested dump. App-level TalkBack floor/room selection, marker traversal and return focus therefore remain **unverified**, rather than being counted as failures of the application. Public/demo captures identified the tutorial; no household screen was captured. Accessibility settings were restored after every attempt, the temporary demo placement was removed and the saved household HA connection returned ready. The user could not listen during this session. A supervised manual pass is still required.

## Contrast and remaining acceptance

Calculated enabled-state palette pairs: muted body/panel **7.64:1**, title/panel **15.47:1**, warning/panel **10.53:1**, dark action text/accent **10.48:1**, room label/kitchen **7.79:1**, selected room label **7.15:1**. These six checks cover the changed primary surfaces, not a whole-app WCAG certification or every disabled/translucent combination.

The user selected Seeker as the U01 reference phone. To close U01, test the exact latest signed binary with TalkBack on that phone: selected floor/room spoken feedback, complete marker/list traversal, returning focus after details, terminal Retry/Settings actions and the 100/150/200% text pass. A native node tree can verify semantics/focus, but cannot prove what was spoken or that the flow is comfortable to use. The user could not listen during this session, so spoken-feedback acceptance remains open. Preserve settings and restore the saved HA session afterward.

The independent [R01 dependency audit](https://github.com/Jeremya/cockpit-home-assistant/actions/runs/39262054453) remains failing; no advisory was suppressed. Seven-day household observations, S02 production 3D on Pixel, physical Kasa activation, large-home U02 measurements and R03b distribution remain separate.
