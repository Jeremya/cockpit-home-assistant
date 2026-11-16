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
