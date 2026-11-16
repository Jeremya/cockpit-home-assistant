import * as THREE from "three";
import { furnitureState } from "../furnitureScene";

// Metro resolves the GLB imports; Jest only needs the module boundary.
jest.mock("../furnitureAssets", () => ({ furnitureAssets: {} }));

test("furniture state counts loaded models apart from fallback volumes", () => {
  const content = new THREE.Group();
  expect(furnitureState(content)).toEqual({ models: 0, fallbacks: 0 });
  const group = new THREE.Group();
  group.name = "furniture";
  content.add(group);
  for (const shown of ["model", "fallback", "fallback"]) {
    const holder = new THREE.Group();
    holder.userData.furniture = shown;
    group.add(holder);
  }
  expect(furnitureState(content)).toEqual({ models: 1, fallbacks: 2 });
});
