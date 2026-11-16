# Production spatial view — S02

Implemented 2026-10-16 in the working tree after `45df8a4`. [Project status](../README.md) and [validation](../stage0/spatial-view-validation.md) distinguish code delivery from measured hardware acceptance. This extends the existing S01 renderer and P04 preferences; no new renderer, observation store or schema is introduced.

## Browser lifecycle extension — UX07, 2026-10-21

Home now has an opt-in 3D preview using the same sanitized placements and room selection as its 2D plan. Both production web routes retain view preference and failure in bounded page-memory UI entries scoped to profile/plan/revision. They survive Expo layout replacement on browser Back. Retry is explicit and advances a guarded attempt; resize, floor changes, observations or hiding/showing cannot erase a failure. Switching identity resets the scope, including rejection of callbacks from an earlier visit to the same identity.

`CockpitSceneView` separates its persistent failure host from a renderer mount's readiness/watchdog. `mountRenderer` defaults to true. Browser route blur and document hiding release the renderer; viewport intersection only suspends its frames and watchdog. Native retains the previous WebView suspension on AppState/route blur. The 2D fallback is interactive during loading and is removed once the first 3D frame is ready, avoiding overlapping active targets. All callers, including the host, enforce `buildFeatures.spatial3d`.

Identifier-free lifecycle counters distinguish created/disposed/live/peak contexts from rendered frames. The sample Chrome lifecycle recipe measured a peak of one live renderer across Home → House → Home, explicit 2D, hidden document, fallback and retry. Disposal also verifies controls, observers, listeners and pending RAF. This is lifecycle evidence, not native/GPU performance acceptance. The default remains **2D**, and orbit is unchanged pending UX08. [Evidence](../stage0/desktop-validation.md#ux07--cycle-de-vie-web-et-repli--2026-10-21).

## Presentation layer — P0, 2026-10-28

The owner approved a "premium architectural miniature" direction. P0 changes presentation only and keeps the bridge, marker diff, picking, lifecycle and preference model unchanged. [Design system, licences and roadmap](../design/3d-asset-system.md).

- `src/web/sceneStyle.ts` owns scene-only palette tokens and rendering heights: exterior wall `1.8 m`, interior partition `0.9 m`, camera-facing curb `0.14 m`, wall cap `0.03 m`, plinth `0.3 m`. These are previews, never measurements or HA story heights.
- `src/web/sceneWalls.ts` derives envelope walls from `PlanFloor.outline` and partitions from `PlanLine`; gaps in saved lines remain doorways and `step` lines stay out of 3D. A wall whose outward normal faces the camera is cut to the curb. The direction is fixed per camera mode (`MODEL_YAW` for the model view, the default orbit view otherwise); orbiting does not rebuild geometry.
- Floors use deterministic procedural oak/walnut/stone tiles at 256² and no external request; wall bodies and their separate dark caps are rounded. `RoundedBoxGeometry` inherits BoxGeometry's indexed groups, so a wall never uses a six-material array.
- The renderer uses ACES tone mapping, a warm key light with one `2048²` PCF shadow map and a hemisphere fill. `shadowMap.autoUpdate` is false and the map is redrawn only when the floor is built, preserving zero idle frames. Markers do not cast shadows.
- The model camera keeps `FOV 26`, moves elevation `48° → 38°` and uses a proportional `0.05` margin with no pixel term. Framing includes the plinth and wall height; the floor-outline-inside-canvas regression still passes at 1024/1280/1440.
- Room labels switch to dark ink on the lighter floors; the U04 marker palette and label layout are unchanged.

**Evidence:** 999 Jest tests / 74 suites, TypeScript/ESLint/Prettier and `npm run check:spatial-ui` (all checks, one live renderer, no unexpected console events) pass on the working tree. This is Implemented + Automated, not Built/Installed/Observed; no post-P0 GPU or phone measurement exists, and the trial channel still disables 3D.

## Native ownership

`HousePlanContent` in `src/screens/HousePlanScreen.tsx` owns the active floor, selected plan room and 2D/3D view choice. The existing `useHousePlan().identity` keys its lifetime to the profile, plan ID and revision. It opens in 2D; switching views preserves floor and room. Changing floors clears the room; changing the profile/plan resets the screen. These selections are local UI state, not saved device configuration.

Both views use `savedPlacements` and the same U04 interpretation. `src/spatial/scene.ts` selects only eligible placements on the active floor and emits the allowlist `{key, floorId, position, icon, label, condition}`. Labels are bounded; native lists retain complete names and observed values. No token, raw attributes, service call, image URI or U03 summary identity enters the scene. A new reading or discovered device is never automatically assigned a position.

`src/spatial/navigation.ts` rechecks the current profile, displayed plan identity, alias, placement existence, floor, geometry and entity visibility before delegating to the existing stable-key observation route. Screen callbacks additionally reject an obsolete floor, an unmounted screen or a retired 3D view. Room callbacks select only a room from the current floor. A marker tap cannot modify its placement or dispatch a command.

The native room list, placed-reading list, area links and placement editor remain available. HA-area membership is distinct from a saved position and from a plan-room ID. Unknown, unavailable and cached observations retain their existing interpretation; unresolved/hidden placements stay saved for reconciliation and are not drawn.

## Renderer updates and camera

`CockpitSceneView` remains the native owner of readiness, the watchdog, attempts, retry, route focus and application visibility. Its fallback receives the same native markers as the 2D view, preserving navigation after a DOM/WebGL failure. The screen also supplies viewport intersection, so a scene scrolled entirely out of view does not keep rendering. Choosing 2D unmounts the WebView rather than keeping a second renderer hidden behind it.

`src/web/sceneMarkers.ts` diffs by stable entity key. Equal bridge values retain every object. Condition changes update an existing material; position changes move that group; label/icon changes replace only its label texture/material. Removed nodes dispose their owned resources. `sceneResources.ts` disposes unique geometry/material/texture resources once; Three.js's shared sprite quad is not owned by an individual marker. Unchanged floor geometry and the user's camera orbit survive observation updates.

`src/theme.ts` and `core/appearance.ts` share category/condition colors across native cards, SVG and DOM markers. The renderer does not reinterpret health or use its own severity palette. Marker labels include a small code-drawn domain icon and retain a readable pixel size during zoom. `web/labelLayout.ts` keeps them inside the canvas and away from one another and from pins. Crowded/offscreen labels defer to the native list; room labels yield when they overlap a marker. Native names remain complete. No external texture or font request is required.

A room selection highlights and instantly frames that room. **Show whole floor** clears selection and resets framing, including after manual orbit. Floor/viewport changes refit the geometry. Camera changes are immediate, with no auto-rotation, damping or animation; reduced motion needs no alternate animated path. Users can still directly drag/pinch. The native lists provide the alternative to spatial picking.

The [Expo DOM contract](https://docs.expo.dev/guides/dom-components/) uses serializable props and asynchronous top-level actions. Preserve the existing attempt guards: a late ready/error/selection callback must not revive a retired renderer. The scene uses the installed Three.js API, on-demand frames and explicit resource disposal; see [Three.js documentation](https://threejs.org/docs/). Keep watchdog and disposal regressions alongside any later visual effects.

## Furniture — P1, 2026-10-28

`SceneFloor.furniture` now carries allowlisted `{id, kind, variant, shape, center, width, depth, rotation}` records. `PlanFurniture.variant` is optional; older plans fall back by kind. `src/web/furnitureScene.ts` builds a fallback volume per item, then replaces it with a cached, normalized Kenney GLB (CC0) when it loads. The model is centred on the plan point, its floor sits on the finished floor, its yaw equals the plan rotation, and its height comes from `src/web/furnitureCatalog.ts`. Rugs stretch to the plan footprint; counters repeat a module along the width (bounded). Materials are Maurice's palette, not the vendor's. Imported geometry is cloned per instance so the GLB cache is never invalidated by `disposeGroup()`.

Furniture is decorative and non-interactive. It has no entity identity, room link or command path, and `PlanFurniture.kind` still only controls the 2D line art. Marker picking and room selection are unchanged. Tall furniture extends the camera-framing height. A failed or absent GLB leaves the fallback volume, so the scene degrades rather than breaks.

**Evidence:** 1005 tests / 75 suites and `npm run check:spatial-ui` (furnished public sample) pass. The web export emits the 23 GLBs and loads them. A release APK built with `export:embed` embeds all 23 under `assets/www.bundle/...`; installed on the Seeker with Metro stopped, it rendered the furnished sample offline. The `expo export` JS/OTA artifact still omits them ([OQ-09](../architecture/open-questions.md)); the trial channel still disables 3D.

## Extension boundaries

This slice shows one floor with a cutaway envelope, preview partitions and catalog furniture. Heights and model scales are rendering settings, not measurements. Furniture placement editing, door openings, bloom, an editor and additional visual effects require separate design and measurements. Do not mount duplicate heavy scenes to add a preview.

Tests use real Three.js marker resources without WebGL and native component probes for the asynchronous bridge. Jest transforms the installed ESM package for those tests; no mock renderer is treated as native performance evidence. Large-home budgets, TalkBack/large fonts, iOS, physical controls and household standalone acceptance remain U02/U01/L02/C*/R03 work.
