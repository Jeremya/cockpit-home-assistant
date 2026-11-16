import type { PlanFloor, PlanLine, RoomKind } from "../model";
import { sampleHouse } from "../plans";
import {
  captionAlignment,
  contrastRatio,
  litPeak,
  mix,
  planFrameAspect,
  planFrameHeight,
  planFrames,
  planGridPath,
  planPalette,
  planStageExtent,
  planStrokes,
  roomFill,
  roomTones,
  unitsPerPixel,
  wallJoints,
  type RoomTone,
} from "../planStyle";
import { floorViewBox } from "../viewport";

const kinds: RoomKind[] = [
  "living",
  "kitchen",
  "bedroom",
  "bathroom",
  "storage",
  "circulation",
];
const tones: RoomTone[] = ["rest", "lit", "receded"];
const floor = sampleHouse.floors[0]!;
const box = floorViewBox(floor); // 8 m x 6 m: 348 x 268 drawing units
const rectangle = (width: number, depth: number): PlanFloor => ({
  ...floor,
  outline: [
    { x: 0, z: 0 },
    { x: width, z: 0 },
    { x: width, z: depth },
    { x: 0, z: depth },
  ],
});
/** Every surface a line or a name can end up on. */
const surfaces = [
  planPalette.stage,
  planPalette.plate,
  ...kinds.flatMap((kind) => [
    ...tones.map((tone) => roomFill(kind, tone)),
    litPeak(kind),
  ]),
];

test("rooms form one tonal family: neighbours differ by a step, never a swatch", () => {
  const fills = kinds.map((kind) => roomFill(kind));
  expect(new Set(fills).size).toBe(kinds.length);
  for (const a of fills)
    for (const b of fills) expect(contrastRatio(a, b)).toBeLessThan(1.3);
});

test("walls keep 3:1 on the stage and on every room, lit pool included", () => {
  for (const surface of surfaces)
    expect(
      contrastRatio(planPalette.wall.color, surface),
    ).toBeGreaterThanOrEqual(3);
});

test("the selection outline keeps 3:1 against the room it frames and its neighbours", () => {
  for (const kind of kinds)
    for (const tone of tones)
      expect(
        contrastRatio(planPalette.selection.color, roomFill(kind, tone)),
      ).toBeGreaterThanOrEqual(3);
  expect(
    contrastRatio(planPalette.selection.color, planPalette.stage),
  ).toBeGreaterThanOrEqual(3);
});

test("room names keep 4.5:1 whatever their backing covers", () => {
  const behind = [
    ...surfaces,
    planPalette.wall.color,
    planPalette.selection.color,
  ];
  for (const tone of tones) {
    const { text, backing } = planPalette.label[tone];
    for (const under of behind)
      expect(
        contrastRatio(text, mix(under, backing.color, backing.opacity)),
      ).toBeGreaterThanOrEqual(4.5);
  }
});

test("a selected room is lit and the others step back by luminance, not hue", () => {
  for (const selected of kinds)
    for (const other of kinds) {
      expect(
        contrastRatio(roomFill(selected, "lit"), roomFill(other, "receded")),
      ).toBeGreaterThanOrEqual(1.7);
      expect(
        contrastRatio(litPeak(selected), roomFill(other, "receded")),
      ).toBeGreaterThanOrEqual(3);
    }
});

test("only a room on the shown floor can be lit", () => {
  const [first, second] = floor.rooms;
  expect([...roomTones(floor.rooms, first!.id)]).toEqual([
    [first!.id, "lit"],
    [second!.id, "receded"],
  ]);
  for (const selection of [null, sampleHouse.floors[1]!.rooms[0]!.id])
    expect([...roomTones(floor.rooms, selection).values()]).toEqual([
      "rest",
      "rest",
    ]);
});

test.each([
  ["320 dp phone", { width: 256, height: 197 }],
  ["390 dp phone", { width: 326, height: 251 }],
  ["768 dp tablet", { width: 704, height: 520 }],
  ["1440 dp desktop", { width: 1128, height: 490 }],
])(
  "the shell outweighs partitions and details stay hairlines on a %s",
  (_, size) => {
    const pixels = 1 / unitsPerPixel(box, size);
    for (const density of ["regular", "compact"] as const) {
      const strokes = planStrokes(density, box, size);
      expect(strokes.shell / strokes.partition).toBeGreaterThanOrEqual(1.7);
      expect(strokes.partition).toBeGreaterThan(strokes.hairline);
      expect(strokes.select).toBeGreaterThanOrEqual(strokes.shell);
      expect(strokes.hairline * pixels).toBeCloseTo(
        density === "regular" ? 1 : 0.75,
      );
      expect(strokes.shell * pixels).toBeGreaterThanOrEqual(2);
      expect(strokes.shell * pixels).toBeLessThanOrEqual(4.5);
    }
  },
);

test("structure thickens with a larger drawing, within bounds, and compact is lighter", () => {
  const screenWeight = (size: { width: number; height: number }) =>
    planStrokes("regular", box, size).shell / unitsPerPixel(box, size);
  const phone = { width: 326, height: 251 };
  const desktop = { width: 1128, height: 490 };
  const wall = { width: 4000, height: 3000 };
  expect(screenWeight(desktop)).toBeGreaterThan(screenWeight(phone));
  expect(screenWeight(wall)).toBeCloseTo(4.5);
  expect(planStrokes("compact", box, phone).shell).toBeLessThan(
    planStrokes("regular", box, phone).shell,
  );
  // Before layout there is no scale yet: weights are used as drawing units.
  expect(planStrokes("regular", box, { width: 0, height: 0 }).hairline).toBe(1);
});

test("the stage takes the floor's shape, so the drawing fills it without bands", () => {
  const limits = planFrames.screen(844);
  for (const width of [256, 326, 366]) {
    const height = planFrameHeight(box, width, limits)!;
    expect(height).toBeCloseTo((width * box.height) / box.width);
    expect(planStageExtent(box, { width, height })).toEqual({
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
    });
  }
});

test("a tall floor is capped and a flat one keeps a usable stage", () => {
  const limits = planFrames.screen(844);
  const tall = floorViewBox(rectangle(5, 14));
  const flat = floorViewBox(rectangle(20, 3));
  expect(planFrameHeight(tall, 326, limits)).toBe(limits.maxHeight);
  expect(planFrameHeight(flat, 326, limits)).toBe(limits.minHeight);
  // The stage then shows more than the drawing; nothing is cropped.
  const extent = planStageExtent(tall, {
    width: 326,
    height: limits.maxHeight,
  });
  expect(extent.width).toBeGreaterThan(tall.width);
  expect(extent.x).toBeCloseTo((tall.width - extent.width) / 2);
  expect(extent.height).toBeCloseTo(tall.height);
});

test("the Home preview stays landscape while a wide floor still fills it", () => {
  const preview = planFrames.preview(844);
  expect(planFrameHeight(box, 358, preview)).toBeCloseTo(358 * 0.64);
  expect(
    planFrameHeight(floorViewBox(rectangle(5, 14)), 358, preview),
  ).toBeCloseTo(358 * 0.64);
  const wide = floorViewBox(rectangle(16, 6));
  expect(planFrameHeight(wide, 358, preview)).toBeCloseTo(
    (358 * wide.height) / wide.width,
  );
  expect(planFrameHeight(box, 720, preview)).toBe(preview.maxHeight);
});

test("an unmeasured stage declares the same shape it will be given", () => {
  for (const limits of [planFrames.editor, planFrames.preview(844)]) {
    for (const width of [0, -1, Number.NaN])
      expect(planFrameHeight(box, width, limits)).toBeNull();
    // Unclamped widths: the declared ratio and the computed height agree.
    expect(planFrameHeight(box, 330, limits)).toBeCloseTo(
      330 / planFrameAspect(box, limits),
    );
  }
});

test("screen limits follow the window without leaving their bounds", () => {
  expect(planFrames.screen(480).maxHeight).toBe(288);
  expect(planFrames.screen(200).maxHeight).toBe(260);
  expect(planFrames.screen(2000).maxHeight).toBe(520);
  expect(planFrames.desktop(900).maxHeight).toBe(490);
  expect(planFrames.desktop(500).maxHeight).toBe(360);
  expect(planFrames.desktop(2000).maxHeight).toBe(640);
  // The Home hero leaves the pulse on screen, even on a phone held sideways.
  expect(planFrames.preview(844).maxHeight).toBe(287);
  expect(planFrames.preview(390).maxHeight).toBe(160);
  expect(planFrames.preview(1366).maxHeight).toBe(320);
});

const verticals = (path: string) =>
  [...path.matchAll(/M(-?[\d.]+) -?[\d.]+V/g)].map((match) => Number(match[1]));
const horizontals = (path: string) =>
  [...path.matchAll(/M-?[\d.]+ (-?[\d.]+)H/g)].map((match) => Number(match[1]));

test("the drafting grid sits on whole metres and covers a letterboxed stage", () => {
  const size = { width: 1128, height: 490 };
  const extent = planStageExtent(box, size);
  const path = planGridPath(box, size);
  const columns = verticals(path);
  const rows = horizontals(path);
  // Whole metres land on padding + n * unit, where the sample's walls are.
  for (const value of [...columns, ...rows])
    expect((value - box.padding) / box.unit).toBeCloseTo(
      Math.round((value - box.padding) / box.unit),
    );
  expect(columns).toContain(box.padding + 4 * box.unit);
  expect(Math.min(...columns)).toBeLessThan(extent.x + box.unit);
  expect(Math.max(...columns)).toBeGreaterThan(
    extent.x + extent.width - box.unit,
  );
  expect(Math.min(...columns)).toBeGreaterThanOrEqual(extent.x);
  expect(rows).toHaveLength(7); // z = 0..6 m; the 14-unit margin holds no other
});

test("an unmeasured stage draws the grid of the drawing alone", () => {
  const path = planGridPath(box, { width: 0, height: 0 });
  expect(verticals(path)).toHaveLength(9);
  expect(horizontals(path)).toHaveLength(7);
});

test("the grid widens on a crowded stage and disappears before it turns to noise", () => {
  const metres = (path: string, unit: number, padding: number) =>
    verticals(path).map((value) => (value - padding) / unit);
  const estate = floorViewBox(rectangle(60, 40));
  const sparse = planGridPath(estate, { width: 300, height: 200 });
  expect(metres(sparse, estate.unit, estate.padding)).toEqual(
    expect.arrayContaining([0, 5, 10, 60]),
  );
  expect(metres(sparse, estate.unit, estate.padding)).not.toContain(1);
  const campus = floorViewBox(rectangle(400, 300));
  expect(planGridPath(campus, { width: 300, height: 225 })).toBe("");
});

test("only walls that meet get a joint: an opening keeps its free ends", () => {
  // The sample partition is two segments either side of a doorway.
  expect(floor.lines.filter((line) => line.kind === "wall")).toHaveLength(2);
  expect(wallJoints(floor.lines)).toEqual([]);
  const corner: PlanLine[] = [
    { kind: "wall", from: { x: 1, z: 1 }, to: { x: 3, z: 1 } },
    { kind: "wall", from: { x: 3, z: 1 }, to: { x: 3, z: 4 } },
    { kind: "window", from: { x: 3, z: 4 }, to: { x: 3, z: 5 } },
    { kind: "step", from: { x: 1, z: 1 }, to: { x: 1, z: 2 } },
    // A degenerate wall touches one point twice; it is not a corner.
    { kind: "wall", from: { x: 7, z: 7 }, to: { x: 7, z: 7 } },
  ];
  expect(wallJoints(corner)).toEqual([{ x: 3, z: 1 }]);
});

test("a caption beside its marker stays against it; above or below it is centred", () => {
  expect(captionAlignment({ x: 132, width: 132 }, 100)).toBe("flex-start");
  expect(captionAlignment({ x: 0, width: 68 }, 100)).toBe("flex-end");
  expect(captionAlignment({ x: 34, width: 132 }, 100)).toBe("center");
});
