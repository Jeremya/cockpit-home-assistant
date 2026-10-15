# Interface direction and delivery sequence

Updated: 2026-10-15 after `da62474`. This is the visual/interaction guide. See [project status](../README.md) for delivery and [the specification](../superpowers/specs/2026-10-14-home-cockpit-design.md) for contracts. Native 2D and profile plans exist; room links, placements, controls and production 3D remain separate milestones.

## Reference and decisions

[House Control](https://github.com/0xProbabillity/house-control) is the visual reference. Its [iPhone screenshots](https://github.com/0xProbabillity/house-control/blob/main/docs/iphone.png), panel styles and room-selection behavior were inspected at commit `1b4d3fb0138b59efb4d56b0468781553ace46be9`. The useful patterns are a quiet dark background, a compact home header, consistent outline icons, colors associated with device categories, room filters and readable device surfaces. Its spatial view is a central part of the intended direction.

Maurice now uses those principles in its native read-only interface: midnight surfaces, blue accents, lavender security devices, blue comfort devices, mint readings and amber switches. Warning/error colors and explicit state text take precedence over category colors. Color never establishes physical state. The device value has more visual emphasis than its metadata.

Home has a single header, an honest room/entity count, expandable household attention and a responsive device grid. An unassigned group is not counted as a room. Attention stays global when a room is selected, excludes hidden entities and duplicates in Favorites, and puts alerts such as jammed locks before lower-severity observations. When disconnected, attention becomes unknown and values are marked cached. Room selection resets when the profile changes; a missing selection falls back to all rooms. Large system text or a narrow screen uses one grid column. Settings and entity details share the same tokens and icon family.

No reference code or assets were copied into the app. The reference uses a Swift shell around a Three.js web interface; Maurice keeps its Expo/native interface and HA-only backend. Feather icons come from the Expo-compatible `@expo/vector-icons` package; its font is included in exported bundles.

## Recorded previews and verification

These captures use the simulated demo before Maurice branding, not household data. They document the visual foundation and are not fresh screenshots of the current tree:

| Home                                    | Kitchen                                         | Device detail                                         |
| --------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| ![Demo home](screenshots/home-demo.png) | ![Kitchen filter](screenshots/kitchen-demo.png) | ![Observed device state](screenshots/device-demo.png) |

The installed Pixel renders the new icons, cards, room filter and device detail through the existing development client. Chrome checks cover demo startup, room filtering with global attention, stable-key detail navigation, favorite persistence, URL validation and entity settings. Widths of 320, 430 and 768 CSS pixels are checked for page overflow and device-card bounds. Native component tests cover filtering, alert expansion/priority, hidden entities, disconnected attention, deleted room selections and profile changes. This does not establish iOS or screen-reader usability; those need their own runtime checks.

## Delivery boundaries

Use [the current delivery order](../README.md#delivery-order) and [ticket contracts](../BACKLOG.md); this guide does not maintain a competing roadmap.

- **Delivered:** native visual foundation, F01 2D floor/room navigation, approximate furniture and P01/P02 profile-owned plans/reset.
- **Next household UX:** P03 links actual HA areas to plan rooms; U03 consolidates related readings into physical-device summaries; U04 gives battery/problem/connectivity states verified attention semantics. Global attention and individual entity details remain available.
- **S01 in progress:** `SceneLabScreen`, `CockpitSceneView` and the DOM scene already exist. Finish the Pixel report: offline assets, async selection, tap versus orbit, startup, at least 30 fps during interaction, no continuous idle rendering, background/unfocused pause, teardown and context-loss fallback. Fixture markers are explicitly fake; a screenshot is not performance proof.
- **Safe actions:** C01–C04 precede live controls. First slice C07a is the Kasa lamp; HA acceptance and observed completion remain separate. Locks, climate, fans and images follow their own verified integration/transport gates.
- **Production spatial view:** P04 placements and a passing S01 precede S02. Share selection/details with the list and retain 2D/list fallback. Render one floor at a time; do not expand into an editor or decorative animation before acceptance.
- **Daily use:** R03a can deliver an internal standalone read-only build before the entire MVP; HA host availability remains separate. R03b public release has stronger release gates. Advanced editor, tablet, history and per-occupant login remain later candidates.

The reference motivates clear hierarchy, calm surfaces and useful spatial navigation. The next readability gain is fewer equivalent entity tiles and better device summaries. Keep the Maurice portrait secondary; humor must not obscure an error, uncertainty or confirmation. No inferred furniture or approximate layout is presented as measured geometry.

## Long-term structure

Keep geometry, placements and appearance separate from HA entities and session state. A versioned plan uses meters and stable area/placement IDs; placements reference entity keys through the existing identity/alias layer. Persist geometry and preferences, not observed device states or pending commands. A missing entity becomes an unresolved placement until reconciliation.

The renderer receives only the plan, selection, sanitized marker state and session freshness. Credentials, authenticated camera URLs and HA connections stay native. A scene callback requests a room/device selection; native navigation and the command tracker own the resulting behavior. List and plan open the same detail route and share the same room selection, so a 3D failure cannot strand controls or invent a second source of truth.

Render on demand, coalesce bridge updates, and pause work when hidden. Measure frame time, first usable scene and memory on the Pixel before adding detailed furniture, shadows or animation. Virtualize the entity list when the real inventory warrants it. Extend these boundaries instead of moving networking, permissions or device policy into the scene.
