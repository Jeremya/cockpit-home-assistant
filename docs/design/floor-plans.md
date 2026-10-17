# Local floor plans

Updated: 2026-10-16, including P03/P04 and S02 production 2D/3D integration. This documents the implemented geometry, profile, area-link and placement behavior. See [project status](../README.md) for remaining delivery, [the backlog](../BACKLOG.md) for contracts, and [validation](../stage0/floor-plan-validation.md) for evidence.

Home opens a separate **Floor plan** screen with a floor selector, tappable room polygons, printed dimensions where supplied, and a text list of the same spaces. Explicitly placed entities appear as icon/name/state markers and in a separate accessible list. Geometry works independently of HA connectivity; device values follow the existing observation/freshness policy and are marked cached when disconnected.

The screen starts with native **2D** and offers **3D view**, using the same floor, room selection and saved placements. Room focus and whole-floor reset are immediate. Errors retain the 2D markers/list and an explicit Retry. The scene pauses when its canvas leaves the viewport, on route blur and in background. See the [S02 ownership contract](spatial-view.md) and [runtime ledger](../stage0/spatial-view-validation.md). S01's Three.js feasibility is accepted on Pixel 9 Pro and Seeker; [scope and evidence](../stage0/scene-validation.md). A shared geometry model supports nonrectangular rooms and multiple floors, with one floor shown at a time. No story height or compass direction is assumed.

## Personal data and build preparation

Personal geometry lives in `.local/home-plan.json`. The reference image and personal validation captures also stay under `.local/`. None belongs in the shared repository.

`npm run house:prepare` validates that configuration and writes the ignored `src/spatial/current-plan.json` module for Metro to bundle. A fresh checkout without personal configuration uses [the public sample](../../src/spatial/sample-plan.json). Demo mode always shows that sample, even when a personal plan exists. It cannot silently present simulated devices as placed in the personal house.

Preparation runs after dependency installation and before the normal start, Android, web, typecheck, test and Android-export commands. Invalid configuration stops preparation without printing its contents or replacing the last generated module. After editing the local plan, run preparation again or restart through the npm scripts. A connected profile keeps the copy it was seeded with: the plan screen and Diagnostics then report a newer default, and **Diagnostics → Reset plan to default** applies it (this also clears room links and device placements).

The source file is private configuration; **an exported app or web bundle contains the plan chosen during build preparation** so it can render offline. Keep personal build artifacts local. To create a shareable sample build without changing local configuration:

```sh
COCKPIT_PLAN_FILE=src/spatial/sample-plan.json npm run house:prepare
npx expo export --platform web --output-dir dist-web
npm run house:prepare
```

The final command restores the personal module for subsequent development. `COCKPIT_PLAN_OUTPUT` can override the generated path for isolated validation; normal app builds use the default module path.

## Geometry contract

[The model and validator](../../src/spatial/model.ts) define schema version 1. Each plan has a stable ID, revision, display name, source and floors. Each floor has an outline, uniquely identified spaces, label positions and structural/detail lines. Room kinds control presentation; they do not describe a live device condition.

Coordinates are meters on the X/Z plane with Y up, matching the intended 3D convention. Geometry traced from an image is explicitly approximate. Printed dimensions are retained as source text, independently of the approximate polygon scale. The initial viewer does not calculate room area or infer missing dimensions. Unlabeled spaces keep neutral names until the household confirms their use.

A floor may also list rough **furniture** footprints (kind, rectangle or ellipse, center, width × depth in meters, optional rotation in degrees counter-clockwise seen from above). They are drawn as quiet line art under the room labels, purely to help orientation; they are placed by eye from photos, never measured, and carry no device or HA meaning.

Validation checks schema version, finite/bounded coordinates, nonzero polygons, unique IDs, room vertices inside the floor, labels inside rooms, and furniture centers inside the floor with bounded sizes. This is a layout format, not a CAD or survey model. Floor alignment, wall thickness, door/window details and elevations need refinement before a detailed 3D reconstruction.

HA areas and entity identities remain separate. No HA areas are created and no entities are assigned from a drawing. The Home summary calls its count **HA rooms** to distinguish real area assignments from spaces on the plan.

## Room links and entity placement

**Link rooms** explicitly associates a plan-room ID with an existing HA area ID; an area links to at most one plan room. Entity room resolution remains override → entity area → device area. These links supply room entity lists, never inferred coordinates. Counts say **entities**, since several readings can belong to one physical device. Retained area names are qualified when registry metadata is stale; removed areas/rooms remain unresolved in Diagnostics.

**Place device** is a separate editor (`/house-place`). Choose a visible entity, a floor and optionally a room, tap a draft position and press **Save position**. Floor/room changes clear the draft; Cancel writes nothing. A point must be inside the floor's actual polygon and the chosen room when present; concave cutouts are rejected. Reposition and Remove edit only spatial preferences, without changing favorites, visibility, room links, credentials or HA assignments.

Placements live in the existing schema-2 `preferences.spatial.placements`, indexed by stable entity key, with `floorId`, optional `roomId` and `position: {x, z}` in meters. No screen pixels or observed state are persisted. `spatial/viewport.ts` shares the exact padded viewBox with `FloorPlanView`; projection/inverse projection account for the SVG's `xMidYMid meet` letterboxing and inverted Z. Native and DOM pointer events are normalized before conversion. Native overlay buttons supply accessible marker targets outside the decorative SVG.

`spatial/placements.ts` derives markers from the current snapshot, aliases and geometry. Renames follow the same stable key; a recreated UUID never inherits a placement by name or entity ID. Canonical entries win alias collisions. Missing/hidden entities and invalid floor/room references are retained and listed in Diagnostics/**Manage placements** for removal or repair. Unavailable entities keep their marker and condition; cached observations are explicitly qualified. `placementActions.ts` checks the latest profile/plan identity and loaded preferences before local edits; changing profile or plan discards the open draft. A marker and its text-list entry open the existing stable-key device detail route. No placement action sends a service call.

## Validation and next steps

The automated tests use only the public sample and generated temporary configurations. They cover geometry/preparation, concave floor and room picking, profile isolation, stale edits, identity aliases, missing/hidden/cached/unavailable entities, coordinate conversion at different sizes, explicit save/cancel, persistence across restart, reposition and remove. The browser workflow checks actual SVG bounds, marker alignment at 320/430/768 CSS pixels and editing after networking is disabled following load. The [validation ledger](../stage0/floor-plan-validation.md) records native scope and artifact boundaries.

The configured personal plan was checked locally in Chrome at 320, 430 and 768 CSS pixels, including polygon selection, source-dimension display and floor changes with networking disabled after loading. Its screenshots and detailed report remain private. Android was rebuilt with `react-native-svg` 15.15.4; native interaction validation is recorded separately in [Android validation](../stage0/android-validation.md).

P03 associations and P04 2D placements are implemented. The S01 lab consumes shared geometry and passes native feasibility; S02 now integrates saved placements into the production 3D view; its runtime ledger retains hardware-specific gates. Refinements to approximate geometry remain explicit household edits; a bundled update does not overwrite the saved profile plan. U04 now supplies shared attention semantics; U03 supplies physical-device summaries. 2D remains the spatial fallback.
