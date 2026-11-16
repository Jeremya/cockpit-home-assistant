import { furnitureVariants } from "../../spatial/model";
import { furnitureCatalog, tallestFurniture } from "../furnitureCatalog";
import {
  counterModuleCount,
  flatScale,
  furnitureScale,
} from "../furnitureModel";

test("every persisted furniture variant has a catalog entry with a preview height", () => {
  for (const variant of furnitureVariants) {
    const entry = furnitureCatalog[variant];
    expect(entry).toBeDefined();
    expect(entry.height).toBeGreaterThan(0);
    expect(entry.height).toBeLessThanOrEqual(2.5);
  }
});

test("uniform scale normalizes the asset height and rejects unusable sizes", () => {
  expect(furnitureScale({ x: 1, y: 0.4, z: 0.6 }, { height: 0.8 })).toBe(2);
  expect(furnitureScale({ x: 1, y: 0, z: 1 }, { height: 0.8 })).toBe(1);
  expect(furnitureScale({ x: 1, y: 1, z: 1 }, { height: 0 })).toBe(1);
});

test("flat textiles fill their plan footprint without a vertical stretch", () => {
  expect(flatScale({ x: 1.57, y: 0.01, z: 0.92 }, 2.6, 1.9)).toEqual({
    x: 2.6 / 1.57,
    y: 1,
    z: 1.9 / 0.92,
  });
  expect(flatScale({ x: 0, y: 0.01, z: 1 }, 2, 2)).toEqual({
    x: 1,
    y: 1,
    z: 2,
  });
});

test("counter runs are bounded and never divide by zero", () => {
  expect(counterModuleCount(1.7, 0.86)).toBe(2);
  expect(counterModuleCount(1.7, 0.5)).toBe(3);
  expect(counterModuleCount(1.7, 0)).toBe(1);
  expect(counterModuleCount(Number.NaN, 1)).toBe(1);
  expect(counterModuleCount(1000, 0.1)).toBe(12);
});

test("framing uses the tallest catalog target, ignoring unknown variants", () => {
  expect(tallestFurniture(["sofa", "shower", "plant"])).toBe(2);
  expect(tallestFurniture(["sofa", undefined])).toBe(0.85);
  expect(tallestFurniture([])).toBe(0);
});
