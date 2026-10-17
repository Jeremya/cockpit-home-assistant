# Device-summary validation — U03

Date: 2026-10-16. Working tree after `45df8a4`; no U03 commit recorded yet. The [implementation contract](../design/device-summaries.md) describes ownership and fallback behavior. This checkpoint certifies a read-only slice, not physical actuation, vendor telemetry accuracy or standalone distribution.

## Repository and public-demo checks

- **215 tests across 21 suites pass.** New selector/presenter and native-component cases cover actual membership, standalone readings, absent/stale metadata, hidden/disabled/missing/unavailable members, cross-room ambiguity, aliases/renames, profile changes, delayed callbacks, favorites, malformed timestamps, quantities and unverified role metadata. Existing U04/P03/P04/S01 tests remain passing.
- TypeScript, ESLint and the configured Prettier check pass. No new dependency or preference schema was introduced.
- Public-sample web and Android Hermes exports pass. These are JavaScript exports; they are not a new APK or standalone acceptance.
- Chrome's public demo shows one feeder card, six summary roles and all seven eligible demo readings. Stable-key detail navigation, favorites after a full reload/reopening demo, room-filter deduplication and global attention pass. After loading, demo navigation also works with the browser offline. Widths 320/430/768 CSS pixels have no page overflow or out-of-bounds device cards; no page errors were recorded.
- Public captures below were inspected for hierarchy and readability. They are browser renders of native components, not native performance or accessibility evidence.

| Filtered Home                                                       | Feeder summary                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ![U03 public demo Home](../design/screenshots/u03-kitchen-demo.png) | ![U03 public demo feeder](../design/screenshots/u03-feeder-demo.png) |

## Actual HA read-only proof

The actual `HomeAssistantBackend` snapshot passed through the production summary selector and presenter: **one feeder card for 23 visible readings, six mapped roles with available values, one Kasa card**. Uninterpreted telemetry remains qualified. The role mapping was checked against installed Petlibro integration 1.2.32 source and actual registry role metadata, not inferred from private names or entity suffixes.

No device service calls, feeding, scheduling or physical switch changes were performed. Credentials, device IDs, names, addresses, raw payloads and personal screenshots stay ignored under `.local/`.

## Native acceptance

Seeker, Android 16, existing ARM64 development client with current Metro JavaScript:

1. Reopen the app and reconnect to the saved HA profile.
2. Open the actual feeder's summary; verify the PLAF103 model, last/next reported-feed roles and access to all **23** visible readings.
3. Expand those readings, open the individual last-feed observation, and return through **All readings for this device** to the same feeder.
4. Return Home and open the actual Kasa summary.
5. Force-stop/relaunch, reconnect to HA, and reopen the feeder with all 23 readings still accessible.

All steps pass. These checks used the current real profile without changing credentials, favorites, room links or placements. No physical command was sent. This is a development-client smoke on the Seeker; it does not repeat Pixel acceptance, certify every individual vendor reading, measure frame performance or accept a standalone APK.

The [aggregate proof](device-summary-proof-2026-10-16.json) retains only safe results. Local harnesses are `.local/petlibro/u03-backend.ts`, `.local/house-validation/check-u03-browser.py` and `.local/android/u03-summary-check.py`. Raw native captures and local role targets remain ignored. These harnesses are lab tooling; checked-in reproducible UI automation remains F02/R02.

## Remaining gates

U03 does not verify proprietary battery/power semantics, food delivery accuracy, cloud-session reliability, large-home performance, TalkBack, large system fonts, iOS or a standalone binary. Synthetic tests cover failure/ambiguity cases; they do not establish hardware failures. H01, U01/U02 and R03 retain those gates. Production 3D remains S02, using the accepted S01 host and P04 placements.
