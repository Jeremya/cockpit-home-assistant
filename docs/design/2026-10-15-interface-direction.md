# Interface direction and delivery sequence

Updated: 2026-10-16, including the House Control comparison after S01 acceptance and delivered U03 summaries. This is the visual/interaction guide. See [project status](../README.md) for delivery and [the specification](../superpowers/specs/2026-10-14-home-cockpit-design.md) for contracts. Native 2D/profile plans, explicit room links and placements exist; S02 now supplies production 2D/3D switching; controls and household distribution remain future milestones.

## Reference and decisions

[House Control](https://github.com/0xProbabillity/house-control) is the visual reference. The initial comparison used commit `1b4d3fb0138b59efb4d56b0468781553ace46be9`; the 2026-10-16 refresh inspected `88c84cca77fc12f9297dc91ba28ce58bc9f316d7`. The useful patterns are a quiet dark background, a compact home header, consistent outline icons, room filters and readable device surfaces. Its spatial view is a central part of the intended direction. The upstream screenshots are presentation references, not evidence that we executed or benchmarked its native app.

Maurice now uses those principles in its native read-only interface: midnight surfaces, blue accents, lavender security devices, blue comfort devices, mint readings and amber switches. Warning/error colors and explicit state text take precedence over category colors. Color never establishes physical state. The device value has more visual emphasis than its metadata.

Home has a compact header, separate device/reading counts, expandable household attention and one-column physical-device cards. An unassigned group is not counted as a room. Attention stays global when a room is selected and excludes hidden entities. Full favorite summaries are not repeated in room sections in the whole-home view; compact attention links can still open their affected members. When disconnected, attention becomes unknown and values are marked cached. Room selection resets when the profile changes; a missing selection falls back to all rooms. Cards expand with their content. Settings and entity details share the same tokens and icon family.

No reference code or assets were copied into the app. The reference uses a Swift shell around a Three.js web interface; Maurice keeps its Expo/native interface and HA-only backend. Feather icons come from the Expo-compatible `@expo/vector-icons` package; its font is included in exported bundles.

## House Control comparison — 2026-10-16

Method: refreshed the ignored upstream clone, inspected its published iPhone image, `ui/panel.js`, `style.css`, `three/world.js`, `three/house.js`, `store.js` and floor-plan guide, then compared Maurice's current Home, entity cards, details and scene host. This is a source/design review; no device actions or new performance claims were made.

At the comparison checkpoint before U03, the largest gap was information hierarchy. Maurice's palette already fits the direction, but its Home stacks branding, a large title/date, the plan entry, counters, explanatory attention text and entity grids. A single feeder contributes 23 readings. More glow or furniture will not resolve that reading burden.

| Reference pattern                                                           | Current Maurice gap                                                                            | Implementation direction                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home header, prominent spatial model and compact device list                | The plan is a separate entry card; several information blocks precede useful devices           | U03 compacts Home around devices; S02 supplies the production spatial view. A later live Home preview must reuse that view's selection and lifecycle.                                                      |
| Tiles represent familiar lights/ACs                                         | Cards represent individual HA entities; a feeder occupies many equivalent tiles                | One physical-device summary with key readings and access to every eligible member. Preserve standalone readings and ambiguous membership.                                                                  |
| Large useful value; extra controls appear in a focused sheet                | Entity details emphasize a generic large state and several paragraphs of technical explanation | Device-specific summary first; observation details and raw attributes remain expandable. Use the existing native detail route initially. A bottom sheet is optional presentation work, not a prerequisite. |
| Selected room drives both camera framing and visible devices                | Home and plan selections live in separate screen-local state; S01 is still a fixture lab       | S02 owns shared floor/room selection above 2D and 3D. Add room focus and an explicit whole-floor reset after real placements work. Never equate a plan-room ID with an HA-area ID.                         |
| Distinct active/inactive surfaces, restrained background and cut-away walls | Repeated borders/panels and uniformly tall entity tiles reduce useful density                  | Keep native tokens, reduce repeated containers, let card size follow content, and use state emphasis only where useful. Explore cut-away walls as rendering settings; preserve the actual geometry.        |
| Capable light/AC scenes and widgets                                         | Maurice's command path is not implemented                                                      | Complete C01–C04 and C07a before enabling the Kasa action. Scenes/widgets come after observed outcomes, cancellation and no-replay behavior are proven.                                                    |

Source anchors: [panel](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/ui/panel.js), [styles](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/style.css), [renderer](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/three/world.js), [store](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/web/src/store.js), [geometry format](https://github.com/0xProbabillity/house-control/blob/88c84cca77fc12f9297dc91ba28ce58bc9f316d7/docs/floor-plan.md).

### Home composition — U03 delivered

Delivered in the 2026-10-16 working tree; see [contract](device-summaries.md), [current public captures and Seeker evidence](../stage0/device-summary-validation.md). The requirements below remain the extension guide.

Keep a compact house header with an accessible Settings target and an accurate observation qualifier. Make device summaries and favorites reachable without a large stack of introductory panels. Retain a lightweight plan entry until S02's production view is accepted. Attention stays global: issues and disconnected/partial states remain visible; explanatory coverage can expand on demand. Room filters and device counts must distinguish physical devices from readings.

For the first two real devices, show one lamp/plug card and one feeder card. The feeder may summarize last distribution reported, next distribution announced and relevant quantities only when the roles and units are verified. Otherwise show useful generic readings and explicit incomplete interpretation. A reported distribution never becomes a claim that the cat ate. All eligible secondary readings remain reachable through the device summary and existing stable-key entity details.

The first U03 slice stays read-only. Tapping a summary opens its readings; it must not resemble an enabled power or dispense action. Prefer a primary value and at most a few relevant supporting readings over a fixed-height tile for every member. Large fonts may expand cards or use one column. Keep Android's important targets at least 48 dp.

### Where Maurice should improve on the reference approach

These are product goals, not claims that the current app is already superior:

- **Broader household understanding:** support the feeder, plug, locks and sensors alongside climate/lights, with one understandable physical-device view and visible partial coverage.
- **Trustworthy observations:** keep observed state separate from requested state and command outcome. The reference store updates local light/AC state before command completion and rolls back on rejection; Maurice's C01–C03 contract instead waits for relevant observations and can report an unconfirmed outcome. Missing telemetry stays unknown, including temperature: never substitute a simulated measurement into a real-device summary.
- **The actual house:** retain several floors and concave geometry, explicit HA-area links and placements. The reference's documented room primitives are rectangles; do not reshape this house around that representation or assume measured wall heights.
- **Usable with failures and accessibility:** preserve cached/unknown qualifiers, a native list/2D alternative, large text and explicit action labels. An attractive 3D view cannot be the only navigation or control path.
- **A focused technical scope:** HA owns integrations and automations; native code owns credentials, device policy, commands and navigation; Three.js renders sanitized props. Direct Tuya/Hue/HomeKit clients, an AI gateway and a desktop shell are separate product decisions, not requirements for this visual direction.

### S02 presentation after U03

First integrate real P04 placements with the proven scene host, shared selection and stable-key navigation. Then add room focus/reset, clear names/icons, state-dependent material updates and quieter architectural materials. Fit concave floors at narrow widths and keep markers selectable. Low walls, subtle floor distinctions and simple lighting come before detailed furniture or post-processing.

The reference already renders on demand, can pause its renderer and updates units by ID; these are useful shared techniques. Its bloom, shadow maps and high-performance GPU preference are optional visual choices. Maurice's S01 results cover a small scene without those effects; any new effects need their own measurements. A live Home preview must avoid mounting duplicate heavy scene instances and must stop work offscreen. Keep reduced motion and the native fallback throughout.

The [delivery order](../README.md#delivery-order) and [backlog](../BACKLOG.md) remain authoritative. U03 and S02 integration are implemented. See [S02 validation](../stage0/spatial-view-validation.md) for current phone gates; the next code slice is C01. Command controls and standalone household distribution retain their own gates. A full geometry editor, scenes, widgets and AI access remain later decisions.

## Recorded previews and verification

These captures use the simulated demo before Maurice branding, not household data. They document the visual foundation and are not fresh screenshots of the current tree:

| Home                                    | Kitchen                                         | Device detail                                         |
| --------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| ![Demo home](screenshots/home-demo.png) | ![Kitchen filter](screenshots/kitchen-demo.png) | ![Observed device state](screenshots/device-demo.png) |

The installed Pixel renders the new icons, cards, room filter and device detail through the existing development client. Chrome checks cover demo startup, room filtering with global attention, stable-key detail navigation, favorite persistence, URL validation and entity settings. Widths of 320, 430 and 768 CSS pixels are checked for page overflow and device-card bounds. Native component tests cover filtering, alert expansion/priority, hidden entities, disconnected attention, deleted room selections and profile changes. This does not establish iOS or screen-reader usability; those need their own runtime checks.

## Delivery boundaries

Use [the current delivery order](../README.md#delivery-order) and [ticket contracts](../BACKLOG.md); this guide does not maintain a competing roadmap.

- **Delivered:** native visual foundation, F01 2D floor/room navigation, approximate furniture, P01/P02 profile-owned plans/reset, P03 explicit HA-area links and P04 place/save/reposition/remove with named markers and an accessible list. Markers use existing shared conditions and cached qualifiers; their positions are user configuration.
- **Delivered U04:** declared HA battery/problem/connectivity polarity, shared explanations and qualified coverage. **Delivered U03:** consolidates related readings into physical-device summaries. Global attention and individual entity details remain available.
- **S01 accepted:** `SceneLabScreen`, `CockpitSceneView` and the DOM scene pass the same embedded public-fixture proof on Pixel 9 Pro and Seeker: offline assets, async selection, tap versus orbit, startup, ≥30 rendered fps, idle/background/unfocused pause, teardown and context-loss fallback/retry. Camera fitting includes narrow viewports. See [measurements and limits](../stage0/scene-validation.md); fixture markers remain fake and production integration remains S02.
- **Safe actions:** C01–C04 precede live controls. First slice C07a is the Kasa lamp; HA acceptance and observed completion remain separate. Locks, climate, fans and images follow their own verified integration/transport gates.
- **Production spatial view implemented:** S02 reuses P04 placements and the accepted S01 host, with shared selection, readable marker labels, resource diffs and fallback. [Runtime evidence](../stage0/spatial-view-validation.md) records the target-phone scope. Share selection/details with the list and retain 2D/list fallback. Render one floor at a time; do not expand into a geometry editor or decorative animation before acceptance.
- **Daily use:** R03a can deliver an internal standalone read-only build before the entire MVP; HA host availability remains separate. R03b public release has stronger release gates. Advanced editor, tablet, history and per-occupant login remain later candidates.

The reference motivates clear hierarchy, calm surfaces and useful spatial navigation. U03 delivers fewer equivalent entity tiles and readable device summaries; S02 adds the production spatial path, with its hardware acceptance recorded separately. Keep the Maurice portrait secondary; humor must not obscure an error, uncertainty or confirmation. No inferred furniture or approximate layout is presented as measured geometry.

## Long-term structure

Keep geometry, placements and appearance separate from HA entities and session state. A versioned plan uses meters and stable area/placement IDs; placements reference entity keys through the existing identity/alias layer. Persist geometry and preferences, not observed device states or pending commands. A missing entity becomes an unresolved placement until reconciliation.

The renderer receives only the plan, selection, sanitized marker state and session freshness. Credentials, authenticated camera URLs and HA connections stay native. A scene callback requests a room/device selection; native navigation and the command tracker own the resulting behavior. List and plan open the same detail route and share the same room selection, so a 3D failure cannot strand controls or invent a second source of truth.

Render on demand, coalesce bridge updates, and pause work when hidden. Measure frame time, first usable scene and memory on the Pixel before adding detailed furniture, shadows or animation. Virtualize the entity list when the real inventory warrants it. Extend these boundaries instead of moving networking, permissions or device policy into the scene.
