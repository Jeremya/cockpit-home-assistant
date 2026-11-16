import {
  pointInPolygon,
  type PlanLine,
  type PlanPoint,
} from "../../spatial/model";
import { insetPolygon, keyLightOnPlan, windowSpills } from "../sceneAccents";
import { windowLight } from "../sceneStyle";

const square: PlanPoint[] = [
  { x: 0, z: 0 },
  { x: 8, z: 0 },
  { x: 8, z: 6 },
  { x: 0, z: 6 },
];
// Concave: a notch is cut out of the +x/+z corner.
const ell: PlanPoint[] = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: 6, z: 3 },
  { x: 3, z: 3 },
  { x: 3, z: 6 },
  { x: 0, z: 6 },
];
/** Distance from a point to the nearest edge of a polygon. */
function distanceToBoundary(point: PlanPoint, polygon: PlanPoint[]) {
  return Math.min(
    ...polygon.map((a, index) => {
      const b = polygon[(index + 1) % polygon.length]!;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz),
        ),
      );
      return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
    }),
  );
}

test("the selection line stays inside the room, the same distance from every wall, concave corners included", () => {
  for (const polygon of [square, ell, [...ell].reverse()]) {
    const inset = insetPolygon(polygon, 0.14);
    expect(inset).toHaveLength(polygon.length);
    for (const point of inset) {
      expect(pointInPolygon(point, polygon)).toBe(true);
      // Exactly the inset from both walls of a convex corner; a mitred
      // concave corner sits a little farther from its single nearest point.
      const distance = distanceToBoundary(point, polygon);
      expect(distance).toBeGreaterThanOrEqual(0.14 - 1e-9);
      expect(distance).toBeLessThanOrEqual(0.14 * Math.SQRT2 + 1e-9);
    }
  }
  expect(insetPolygon(square, 0.14)[0]).toEqual({ x: 0.14, z: 0.14 });
});

test("a degenerate or repeated outline yields no line instead of a spike", () => {
  expect(insetPolygon(square.slice(0, 2), 0.1)).toEqual([]);
  expect(
    insetPolygon(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
      ],
      0.1,
    ),
  ).toEqual([]);
  // A duplicated vertex is ignored rather than producing a zero-length edge.
  const repeated = [square[0]!, square[0]!, ...square.slice(1)];
  expect(insetPolygon(repeated, 0.14)).toEqual(insetPolygon(square, 0.14));
  // A needle-sharp corner is clamped, not shot across the room.
  const needle = insetPolygon(
    [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 0, z: 0.4 },
    ],
    0.05,
  );
  for (const point of needle) expect(Math.abs(point.x)).toBeLessThanOrEqual(10);
});

const window = (from: PlanPoint, to: PlanPoint): PlanLine => ({
  kind: "window",
  from,
  to,
});

test("only saved window lines admit daylight: walls, steps and gaps between lines never do", () => {
  const lines: PlanLine[] = [
    { kind: "wall", from: { x: 4, z: 0 }, to: { x: 4, z: 2 } },
    // The 1 m gap up to z = 3 is a doorway in the drawing, not a light source.
    { kind: "wall", from: { x: 4, z: 3 }, to: { x: 4, z: 6 } },
    { kind: "step", from: { x: 1, z: 1 }, to: { x: 2, z: 1 } },
  ];
  expect(windowSpills(square, lines)).toEqual([]);
  expect(windowSpills(square, [])).toEqual([]);
  expect(
    windowSpills(square, [window({ x: 2, z: 2 }, { x: 2, z: 2 })]),
  ).toEqual([]);
});

test("an envelope window lights only the room behind it, strongly where the key light shines through", () => {
  const light = keyLightOnPlan();
  expect(Math.hypot(light.x, light.z)).toBeCloseTo(1, 10);
  // The key light travels toward plan −x: it enters through the +x wall.
  const sunny = windowSpills(square, [window({ x: 8, z: 2 }, { x: 8, z: 4 })]);
  expect(sunny).toHaveLength(1);
  expect(sunny[0]!.inward.x).toBeCloseTo(-1, 10);
  expect(sunny[0]!.inward.z).toBeCloseTo(0, 10);
  expect(sunny[0]).toMatchObject({
    depth: windowLight.directDepth,
    strength: windowLight.directStrength,
  });
  // The opposite wall only receives diffuse light, and still only inside.
  const shaded = windowSpills(square, [window({ x: 0, z: 2 }, { x: 0, z: 4 })]);
  expect(shaded).toHaveLength(1);
  expect(shaded[0]!.inward.x).toBeCloseTo(1, 10);
  expect(shaded[0]).toMatchObject({
    depth: windowLight.diffuseDepth,
    strength: windowLight.diffuseStrength,
  });
  expect(shaded[0]!.strength).toBeLessThan(sunny[0]!.strength);
  for (const spill of [...sunny, ...shaded]) {
    const end = {
      x: (spill.from.x + spill.to.x) / 2 + spill.inward.x * spill.depth,
      z: (spill.from.z + spill.to.z) / 2 + spill.inward.z * spill.depth,
    };
    expect(pointInPolygon(end, square)).toBe(true);
  }
});

test("interior glazing lights both rooms it separates, one side directly", () => {
  const spills = windowSpills(square, [window({ x: 4, z: 1 }, { x: 4, z: 3 })]);
  expect(spills).toHaveLength(2);
  expect(spills[0]!.inward.x).toBeCloseTo(-spills[1]!.inward.x, 10);
  expect(
    spills.filter((spill) => spill.strength === windowLight.directStrength),
  ).toHaveLength(1);
  // A custom light direction is honoured: nothing is hard-wired to the sample.
  const reversed = windowSpills(
    square,
    [window({ x: 8, z: 2 }, { x: 8, z: 4 })],
    { x: 1, z: 0 },
  );
  expect(reversed[0]!.strength).toBe(windowLight.diffuseStrength);
});
