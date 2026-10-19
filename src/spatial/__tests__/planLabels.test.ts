import { layoutPlanLabels, rectanglesOverlap } from "../planLabels";
import { sampleHouse } from "../plans";
import { floorViewBox, planToScreen, screenToPlan } from "../viewport";
import { pointInPolygon } from "../model";

const floor = sampleHouse.floors[1]!;
const position = floor.rooms[0]!.label;

test.each([232, 342, 684])(
  "a center marker keeps its physical anchor and leaves room names readable at %i dp",
  (width) => {
    const size = { width, height: 360 };
    const input = [{ key: "lamp", position: { ...position } }];
    const before = JSON.stringify({ floor, input });
    const layout = layoutPlanLabels(floor, input, size);
    const marker = layout.markers.get("lamp")!;
    const point = planToScreen(position, floorViewBox(floor), size)!;
    expect(marker.point).toEqual(point);
    expect(marker.target.x + marker.target.width / 2).toBe(point.x);
    expect(marker.target.width).toBe(48);
    const room = layout.rooms.find((item) => item.id === floor.rooms[0]!.id)!;
    expect(room).toBeDefined();
    expect(rectanglesOverlap(room.rect, marker.target)).toBe(false);
    if (marker.caption)
      expect(rectanglesOverlap(room.rect, marker.caption)).toBe(false);
    expect(JSON.stringify({ floor, input })).toBe(before);
  },
);

test.each([1, 1.5, 2, 2.5])(
  "larger fonts reserve their actual space or collapse captions without overlaps (%i)",
  (fontScale) => {
    const size = { width: 232, height: 360 };
    const layout = layoutPlanLabels(
      floor,
      [{ key: "lamp", position }],
      size,
      fontScale,
    );
    const marker = layout.markers.get("lamp")!;
    const rectangles = [
      ...layout.rooms.map((room) => room.rect),
      ...[...layout.markers.values()].flatMap((entry) =>
        entry.caption ? [entry.caption] : [],
      ),
    ];
    for (const [index, rect] of rectangles.entries()) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
      expect(rectanglesOverlap(rect, marker.target)).toBe(false);
      for (const other of rectangles.slice(index + 1))
        expect(rectanglesOverlap(rect, other)).toBe(false);
    }
    expect(marker.point).toEqual(
      planToScreen(position, floorViewBox(floor), size),
    );
  },
);

test("crowded device labels collapse while every stable marker remains selectable", () => {
  const input = Array.from({ length: 20 }, (_, index) => ({
    key: `lamp-${index}`,
    position,
  }));
  const layout = layoutPlanLabels(floor, input, { width: 232, height: 360 });
  expect(layout.markers.size).toBe(20);
  expect(
    [...layout.markers.values()].filter((entry) => entry.caption).length,
  ).toBeLessThan(20);
  expect(
    new Set(
      [...layout.markers.values()].map((entry) => JSON.stringify(entry.target)),
    ).size,
  ).toBe(1);
});

test("unmeasured views have no label positions and resizing only changes screen coordinates", () => {
  expect(
    layoutPlanLabels(floor, [{ key: "lamp", position }], {
      width: 0,
      height: 360,
    }).markers.size,
  ).toBe(0);
  const small = layoutPlanLabels(floor, [{ key: "lamp", position }], {
    width: 232,
    height: 360,
  });
  const large = layoutPlanLabels(floor, [{ key: "lamp", position }], {
    width: 684,
    height: 360,
  });
  expect(small.markers.get("lamp")!.point).not.toEqual(
    large.markers.get("lamp")!.point,
  );
});

test("a room label never spans the empty notch of a concave room", () => {
  const polygon = [
    { x: 0, z: 0 },
    { x: 8, z: 0 },
    { x: 8, z: 6 },
    { x: 5, z: 6 },
    { x: 5, z: 2 },
    { x: 3, z: 2 },
    { x: 3, z: 6 },
    { x: 0, z: 6 },
  ];
  const concave = {
    ...floor,
    outline: polygon,
    rooms: [{ ...floor.rooms[0]!, polygon, label: { x: 1.5, z: 3 } }],
  };
  const size = { width: 684, height: 360 };
  const layout = layoutPlanLabels(concave, [], size);
  expect(layout.rooms).toHaveLength(1);
  const rect = layout.rooms[0]!.rect;
  for (let x = 0; x <= 10; x++)
    for (let y = 0; y <= 10; y++) {
      const point = screenToPlan(
        {
          x: rect.x + (rect.width * x) / 10,
          y: rect.y + (rect.height * y) / 10,
        },
        floorViewBox(concave),
        size,
      )!;
      expect(pointInPolygon(point, polygon)).toBe(true);
    }
});
