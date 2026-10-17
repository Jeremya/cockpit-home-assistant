# Production spatial view — S02

Implemented 2026-10-16 in the working tree after `45df8a4`. [Project status](../README.md) and [validation](../stage0/spatial-view-validation.md) distinguish code delivery from measured hardware acceptance. This extends the existing S01 renderer and P04 preferences; no new renderer, observation store or schema is introduced.

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

## Extension boundaries

This slice shows one floor with low preview walls and simple room materials. Heights are rendering settings, not measurements. Approximate furniture remains part of the 2D orientation layer; detailed 3D furnishing, shadows, bloom, a Home scene preview and an editor require separate design and measurements. Do not mount duplicate heavy scenes to add a preview.

Tests use real Three.js marker resources without WebGL and native component probes for the asynchronous bridge. Jest transforms the installed ESM package for those tests; no mock renderer is treated as native performance evidence. Large-home budgets, TalkBack/large fonts, iOS, physical controls and household standalone acceptance remain U02/U01/L02/C*/R03 work.
