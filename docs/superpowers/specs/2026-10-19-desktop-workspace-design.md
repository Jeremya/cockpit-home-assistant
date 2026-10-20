# D03 — Desktop workspace: plan, device panel and direct power

> **Execution update — 2026-10-20:** this is the earlier design draft, not an implemented feature. The user subsequently requested one shared phone/desktop experience. Follow the [UX00–UX09 handoff](../../handoff/README.md): evolve the shared card/action on both sizes, retain existing detail routes in the first sequence, then add coherent spatial selection and the constrained desktop camera. The in-panel detail requirement is deferred. The original sections below preserve the proposal; they do not override the handoff's corrected zoom bounds, lifecycle or shared-component scope.

Date: 2026-10-19. Status: design approved in conversation; awaiting written-spec review. Builds on [D01](../../design/desktop.md), [M01](../../design/power-enrollment.md), [U03](../../design/device-summaries.md), [S02](../../design/spatial-view.md) and the P03 room links.

## Intent

The user asked for a desktop UI that is friendlier and more intuitive, with easier access to connected devices. The stated main frustration is the **absence of quick actions**: turning the enrolled lamp on requires opening its summary page first. The user asked to keep an interaction model similar to [House Control](https://github.com/0xProbabillity/house-control) and to keep this change **desktop-only** for now.

Success means, on Chrome at desktop widths:

- the enrolled lamp can be switched from Home in **one click**, with the same M01 guarantees as today;
- moving room by room works from either the plan or the room chips, and both show the same devices;
- opening a device never leaves Home: its summary appears in the side panel, and Back/Escape returns to the list;
- attention stays visible at all times;
- the home is shown as a clean, stylish 3D model that stays framed and only turns horizontally, not a free-flying scene.

The phone keeps its current Home, cards and two-press power flow. No native screen changes in this slice.

## Reference patterns kept and adapted

| House Control                                  | Maurice D03                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Large spatial home; clicking a room focuses it | 3D model pane on the left (2D fallback); clicking a room frames it and filters the panel        |
| Constrained camera (±40° yaw, no pan)          | "Model" camera: horizontal rotation only, fixed tilt, no pan, bounded zoom                      |
| Room chips with counts                         | Area chips with device counts and an attention dot                                              |
| Compact tiles; active tiles highlighted        | `DeviceTile`: icon, name, key value, room; active state emphasized only from **observed** state |
| Power button on a tile (the AC tile)           | Separate ⏻ button, only for an M01-eligible primary switch                                      |
| Focused sheet with Back in the same panel      | Device summary rendered inside the panel, addressed by URL search params                        |
| Optimistic local state, rollback on rejection  | **Not adopted.** Requested state, command outcome and observed state stay separate (C01–C03)    |
| Scenes, All on / All off                       | Out of scope: only one actuator is enrolled                                                     |

## Layout

Applies when `useResponsiveLayout().desktop` is true (web, window ≥ 1024 CSS px). The D01 sidebar is unchanged.

```
┌ sidebar ┬──────────── plan pane ─────────────┬──────── device panel ────────┐
│         │ Home · 1 on · 7 devices · 1 alert  │ ⚠ 1 needs attention        ▸ │
│         │                                    │ (All) (Living 1) (Office 2)  │
│         │   3D model (2D fallback), rooms    │ LIVING ROOM                  │
│         │                                    │ [💡 Lamp  On · Living   ⏻]   │
│         │      [2D | 3D]   Floor ▾           │ OFFICE                       │
│         │                                    │ [⛏ Moria1  1.07 TH/s     ]   │
└─────────┴────────────────────────────────────┴──────────────────────────────┘
```

- **Two panes** when the measured main content width is ≥ 900 px: plan pane flexible (min 420 px), panel 380–440 px. Below that, a single column: plan above, panel below, with identical behavior.
- **Header line** above the plan: home name, then counts derived only from current observations: devices, eligible switches observed On, attention items. Unknown or unavailable states are never counted as Off or as healthy. When not ready, counts read as cached/unknown, matching the existing banner wording.
- The large `HousePlanCard` hero and the separate "Around your home" grid are replaced by the two panes on desktop. Narrow web and native keep the current Home.

## Room selection

One selection state lives in the desktop Home and drives both panes:

```ts
type WorkspaceSelection =
  | { kind: "all" }
  | { kind: "area"; areaId: string } // from a chip
  | { kind: "unassigned" } // devices without a resolved HA area
  | { kind: "planRoom"; planRoomId: string }; // from the plan
```

- **Plan → panel:** clicking a plan room selects `planRoom`. The panel shows devices whose resolved HA area is linked to that room through P03 (`src/spatial/selectors.ts`). An unlinked plan room shows "This room is not linked to a Home Assistant area" with a link to `/house-links`. A plan room is never matched to an area by name.
- **Chip → plan:** selecting an area chip highlights every plan room linked to that area on the current floor. If none is on the current floor and exactly one floor contains linked rooms, that floor is shown. Otherwise the floor does not change.
- Chips: "All", one per HA area that has visible devices (with the device count, plus an amber dot when any member has an attention item), then "No room" when applicable. The selection resets on profile change; a selection that no longer exists falls back to "All".
- In "All", Favorites come first, then groups by area, as on the current Home. A device spanning several areas appears under "Multiple rooms" in "All" and in each matching filtered view.

## DeviceTile (web/desktop only)

`src/components/DeviceTile.tsx`, used only by the desktop panel. Two sibling regions, never nested:

1. **Open region** — a link/button labeled `Open <device name>`: icon, name, key value, room label and qualifier (cached, partial, issue). It opens the summary in the panel. For a standalone reading (no device), it opens that reading in the panel.
2. **Power button** — rendered only when `primarySwitch` returns a switch that `switchControlRestriction` currently allows (enrolled real lamp, or the public demo lamp). The action is the inverse of the **observed** state; its accessible name states it ("Turn off Lamp"). It is disabled when the observation is unknown, unavailable, cached, non-ready or backgrounded, and while a command is `sending` or `accepted`. Outcome text (`switchOutcomeText`) appears under the tile in a polite live region and can be dismissed. Unconfirmed results ask the user to verify the lamp; nothing retries automatically.

Key value: `presentDevice(...).headline` and its first supporting row. Active emphasis (warm surface) applies only when a primary switch is observed On. Color never stands alone: the state text is always present.

## Shared power dispatch

Extract the dispatch, target-capture and outcome-subscription logic from `src/components/controls/SwitchControl.tsx` into `src/components/controls/useSwitchCommand.ts`. `SwitchControl` (On/Off buttons, used by summary and detail screens on every platform) and the tile's single toggle both consume this hook. No logic changes:

- same profile/session/entity/epoch target capture and re-check at press time;
- same synchronous latest-command read, so two clicks within one render cannot send twice;
- same `refused`/`no-op` local feedback and C02 tracking for `started`;
- SessionManager remains the authoritative gate; the hook adds no new service path.

Every existing `SwitchControl` test must pass unchanged. This is the only shared-code change visible to native, and it is behavior-preserving.

## In-panel detail

- Extract `SummaryContent` from `src/screens/DeviceSummaryScreen.tsx` into `src/components/DeviceSummaryContent.tsx`. The route screen keeps rendering it as today; the panel renders the same component.
- The entity reading view used by `app/device/[key].tsx` gets the same treatment so a reading opened from the panel stays in the panel.
- Panel state is held in Home's URL search params: `?profile=<id>&device=<deviceId>` or `?profile=<id>&reading=<stableKey>`. Browser Back, the panel's Back button and Escape step back. Params are revalidated on every render against the current profile, visibility and aliases, reusing `services/deviceNavigation.ts` checks. An obsolete or hidden target shows the existing "Device unavailable" state, never another device.
- Opening a device does not change the room selection or the plan.

## 3D

On desktop the plan pane opens in **3D by default**, reusing `CockpitSceneView`, its watchdog and its 2D fallback. The 2D/3D switch stays available. If WebGL fails or the watchdog fires, the pane falls back to `FloorPlanView` with the same selection and markers. The phone keeps its current S02 behavior: it opens in 2D and its camera is unchanged.

### Model camera (desktop only)

`CockpitSceneProps` gains `camera?: "orbit" | "model"`, defaulting to `"orbit"` (current behavior). Desktop Home passes `"model"`:

- **View:** a fixed three-quarter view with a narrow field of view (about 24–28°) for a near-isometric, "architectural model" look. The default azimuth comes from the plan (optional `camera.azimuth` in the floor-plan format, else a fixed default) and the tilt is fixed (about 45–50°).
- **Rotation:** horizontal drag only, clamped to about ±40° around the default azimuth. Vertical drag does nothing. No pan. Keyboard: Left/Right arrows rotate in steps when the scene has focus.
- **Zoom:** wheel/pinch bounded to roughly 0.6×–1.2× of the fitted distance. The fitted distance is recomputed on resize so the whole floor always stays in frame.
- **Room focus:** selecting a room (scene click, plan or chip) eases the camera to frame that room; selecting nothing, clicking empty floor or pressing Escape returns to the whole floor. The ease runs only while moving, then rendering stops (render on demand is preserved). With `prefers-reduced-motion`, framing is instant.
- Implementation: replace OrbitControls in `"model"` mode with a small yaw/zoom rig built on the existing `frameCamera` fit; keep the existing tap-vs-drag classification (`classifyGesture`) so a short click still picks a room or marker.

### Style pass (desktop model only)

- Walls facing the camera are cut away (rendered low or omitted) so interiors are visible; other walls keep the existing low preview height. Heights remain rendering settings, not measurements.
- Quiet materials: one floor tone per room kind, soft ambient + one directional light, the existing midnight background. Selected room gets a subtle outline/lift, not a saturated fill.
- Markers keep their U04 condition colors. A primary switch **observed** On gets a warm glow on its marker; requested or pending states never change the scene.
- Excluded for now: bloom, real-time shadows, detailed furniture meshes. They need their own measurements.

### Lifetime and measurements

Only one scene instance may exist: Home's scene unmounts when Home loses focus (for example when `/house` is pushed), when the 2D view is chosen, or when the tab is hidden. D03 takes over the browser part of M04 for this desktop view: record on this Mac's Chrome the time to first usable frame, interaction frame rate during rotation (target ≥ 30 fps), idle (no continuous rendering), tab-hidden pause, teardown on navigation and WebGL-context-loss fallback. A screenshot alone does not close this.

## Out of scope

- Phone/native layout, one-press phone control and any change to the phone's 3D camera.
- Scenes, All on/All off, dimming, other actuators.
- A Bitaxe-specific presenter. Moria1/Moria2 show the generic summary headline until a separate H01 evidence + `src/core/devices/bitaxe.ts` slice is done.
- Search/command palette, persistent sign-in (D02), PWA.

## Testing

Component and screen tests with fixtures and the injected demo backend:

- DeviceTile: two separate press targets; no power button without eligibility; button absent for another HS103, a revoked grant or an ambiguous primary; toggle direction follows the observed state; disabled for unknown/unavailable/cached/non-ready; double click sends once; outcome text and dismissal.
- Workspace: plan room → linked devices; unlinked room message; chip → highlighted plan rooms and floor rule; "No room" group; profile change resets selection; counts never treat unknown as Off.
- Panel: open device, open reading from it, Back/Escape/browser Back, stale param → unavailable state, profile mismatch.
- Single-scene rule: Home scene unmounts on blur, on 2D and on hidden tab.
- Model camera (pure rig functions): yaw clamp, no vertical rotation, zoom bounds, refit on resize, room focus and reset, reduced motion = instant, tap-vs-drag still picks; `"orbit"` mode unchanged.
- Fallback: WebGL failure/watchdog → 2D with the same selection.
- Regression: all existing tests, including SwitchControl and M01 enforcement, unchanged.

Browser checks on the public demo only: extend the existing public smoke with 1024/1280/1440 workspace flows (3D default with rotation limits, select room by scene/plan and by chip, open/close detail, demo lamp toggle On/Off with outcome), keyboard-only path and no page errors. A real-HA check is read-only; any physical lamp action requires the user's explicit authorization at that moment.

## Documentation

On delivery: add D03 to `docs/BACKLOG.md` and the status table in `docs/README.md`, extend `docs/design/desktop.md` with the workspace contract, and record evidence in `docs/stage0/desktop-validation.md`.
