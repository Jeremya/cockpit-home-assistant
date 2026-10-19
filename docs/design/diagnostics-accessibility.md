# U01 — Diagnostics, plan readability and accessibility

U01 keeps recovery in the backend and improves how existing session and spatial state is presented. It adds no retry timers, services, persisted preference schema or physical control eligibility.

## Session presentation

`src/core/sessionPresentation.ts` maps typed `SessionStatus` to safe text. Automatic recovery is described only when the backend reports `retrying` or `reconnecting`. Unreachable causes are deduplicated, allowlisted and disclosed as possibilities; they are not a confirmed diagnosis. Raw error details, addresses, headers and payloads are never interpolated. The detected unsupported version is validated before display. The backend version check and presentation share `src/config/homeAssistant.ts`.

`SessionBanner` retains Retry and Connection settings for errors, including terminal authentication and version failures. The status heading is a polite live region. Connection checks have explicit expanded semantics and remain optional. Diagnostics includes the same banner and distinguishes cached snapshots/HA area membership from fresh observations. Saved plan revision, unresolved area links and placements remain visible and are never deleted by diagnostics.

## Screen labels and physical points

`src/spatial/planLabels.ts` is a pure screen-space layout over the existing viewport projection. It reserves 48 dp marker targets at the exact projected saved points, then places room labels, then marker captions. Candidate rectangles must fit the frame; room labels must fit the room polygon, including concave boundaries. Labels avoid targets and previously placed labels. Text scale increases reserved dimensions. Crowded labels/captions may collapse; markers and the complete named native lists remain available.

`FloorPlanView` renders native text over the decorative SVG. Label placement never changes persisted physical coordinates, polygon picking, floor selection or stable-key navigation. It is deliberately a bounded candidate search, not an optimal packing algorithm. Large inventories and collocated markers remain U02 work.

## Navigation and focus

Selecting a room from the named list reveals its detail and focuses the heading on web. With a native screen reader enabled, the screen requests accessibility focus on that heading. Deferred native focus checks mounted state, current profile/plan identity, floor, room and view before acting. Polygon selection keeps its existing behavior. Returning from a placed reading restores focus to the originating 2D marker or named list row after route focus; cancellation and current placement/identity/floor/view checks prevent stale focus. `readingFocus.ts` requests native accessibility focus; `readingFocus.web.ts` observes navigator visibility/inert attributes if route focus precedes exposure. The observer disconnects after focus, invalidation or route cleanup. No fixed-delay retry loop is used. Selected floor/room semantics, named marker rows and 48 dp important targets remain exposed.

Browser smoke checks room-list reveal/focus, selected semantics, a saved marker at the public Floor 2 Bedroom label, non-overlap with its icon/caption, marker navigation, return focus and retained floor. Unit tests cover error privacy, terminal actions, automatic recovery, cached diagnostics, dense/concave plan layouts and text scales through 2.5. Browser focus/ARIA checks are not TalkBack acceptance.

## Verification and boundaries

Run `npm test -- --watch=false`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:tooling` and `npm run check:ui`. The last command uses an isolated sample-only copy and preserves the developer's generated plan. GitHub Public checks also verifies protocol behavior and Android Hermes/DOM exports.

Native acceptance requires a new named binary: R03a build 1002 predates these changes. Preserve saved credentials/preferences with a signed update. Use Explore demo home for public captures, cancel placement drafts, restore system font/accessibility settings, and restart into the saved HA connection after testing. Record the exact APK/source and phone, actual text scales, focus/traversal observations and remaining Pixel/TalkBack checks in the U01 validation ledger. Do not count older APK evidence or browser-only observations as new native acceptance.
