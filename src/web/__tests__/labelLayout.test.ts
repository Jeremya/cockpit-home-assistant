import {
  labelLeader,
  layoutMarkerLabels,
  overlaps,
  type LabelPoint,
} from "../labelLayout";

test("neighboring marker names never cover one another or their pins", () => {
  const points = [
    { key: "a", x: 120, y: 200 },
    { key: "b", x: 210, y: 200 },
  ];
  const labels = [...layoutMarkerLabels(points, 360, 380).values()];
  expect(labels.every((label) => label.visible)).toBe(true);
  expect(overlaps(labels[0]!, labels[1]!)).toBe(false);
  for (const label of labels)
    for (const point of points)
      expect(overlaps(label, { ...point, w: 20, h: 20 })).toBe(false);
  expect(layoutMarkerLabels([...points].reverse(), 360, 380)).toEqual(
    layoutMarkerLabels(points, 360, 380),
  );
});
test("edge labels remain inside the canvas; offscreen points cannot pull names into view", () => {
  const result = layoutMarkerLabels(
    [
      { key: "edge", x: 2, y: 5 },
      { key: "offscreen", x: -30, y: 100 },
    ],
    280,
    380,
  );
  const label = result.get("edge")!;
  expect(label.visible).toBe(true);
  expect(label.x - label.w / 2).toBeGreaterThanOrEqual(4);
  expect(label.y - label.h / 2).toBeGreaterThanOrEqual(4);
  expect(result.get("offscreen")!.visible).toBe(false);
});
test("an impossibly small viewport omits its labels instead of overflowing", () => {
  const [label] = layoutMarkerLabels(
    [{ key: "a", x: 50, y: 50 }],
    100,
    80,
  ).values();
  expect(label!.visible).toBe(false);
});

/** Shortest distance between a head and the edge of a label. */
function gapTo(
  point: { x: number; y: number },
  label: { x: number; y: number; w: number; h: number },
) {
  return Math.hypot(
    Math.max(0, Math.abs(point.x - label.x) - label.w / 2),
    Math.max(0, Math.abs(point.y - label.y) - label.h / 2),
  );
}

test("fitted names of close devices stay apart, each next to its own head", () => {
  // The reviewed capture: "Living room lamp" ran over "Front door".
  const points: LabelPoint[] = [
    { key: "lamp", x: 328, y: 108, w: 138, h: 24 },
    { key: "door", x: 414, y: 144, w: 96, h: 24 },
  ];
  const layout = layoutMarkerLabels(points, 742, 260);
  const lamp = layout.get("lamp")!;
  const door = layout.get("door")!;
  expect(lamp.visible && door.visible).toBe(true);
  expect(overlaps(lamp, door)).toBe(false);
  expect(lamp).toMatchObject({ w: 138, h: 24 });
  expect(door).toMatchObject({ w: 96, h: 24 });
  for (const point of points) {
    const own = layout.get(point.key)!;
    // Attached: closer to its own head than to the other one.
    expect(gapTo(point, own)).toBeLessThan(16);
    for (const other of points)
      if (other !== point)
        expect(gapTo(other, own)).toBeGreaterThan(gapTo(point, own));
  }
});

test.each([
  { width: 350, height: 300 },
  { width: 332, height: 200 },
  { width: 1130, height: 380 },
])(
  "a crowded $width × $height canvas never clips or stacks names; what does not fit is left to the list",
  ({ width, height }) => {
    const points: LabelPoint[] = [];
    // Nine heads 36 px apart: far more names than the space between them.
    for (let index = 0; index < 9; index++)
      points.push({
        key: `cluster-${index}`,
        x: width / 2 - 36 + (index % 3) * 36,
        y: height / 2 - 30 + Math.floor(index / 3) * 30,
        w: 70 + index * 9,
        h: 24,
      });
    const options = { pin: 21, gap: 5 };
    const layout = layoutMarkerLabels(points, width, height, options);
    const shown = [...layout.values()].filter((label) => label.visible);
    expect(shown.length).toBeGreaterThanOrEqual(5);
    expect(layout.size).toBe(points.length);
    for (const label of shown) {
      expect(label.x - label.w / 2).toBeGreaterThanOrEqual(4);
      expect(label.x + label.w / 2).toBeLessThanOrEqual(width - 4);
      expect(label.y - label.h / 2).toBeGreaterThanOrEqual(4);
      expect(label.y + label.h / 2).toBeLessThanOrEqual(height - 4);
      for (const other of shown)
        if (other !== label) expect(overlaps(label, other)).toBe(false);
      for (const point of points)
        expect(overlaps(label, { ...point, w: 21, h: 21 })).toBe(false);
    }
    // Placement is stable: the same heads in another order give the same result.
    expect(
      layoutMarkerLabels([...points].reverse(), width, height, options),
    ).toEqual(layout);
  },
);

test("a head in any corner keeps its name, pulled inside the canvas instead of clipped", () => {
  const width = 350,
    height = 300;
  const points = (
    [
      [3, 3],
      [width - 3, 3],
      [3, height - 3],
      [width - 3, height - 3],
      [width / 2, 2],
      [width / 2, height - 2],
    ] as const
  ).map(([x, y], index) => ({ key: `edge-${index}`, x, y, w: 124, h: 24 }));
  const layout = layoutMarkerLabels(points, width, height);
  for (const point of points) {
    const label = layout.get(point.key)!;
    expect(label.visible).toBe(true);
    expect(label.x - label.w / 2).toBeGreaterThanOrEqual(4);
    expect(label.x + label.w / 2).toBeLessThanOrEqual(width - 4);
    expect(label.y - label.h / 2).toBeGreaterThanOrEqual(4);
    expect(label.y + label.h / 2).toBeLessThanOrEqual(height - 4);
    expect(overlaps(label, { ...point, w: 20, h: 20 })).toBe(false);
    // Still its own: a leader's length away, never across the canvas.
    expect(gapTo(point, label)).toBeLessThan(60);
  }
});

test("a lone name sits just above its head and moves only when something is in the way", () => {
  const point = { key: "a", x: 200, y: 150, w: 100, h: 24 };
  const alone = layoutMarkerLabels([point], 400, 300).get("a")!;
  expect(alone.x).toBe(200);
  expect(alone.y).toBeLessThan(150);
  // A neighbour far away changes nothing.
  expect(
    layoutMarkerLabels(
      [point, { key: "b", x: 40, y: 280, w: 60, h: 24 }],
      400,
      300,
    ).get("a"),
  ).toEqual(alone);
  // A head sitting where the name would go pushes it to another free slot.
  const blocked = layoutMarkerLabels(
    [point, { key: "b", x: 200, y: 125, w: 60, h: 24 }],
    400,
    300,
  ).get("a")!;
  expect(blocked.visible).toBe(true);
  expect(blocked).not.toEqual(alone);
  expect(overlaps(blocked, { x: 200, y: 125, w: 20, h: 20 })).toBe(false);
});

test("the leader runs from the rim of the head to the nearest point of its name", () => {
  const head = { x: 100, y: 100 };
  const above = { x: 100, y: 60, w: 80, h: 24 };
  expect(labelLeader(head, above, 10)).toEqual({
    from: { x: 100, y: 90 },
    to: { x: 100, y: 72 },
    length: 18,
  });
  // A name pushed aside is reached at its nearest edge, not its centre.
  const aside = labelLeader(head, { x: 190, y: 96, w: 80, h: 24 }, 10)!;
  expect(aside.to).toEqual({ x: 150, y: 100 });
  expect(aside.from).toEqual({ x: 110, y: 100 });
  expect(aside.length).toBe(40);
  const diagonal = labelLeader(head, { x: 180, y: 40, w: 60, h: 20 }, 10)!;
  expect(diagonal.to).toEqual({ x: 150, y: 50 });
  expect(
    Math.hypot(diagonal.from.x - head.x, diagonal.from.y - head.y),
  ).toBeCloseTo(10, 10);
  expect(diagonal.length).toBeCloseTo(Math.hypot(50, 50) - 10, 10);
  // Touching or overlapping: nothing to draw.
  expect(labelLeader(head, { x: 100, y: 80, w: 80, h: 24 }, 10)).toBeNull();
  expect(labelLeader(head, { x: 100, y: 100, w: 80, h: 24 }, 10)).toBeNull();
});

test("six devices sharing two rooms: no name can be read as belonging to a neighbour", () => {
  // Head positions of the furnished sample floor in the 1440 desktop panel.
  const points: LabelPoint[] = [
    { key: "demo-camera.front_door", x: 716, y: 155, w: 150, h: 24 },
    { key: "demo-climate.downstairs", x: 438, y: 150, w: 156, h: 24 },
    { key: "demo-fan.office_vent", x: 567, y: 103, w: 156, h: 24 },
    { key: "demo-lock.front_door", x: 632, y: 181, w: 96, h: 24 },
    { key: "demo-sensor.fridge_temperature", x: 606, y: 235, w: 152, h: 24 },
    { key: "demo-switch.living_lamp", x: 507, y: 128, w: 138, h: 24 },
  ];
  const options = { pin: 21, gap: 5 };
  const layout = layoutMarkerLabels(points, 1130, 380, options);
  for (const point of points) {
    const own = layout.get(point.key)!;
    expect(own.visible).toBe(true);
    for (const other of points) {
      if (other === point) continue;
      // Its own head is the nearest one, and it is clear of every other name.
      expect(gapTo(other, own)).toBeGreaterThanOrEqual(gapTo(point, own));
      expect(overlaps(own, layout.get(other.key)!)).toBe(false);
    }
  }
  // The last key no longer gets the leftovers: arrival order is irrelevant.
  expect(layoutMarkerLabels([...points].reverse(), 1130, 380, options)).toEqual(
    layout,
  );
});
