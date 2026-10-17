import { layoutMarkerLabels, overlaps } from "../labelLayout";

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
