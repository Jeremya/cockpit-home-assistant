# 3D asset system — premium architectural miniature

- **Status:** design recorded 2026-10-28; **P0 (artistic foundation) and P1 (furniture pipeline)
  implemented in the working tree**.
- **Owner decision:** the product owner asked for the premium 3D direction and approved P0/P1
  implementation ("update the 3d assets file and start implementing it", then "implement P1").
- **Scope guard:** the existing Three.js/Expo DOM renderer, on-demand frame loop, lifecycle,
  `SceneFloor` bridge and P04 placements are preserved. No new renderer, observation store,
  preference schema or HA connection is introduced.
- **Not delivered by this document:** a furniture placement UI, door openings, a new camera mode,
  a standalone 3D-enabled artifact, GPU/performance acceptance, or Pixel acceptance. See
  [roadmap](#9-roadmap).

## Evidence classes

| Class | Meaning |
| --- | --- |
| `[CODE]` | Verified by reading the current source at `ae89d81` + dirty tree |
| `[AUTOMATED]` | Verified by a passing local command on this revision |
| `[VISUAL]` | Verified by viewing a real rendered capture, not a mockup |
| `[LICENSE]` | Verified on the publisher's own page or licence file |
| `[INFERRED]` | Reasoned, not directly observed |
| `[UNVERIFIED]` | Could not be checked; must be re-checked before use |

## 1. Verified renderer constraints

| Property | Value | Class |
| --- | --- | --- |
| Three.js | `0.186.1` | `[CODE]` |
| Renderer | Three.js in an Expo DOM component (`"use dom"`) | `[CODE]` |
| Frame model | On demand; hidden/background/unfocused frames must stay `0` | `[CODE]` |
| Geometry | Procedural walls/floors + 23 Kenney GLB furniture models (P1) | `[CODE]` |
| Asset loading | `GLTFLoader` for static GLBs; procedural floor canvas textures; no `expo-asset`/`expo-gl` | `[CODE]` |
| Bridge | `toSceneFloor()` emits JSON-safe geometry; markers are allowlisted and sanitized | `[CODE]` |
| Furniture schema | `PlanFurniture` exists with an optional `variant`; `SceneFloor.furniture` carries allowlisted fields; sample floor 1 has 17 records | `[CODE]` |
| Wall schema | `PlanLine.kind = "wall" \| "step" \| "window"` — **no door kind** | `[CODE]` |
| Trial gate | `buildFeatures.spatial3d = !buildInfo.trial` | `[CODE]` |
| Native performance | S02 Seeker proof recorded 118.2 rendered fps; not re-measured for this change | `[CODE]` (historical) |

Maurice already had a furniture schema. P1 added one optional field (`variant`) so a footprint can
select a specific model without name heuristics, then bridged the records and rendered them. Older
plans without a variant stay valid and fall back by `kind`.

## 2. Asset source comparison

| Source | Licence | Class | Models? | Fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | CC0 1.0; archive `License.txt` confirms CC0 | `[LICENSE]` | 140 GLB + FBX/OBJ/Blender; 23 GLBs imported | Warm, clean, architectural low-poly | **Primary furniture collection** |
| [Quaternius](https://quaternius.com) | CC0 stated on site | `[LICENSE]` | glTF/GLB/FBX | More stylised/fantasy | Secondary |
| [Poly Haven](https://polyhaven.com) | CC0 | `[LICENSE]` | HDRIs, PBR textures, few glTF | Photoreal — wrong register for walls | **Textures/HDRIs only** |
| [ambientCG](https://ambientcg.com) | CC0 | `[LICENSE]` | PBR textures | Photoreal | Wood/stone texture reference |
| [Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | Per-model, often CC BY 4.0 | `[LICENSE]` | GLB | Conformance fixtures, not furniture | Reference only |
| Poly Pizza | Per-model, mixed | `[UNVERIFIED]` — licence pages could not be confirmed | glTF | Mixed styles | **Do not rely on it** |

P1 downloaded the 4.9 MB archive and inventoried it `[AUTOMATED]`/`[LICENSE]`: 140 GLB files,
`License.txt` states "Creative Commons Zero, CC0", and the 23 imported files total 496 KB and
6,354 triangles (largest: `showerRound` at 960). The files are committed under
`assets/furniture/` with `KENNEY-LICENSE.txt`; no texture images are referenced by these GLBs.

## 3. Catalog (P1, verified)

All 23 files are from the Kenney Furniture Kit, CC0 1.0, committed under `assets/furniture/`.
Heights are normalization targets, not measurements; triangles are the asset's own count.

| Variant | File | Tris | Target height |
| --- | --- | --- | --- |
| sofa | `loungeSofa.glb` | 128 | 0.85 m |
| armchair | `loungeChair.glb` | 128 | 0.80 m |
| coffeeTable | `tableCoffee.glb` | 124 | 0.42 m |
| diningTable | `table.glb` | 120 | 0.75 m |
| chair | `chair.glb` | 170 | 0.90 m |
| desk | `desk.glb` | 198 | 0.75 m |
| deskChair | `chairDesk.glb` | 588 | 0.90 m |
| tvStand | `cabinetTelevisionDoors.glb` | 210 | 0.50 m |
| floorLamp | `lampRoundFloor.glb` | 76 | 1.55 m |
| plant | `pottedPlant.glb` | 60 | 0.90 m |
| rug | `rugRectangle.glb` | 28 | flat |
| rugRound | `rugRound.glb` | 188 | flat |
| counter | `kitchenCabinet.glb` | 114 | 0.90 m (tiled) |
| stove | `kitchenStove.glb` | 830 | 0.90 m |
| sink | `kitchenSink.glb` | 318 | 0.90 m |
| fridge | `kitchenFridge.glb` | 250 | 1.80 m |
| bed | `bedDouble.glb` | 264 | 0.55 m |
| nightstand | `sideTableDrawers.glb` | 238 | 0.55 m |
| wardrobe | `bookcaseClosedDoors.glb` | 296 | 1.90 m |
| bathroomSink | `bathroomSinkSquare.glb` | 234 | 0.85 m |
| toilet | `toilet.glb` | 230 | 0.75 m |
| bathtub | `bathtub.glb` | 602 | 0.55 m |
| shower | `showerRound.glb` | 960 | 2.00 m |

**Doors and windows are not taken from Kenney.** Maurice's `PlanLine` has no door kind, so a
door-opening generator has no data to drive it. Windows exist only as whole glazed lines. Stairs
are `PlanLine.kind === "step"`, which the 3D renderer skips. All three are schema questions, not
asset questions.

## 4. Artistic direction — "warm architectural miniature on a dark stage"

The direction is fixed by the current implementation (`src/web/sceneStyle.ts`):

| Token | Value | Use |
| --- | --- | --- |
| Stage | `#0a0e1a` | Canvas background |
| Plinth | `#141927` | Presentation base |
| Wall body | `#e7e3db` | Off-white architecture |
| Wall cap | `#262b3a` | Dark architectural top line |
| Window frame | `#2c3142` | Glazing bars/cap |
| Glass | `#9cc0ff` @ 0.22, emissive `#3d5fae` | Window surfaces |
| Oak | `#b98a5e` | Living / circulation floors |
| Walnut | `#7d5a3c` | Bedroom floors |
| Stone | `#cfcac2` | Kitchen / bathroom / storage floors |
| Selected floor | `#3f6694` | Room-selection tint |
| Marker colours | `src/theme.ts` + `core/appearance.ts` | Shared U04 semantics, unchanged |

Rules:

- One scale: 1 unit = 1 metre; each GLB is centred on its plan point and its
  bounding-box floor is placed on the finished floor.
- Re-material imported GLBs at load so the palette is Maurice's, not the vendor's
  (wood, fabric, metal, lamp, plant, glass; rugs are remapped so textiles never read as wood).
- No outlines, no toon shading, no bloom, no post-processing.
- Marker colours never encode a second, renderer-local health palette.

## 5. Design system

### Architecture

- Envelope walls are derived from `PlanFloor.outline`; partitions from `PlanLine`.
- Exterior thickness `0.20 m`, interior `0.10 m`, glazing `0.05 m`.
- Exterior wall body `1.8 m`, interior partitions `0.9 m`, camera-facing curb `0.14 m`.
  These are **rendering previews**, not story heights or measurements.
- Each wall is a rounded body plus a separate `0.03 m` dark cap. (`RoundedBoxGeometry` inherits
  BoxGeometry's indexed material groups, so a six-material array is unsafe on it; separate meshes
  avoid material-index corruption.)
- The cutaway direction is fixed per camera mode: model view uses `MODEL_YAW`, orbit view uses its
  default world +Z view. It does not follow every orbit step.
- Plinth: rounded box, height `0.30 m`, overhang `0.70 m`, receives shadow.
- Floor tiles: deterministic 256² canvas textures (oak/walnut planks, stone speckle), repeated every
  `2.4 m`; no external texture request. Room UVs share plan space, so flooring is continuous across
  a room boundary.

### Lighting and shadows

- `ACESFilmicToneMapping`, exposure `1.05`.
- Key: warm `#fff2e0`, intensity `2.4`, direction `(0.7, 1, 0.28)`, `castShadow`, `2048²` PCF shadow
  map, `bias -0.0006`, `normalBias 0.03`.
- Fill: `HemisphereLight` sky `#dfe7ff` / ground `#2a2521`, intensity `0.6`.
- `shadowMap.autoUpdate = false`; the map is redrawn once per floor build. This preserves the
  zero-idle-frame contract. Marker updates never refresh it because markers do not cast shadows.
- Interior walls shadow the floor away from the camera; with no furniture yet, those shadows are
  largely hidden behind the walls themselves. Furniture (P1) is what makes shadows legible.

### Camera

- Model camera keeps `FOV 26`; elevation `48° → 38°`; margin `0.10 + 20 px → 0.05` with no pixel term;
  yaw `35°` and `±40°` range unchanged.
- Room focus keeps the existing 220 ms eased transition; reduced motion applies the pose directly.
- Orbit framing includes the plinth and wall height; the floor outline must stay inside the canvas
  at every checked width (`[AUTOMATED]` in `check:spatial-ui`).

### Interaction

- Furniture and architecture are decorative and non-interactive; picking stays marker/room only.
- Selection tints the room material; the U04 marker palette is untouched.
- Empty-canvas tap still resets the camera to overview in model mode.

### Performance budgets

- ≤ 60 k triangles per floor; ~20 furniture objects × 2 k triangles fits.
- ≤ 512² per material family, 6 families; current scene uses 3 floor tiles at 256².
- One static shadow map per built floor; idle frames remain `0`.
- Load furniture only for the active floor; cache by URL; dispose on rebuild with the existing
  `disposeGroup()` path.

## 6. Integration strategy (implemented)

```
PlanFurniture (variant?)  →  SceneFloor.furniture  →  addFurniture()
   center/width/depth/rotation/kind/variant     (allowlisted bridge)     (GLB or fallback box)
```

- Furniture stays decoration: it never inherits `EntityRecord` state, room identity or a command.
- `PlanFurniture.variant` is optional and allowlisted. Older plans omit it and the scene falls back
  by `kind` (`seating → sofa`, `table → diningTable`, `fixture → bathroomSink`, etc.).
- `center` (metres) and `rotation` (degrees) need no conversion layer; world yaw equals the plan
  rotation.
- Models are normalized by their own runtime bounding box: centred in X/Z, floor at y=0, uniform
  scale to the catalog height. Flat rugs stretch to the plan footprint instead. A `counter` repeats
  its module along the plan width (bounded to 12).
- Each item starts as a fallback volume and is replaced by the GLB when it loads. A failed load or a
  missing asset leaves the volume in place, so the scene degrades instead of breaking.
- Cached GLTFs never enter the scene graph: each instance clones its geometry and replaces
  materials, so `disposeGroup()` cannot invalidate the cache. `GLTFLoader` results are cached per
  URL; failures are evicted for retry.
- Personal geometry never enters Git or public bundles; only `src/spatial/sample-plan.json` ships.
  The sample floor-1 furniture is public sample data.

## 7. Implemented — P0 and P1 (2026-10-28)

### P0 — artistic foundation

| Change | File |
| --- | --- |
| Scene palette, floor mapping, rendering heights, cutaway facing | `src/web/sceneStyle.ts` (new) |
| Pure outline/partition wall planner + cutaway classification | `src/web/sceneWalls.ts` (new) |
| ACES, static PCF shadows, key/fill rig, carpet/stone textures, plinth, caps, plinth-aware framing | `src/web/CockpitScene.tsx` |
| Camera elevation/margin reframe | `src/web/modelCamera.ts` |
| Exterior wall height source | `src/components/CockpitSceneView.tsx` |
| Wall planner tests | `src/web/__tests__/sceneWalls.test.ts` (new) |
| Proportional-margin regression | `src/web/__tests__/modelCamera.test.ts` |

Acceptance evidence (current tree, P0 + P1):

- `[AUTOMATED]` `npm test` → **1005 tests / 75 suites pass**.
- `[AUTOMATED]` `npm run check:spatial-ui` → `result: "passed"` (all reported sections), one live renderer
  across Home → House → Home, zero unexpected console events, sample plan unchanged.
- `[VISUAL]` `artifacts/spatial-ui/home-3d-1440.png`: walled room, dark caps, warm oak/stone floors,
  dark plinth, camera-facing cutaway, GLB furniture.
- `[AUTOMATED]` TypeScript, ESLint and Prettier pass on the changed files.

### P1 — furniture pipeline

| Change | File |
| --- | --- |
| Optional `variant` on `PlanFurniture` + allowlist validation/copy | `src/spatial/model.ts` |
| `SceneFurniture` bridge field with kind/variant/rotation defaults | `src/web/sceneModel.ts` |
| 23-variant catalog (height, flat, tile) + tallest-for-framing | `src/web/furnitureCatalog.ts` (new) |
| Scale/counter/flat helpers | `src/web/furnitureModel.ts` (new) |
| Static asset map (exhaustive by type) | `src/web/furnitureAssets.ts` (new) |
| GLB load/cache, material override, per-instance clones, tiled counters, fallbacks | `src/web/furnitureScene.ts` (new) |
| Furniture group in the scene + framing height | `src/web/CockpitScene.tsx` |
| 23 Kenney GLBs + CC0 licence | `assets/furniture/` (new) |
| `.glb` Metro asset extension | `metro.config.js` (new), `src/types/assets.d.ts` (new) |
| 17 sample furniture records, sample revision 2 | `src/spatial/sample-plan.json` |
| Variant/bridge/scale/catalog tests | `src/spatial/__tests__/model.test.ts`, `src/web/__tests__/sceneModel.test.ts`, `src/web/__tests__/furnitureModel.test.ts` |

Evidence:

- `[AUTOMATED]` **1005 tests / 75 suites** pass, including older-plan kind fallback, variant
  rejection, allowlisted bridge fields, normalization/counter bounds and catalog exhaustiveness.
- `[AUTOMATED]` `npm run check:spatial-ui` passes with the furnished sample; the 1440 px capture
  shows the sofa, rug, coffee table, TV stand, lamp, plants, dining table/chairs and kitchen units.
- `[AUTOMATED]` `npx expo export --platform web` emits 23 GLBs under
  `assets/assets/furniture/<name>.<hash>.glb`; the browser loads them.
- `[AUTOMATED]` a release APK built with `./gradlew :app:assembleRelease` contains all 23 GLBs at
  `assets/www.bundle/assets/assets/furniture/<name>.<md5>.glb`; the Gradle `export:embed` path
  matches the DOM bundle references.
- `[VISUAL]` a local, private release APK was installed on the Seeker over the dev client, Metro was stopped and
  `adb reverse` removed, and the app rendered the furnished sample in 3D. The APK is debug-signed,
  43 MB, SHA-256 `731dd0cf2dbf082ce618b70ff226eb03f42618b304c3facfcca0af990c83c92c`.
- `[AUTOMATED]` `expo export --platform android` still writes a JS/OTA artifact whose DOM bundle
  references `<hash>.glb` without copying them; this is a tooling residual (OQ-09), not the APK path.

**Maturity (P0 + P1):** Implemented + Automated; **Built, Installed and Observed** on the Seeker
(release APK, offline furniture). Not a named trial/production candidate, not GPU- or
Pixel-accepted; the internal-trial channel still disables 3D (`buildFeatures.spatial3d`).

## 8. Proof of concept (delivered by the sample)

The public sample floor 1 now carries 17 furniture records and renders through the production
renderer — no second application:

| Element | Source |
| --- | --- |
| Room shell | Sample floor 1 (`sample-plan.json` only) |
| Walls + cutaway | P0 envelope builder |
| Oak/stone floors | P0 procedural textures |
| Living room | sofa, armchair, coffee table, rug, TV stand, floor lamp, plant |
| Kitchen | counter run, sink, stove, fridge, dining table, four chairs, plant |
| Plinth, lighting, shadows | P0 |

The sample revision moved to `2` so a previously seeded demo profile is told a newer default is
available instead of silently keeping the old plan. `check:spatial-ui` captures the furnished
sample at 1440 and the fallback snapshot; both remain public-sample only.

## 9. Roadmap

### P1 — Furniture pipeline (shipped)

Implemented 2026-10-28; the change list and evidence are in
[P0/P1 above](#7-implemented--p0-and-p1-2026-10-28). The standalone APK path is verified; the next
step is a named 3D-enabled candidate and target-phone acceptance, not another asset-pipeline fix.

### P2 — Premium details

Interior light spill on window planes · room-selection emissive accent instead of a flat tint ·
label scale/distance behaviour · per-floor lazy loading + LOD · screenshot-diff CI gate ·
furniture-quality device markers.

### Not scheduled

Entity-driven furniture (e.g. a lamp entity becoming a floor lamp) needs its own decision: it
would couple decoration to device identity and is not part of this pipeline.

## 10. Open risks

1. **`expo export` artifacts omit DOM GLBs (tooling residual).** The APK path (`export:embed`)
   embeds them, and a release APK rendered furniture offline on the Seeker. The `expo export`
   JS/OTA artifact still references `<hash>.glb` without copying them; fix only if OTA is adopted
   ([OQ-09](../architecture/open-questions.md)).
2. **The release proof is not a candidate.** The test APK is debug-signed and built from a dirty
   tree; M04 still needs a named, 3D-enabled candidate and target-phone acceptance.
3. **Shadow-map cost** (2048²) has not been measured on the Seeker/Pixel. If the budget is exceeded,
   lower the map size before removing shadows.
4. **No door schema.** A door opening needs an explicit model decision; do not infer doors from gaps.
5. **Furniture geometry is approximate.** The kit's proportions are game-like; heights are
   normalized targets and the plan footprint remains the 2D orientation source. Do not treat either
   as a measurement.
6. **The Kenney sample sheet was viewed earlier; the committed files were verified by inventory.**
   CC0 is confirmed by the archive's own `License.txt`.

## 11. Final recommendation

**One project: [House Control](https://github.com/0xProbabillity/house-control) (MIT `[LICENSE]`).**
Maurice needs exactly its seven techniques — cutaway walls, dark caps, real openings, rounded
plinth, ACES, shadow-render-once and `RoundedBoxGeometry` — not its editor or app architecture.

**One collection: [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) (CC0 1.0).**
It matches the brief's visual language, and CC0 removes attribution/commercial friction. Poly Haven
and ambientCG remain texture sources; Poly Pizza is not relied on because its licensing could not be
verified.

The blunt summary: the largest perceived improvement came from scene configuration and
presentation, not from assets. The assets completed the miniature; they did not rescue it.

## 12. P2 — premium details, 2026-11-16

Branch `work/scene-3d-polish`, based on `c6872f5`. Presentation only, inside `src/web/**` and
`src/components/CockpitSceneView.tsx`. The bridge (`SceneFloor`, sanitized markers, callbacks), the
marker diff, picking, the readiness watchdog, retry, the 2D fallback, the plan schema and the
preferences are unchanged. Nothing is persisted and no dependency or binary asset is added.

From the [§9 P2 list](#p2--premium-details): **delivered** — interior light spill on window planes,
room-selection emissive accent, label scale/distance behaviour, furniture-quality device markers.
**Not delivered** — per-floor lazy loading + LOD, screenshot-diff CI gate.

### Values changed against earlier sections

Every value below is a rendering preview, never a measurement (ADR-17). The first row changes a
value the owner approved in §5; the integrator records it, this document does not edit the register.

| Value | Before | Now | Where |
| --- | --- | --- | --- |
| **Model-camera margin (§5 Camera)** | proportional `0.05` per side around the bounding box, fitted symmetrically about the box centre | `MODEL_FILL = 0.8`: the drawn silhouette spans 80 % of the limiting canvas dimension, centred exactly (10 % per side, still no pixel term) | `modelCamera.ts` |
| Model FOV / elevation / yaw / yaw range / zoom range | `26°` / `38°` / `35°` / `±40°` / `1–1.25` | unchanged | `modelCamera.ts` |
| Orbit (compact) opening pose — not listed in §5 | FOV `45°`; box fit with `64 px`/`110 px` margins and `× 1.12` | FOV `30°`; same exact fit and `0.8` fill as the model view; elevation `atan(0.85 / 0.75) ≈ 48.6°` and yaw `0` unchanged; far plane `500 → 1000` | `CockpitScene.tsx` |
| Room selection (§4 `Selected floor #3f6694`, §5 "Selection tints the room material") | flat tint multiplying the floor texture | token removed; accent described below | `sceneStyle.ts` |
| Marker head height | `0.9 m` | `1.05 m` (`MARKER_HEIGHT`) | `markerStyle.ts` |
| Shadow penumbra | PCF radius `1` | PCF radius `2.4`; same `2048²` map, same samples | `CockpitScene.tsx` |
| Label layout (§5 "label layout unchanged") | fixed `128 × 32` slab, above/below only, key order | fitted names, slots around the head, most-constrained first | `labelLayout.ts` |

Why the margin moved: the old fit kept the box symmetric about its centre, so perspective left the
picture off-centre and the model, read off the 1440 capture, at roughly three quarters of the panel
height instead of the nominal 90 %. The orbit view was fitted separately with pixel margins and, on
the phone, showed the floor outline over only half of the canvas width. The new fit solves the
centring and the distance exactly
(`fitCameraToPoints`), on the points that are actually drawn (`sceneSilhouette`: plinth, each wall
at its rendered height — a camera-facing wall is only its curb — and furniture tops).

### Framing

- One pure fit for both camera modes; `MODEL_FILL = 0.8` of the limiting dimension, re-fitted on
  every resize, rotation, zoom and selection. Labels and markers are not part of the silhouette, so
  an observation never moves the camera.
- Measured on the furnished sample (probe `fit`): limiting share `0.800` at 332 × 200, 324 × 380,
  353 × 260, 742 × 260 and 1130 × 380. Floor-outline width share on the phone Plan screen
  `0.50 → 0.73`, on phone Home `0.45 → 0.68`; in the 1440 Plan panel `0.31 → 0.33`.
- **Limit that is not a camera problem.** The 1440 Plan panel is 1130 × 380 (about 3 : 1) and the
  miniature projects at about 1.34 : 1, so at 80 % of the height it can only cover 36 % of the
  width. Owning that stage needs a taller container, which belongs to the screens, not to the scene.

### Labels

- Device names are dark-glass tags fitted to their text (`12.5 px`, height `24 px`, text capped at
  `132 px` then ellipsised by measurement), drawn at 2× and shown at a constant pixel size at every
  camera distance. Canvases under 360 px on their short side scale names down to no less than `0.84`.
- `layoutMarkerLabels` tries slots around the head, nearest first, clamps a name inside the canvas
  instead of clipping it, never covers a head or another name, and prefers a slot that is nearer to
  its own head than to any other. The name with the fewest good slots left chooses first, so the
  result no longer depends on key order. What does not fit stays with the native list.
- A hairline leader runs from the rim of the head to the nearest point of the name.
- Room names are small paper tags in spaced capitals; they still yield to any marker or device name.

### Keyboard focus

The scene host keeps `tabIndex` in the model view and draws its own ring only for
`:focus-visible`: 2 px in the cockpit accent with a dark inner keyline, following the 16 px corner
radius of the host (`SCENE_CORNER_RADIUS`). A pointer press on the canvas draws nothing.

### Atmosphere

All of it is a static texture or a flat mesh in the normal pass. No post-processing, no second
shadow map, no animation, and therefore nothing that needs a frame while the scene is idle.

| Element | Values | Cost |
| --- | --- | --- |
| Stage backdrop / vignette | radial `#182036 → #0a0e1a (55 %) → #05070e`, ±1 level of fixed noise against banding; stretches with the canvas | 1 call, one `512²` texture without mips |
| Ground pool + contact shadow | pool `#55607e` at `0.5`, radius `2.6 ×` the plinth half-diagonal; plinth contact shadow `0.8` with a wider penumbra away from the key light | 1 call, one `512²` texture |
| Plinth occlusion | blurred shadow of the real floor outline on the plinth top, `0.5` | 1 call, one `≤ 256²` texture |
| Room selection | selected floor keeps its material, gains accent emissive `0.03`; accent line `0.05 m` wide, `0.14 m` inside the walls, with a `0.45 m` wash fading from `0.24`; other rooms dim to `0.62` | 1 call while a room is selected |
| Window daylight | below saved `window` lines only: `1.7 m` patch where the key light shines through, `0.9 m` at `0.45` strength otherwise, additive `#ffe9c4` at `0.36` | 1 call when the floor has a window, one `64²` texture |

Honesty rules that are tested: a wall, a step or a gap between two lines never produces light (the
plan has no door kind and an opening is not inferred from a gap); the selection accent is the
cockpit accent, not a warm "lights on" colour; no light is attached to decorative lamps, because a
glowing lamp next to an "off" marker would be a false statement. **The public sample has no
`window` line**, so daylight is not visible in sample captures.

### Device markers

A marker is a turned-steel pin (one lathe profile: flared base plate into a slim stem) standing on
the finished floor at its plan point, with an enamel head `1.05 m` up. The stem keeps its world
height and is depth-tested, so the pin belongs to the room; the head, like its name, is drawn over
the house so state is never hidden by a wall. Head parts are authored in CSS pixels (head radius
`8 px`, invisible touch target `22 px`) and keep that size at every zoom.

Colour is still `entityTint` (U04), unchanged. `markerStyle` repeats the state as a silhouette:

| Condition | Head | Extra | Emissive | Halo |
| --- | --- | --- | --- | --- |
| `normal` | filled bead | — | `0.22` | — |
| `active` | filled bead | — | `0.9` | `0.5` |
| `attention` | diamond | — | `0.45` | — |
| `alert` | diamond | — | `0.9` | `0.6` |
| `unknown` | hollow ring | — | `0.25` | — |
| `unavailable` | hollow ring | struck through | `0` | — |
| `stale` (cached) | hollow ring | retained dot | `0` | — |

A hollow ring never glows, so an unknown, unavailable or cached reading cannot look live. All seven
silhouettes differ, including when a domain gives several conditions the same tint. A condition
change still updates the existing material and keeps the bead geometry, the label and every other
marker; markers still cast no shadow.

### Performance

Steady frame (no shadow pass), counted at the WebGL draw calls and confirmed by
`renderer.info.render`, headless Chromium (SwiftShader), public sample:

| Scene | Before (`c6872f5`) | After |
| --- | --- | --- |
| Furnished floor 1, 2 markers | 75 calls · 7,872 triangles | 72 calls · 7,914 triangles (74 · 7,918 when both room tags show) |
| Furnished floor 1, 6 markers | 79–83 calls · 9,280–9,288 triangles | 89–90 calls · 9,404–9,406 triangles |
| Unfurnished floor 2, no marker | 17 calls · 3,928 triangles | 10 calls · 3,934 triangles |

The envelope is merged into one mesh per material (bodies, caps, glazing, frames), which pays for
the three atmosphere calls. A marker costs 4 calls (stem, head, leader, name; 5 with a halo, or with
a struck-through or dotted ring) against 2 before, so a floor with many markers draws more than it
did. Budgets of §5 hold: triangles are far below 60 k; texture families are floor tiles, labels,
stage, ground, daylight and halo, none above `512²`; one static `2048²` shadow map, not raised.

### Changed files

| Change | File |
| --- | --- |
| Exact silhouette fit shared by both views; `MODEL_FILL` | `src/web/modelCamera.ts` |
| Drawn-silhouette points per camera mode and room | `src/web/sceneFraming.ts` (new) |
| Slot-based, order-independent label layout; leader geometry | `src/web/labelLayout.ts` |
| Fitted device tags and room tags | `src/web/sceneLabels.ts` (new) |
| Condition → silhouette, marker sizes | `src/web/markerStyle.ts` (new) |
| Pin, head silhouettes, halo, leader, touch target | `src/web/sceneMarkers.ts` |
| Inset polygon, window daylight planner | `src/web/sceneAccents.ts` (new) |
| Backdrop, ground pool, plinth occlusion, daylight, selection line | `src/web/sceneAtmosphere.ts` (new) |
| Tokens and accent values | `src/web/sceneStyle.ts` |
| Wiring, merged envelope, focus ring, probe counters | `src/web/CockpitScene.tsx` |
| Shared corner radius | `src/components/CockpitSceneView.tsx` |

### Evidence and maturity

Recorded in [the validation ledger](../stage0/spatial-view-validation.md#p2-premium-details--2026-11-16).
**Maturity: Implemented + Automated**, with `[VISUAL]` browser captures of the public sample. Not
Built, Installed or Observed: no APK was built, nothing ran on a phone, and GPU cost on the Seeker
or Pixel is not measured. The trial channel still disables 3D.

### Open points for the integrator

1. Record the margin change (row 1 above) under ADR-17.
2. The scene has no "selected marker" input. Showing which device a detail panel belongs to needs
   the host screens to pass its key; the bridge would carry one more allowlisted string.
3. The wide desktop panels are the limit on how much of the stage the miniature can own.
