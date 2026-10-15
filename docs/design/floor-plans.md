# Local floor plans

Home opens a separate **Floor plan** screen with a floor selector, tappable room polygons, printed dimensions where supplied, and a text list of the same spaces. The list also provides larger touch targets and accessible room names. The viewer works independently of HA connectivity and does not imply any device placement or state.

This is the native **2D** foundation. The Three.js feasibility gate remains open. A shared geometry model supports nonrectangular rooms and multiple floors, with one floor shown at a time. No story height or compass direction is assumed.

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

HA areas and entity identities remain separate. No HA areas are created and no entities are assigned from a drawing. The Home summary calls its count **HA rooms** to distinguish real area assignments from spaces on the plan. A later per-profile association will connect plan-room IDs to HA area IDs and stable entity keys; it must retain unresolved placements after registry changes.

## Validation and next steps

The automated tests use only the public sample and generated temporary configurations. They cover concave polygons, bad geometry, duplicate IDs, clean-checkout fallback, sanitized failure and preservation of the previous module, offline screen rendering, floor changes and room selection.

The configured personal plan was checked locally in Chrome at 320, 430 and 768 CSS pixels, including polygon selection, source-dimension display and floor changes with networking disabled after loading. Its screenshots and detailed report remain private. Android was rebuilt with `react-native-svg` 15.15.4; native interaction validation is recorded separately in [Android validation](../stage0/android-validation.md).

Next: refine the traced model with the household, associate actual HA rooms/devices, then use this geometry in the measured Three.js prototype. 2D remains available as the spatial fallback.
