import * as THREE from "three";
import {
  addFurniture,
  furnitureState,
  loadFurnitureAsset,
  type FurnitureHost,
} from "../furnitureScene";
import type { SceneFloor } from "../sceneModel";

const mockRead = jest.fn<Promise<ArrayBuffer>, [string]>();
// The asset cache lives for the module; each test reads a URL of its own.
const mockAssets: Record<string, string> = {};

// Metro resolves the GLB imports; Jest only needs the module boundary.
jest.mock("../furnitureAssets", () => ({
  get furnitureAssets() {
    return mockAssets;
  },
}));
jest.mock("../assetBytes", () => ({
  readAssetBytes: (url: string) => mockRead(url),
}));
jest.mock("three/examples/jsm/loaders/GLTFLoader.js", () => {
  const three = jest.requireActual("three");
  return {
    GLTFLoader: class {
      parse(
        _bytes: ArrayBuffer,
        _path: string,
        onLoad: (gltf: { scene: THREE.Object3D }) => void,
      ) {
        const scene = new three.Group();
        scene.add(
          new three.Mesh(
            new three.BoxGeometry(2, 0.85, 0.9),
            new three.MeshStandardMaterial({ name: "carpet" }),
          ),
        );
        onLoad({ scene });
      }
    },
  };
});

const read = mockRead;

/** Each read waits until the test settles it. */
function pendingReads() {
  const settle: {
    resolve: (bytes: ArrayBuffer) => void;
    reject: (error: Error) => void;
  }[] = [];
  read.mockImplementation(
    () =>
      new Promise<ArrayBuffer>((resolve, reject) =>
        settle.push({ resolve, reject }),
      ),
  );
  return settle;
}

const floor: SceneFloor = {
  id: "f1",
  outline: [],
  rooms: [],
  lines: [],
  center: { x: 0, z: 0 },
  extent: 10,
  furniture: [
    {
      id: "sofa-1",
      kind: "sofa",
      variant: "sofa",
      shape: "rect",
      center: { x: 1, z: 1 },
      width: 2,
      depth: 0.9,
      rotation: 0,
      fitToFootprint: false,
    },
  ],
} as unknown as SceneFloor;

function host() {
  let disposed = false;
  const value: FurnitureHost = {
    content: new THREE.Group(),
    invalidate: jest.fn(),
    isDisposed: () => disposed,
    refreshShadows: jest.fn(),
  };
  return { value, dispose: () => (disposed = true) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  read.mockReset();
  mockAssets.sofa = `/assets/sofa-${expect.getState().currentTestName}.glb`;
});

test("concurrent scene builds share one read of an asset", async () => {
  const settle = pendingReads();
  const url = mockAssets.sofa!;
  const first = loadFurnitureAsset(url);
  expect(loadFurnitureAsset(url)).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  settle[0]!.resolve(new ArrayBuffer(8));
  await first;
});

test("a failed read is released for a later attempt but never retried by itself", async () => {
  const settle = pendingReads();
  const url = mockAssets.sofa!;
  const failed = loadFurnitureAsset(url);
  settle[0]!.reject(new Error("Asset unavailable"));
  await expect(failed).rejects.toThrow("Asset unavailable");
  await flush();
  expect(read).toHaveBeenCalledTimes(1);
  const later = loadFurnitureAsset(url);
  expect(later).not.toBe(failed);
  expect(read).toHaveBeenCalledTimes(2);
  settle[1]!.resolve(new ArrayBuffer(8));
  await expect(later).resolves.toBeInstanceOf(THREE.Object3D);
});

test("a late model never lands in a destroyed scene", async () => {
  const settle = pendingReads();
  const scene = host();
  addFurniture(scene.value, floor);
  expect(furnitureState(scene.value.content)).toEqual({
    models: 0,
    fallbacks: 1,
  });
  scene.dispose();
  settle[0]!.resolve(new ArrayBuffer(8));
  await flush();
  expect(furnitureState(scene.value.content)).toEqual({
    models: 0,
    fallbacks: 1,
  });
  expect(scene.value.invalidate).not.toHaveBeenCalled();
});

test("a late model never lands after a floor change, and the next build reuses it", async () => {
  const settle = pendingReads();
  const scene = host();
  addFurniture(scene.value, floor);
  // A floor change rebuilds the content: the old furniture group is detached.
  const old = scene.value.content.getObjectByName("furniture")!;
  scene.value.content.remove(old);
  settle[0]!.resolve(new ArrayBuffer(8));
  await flush();
  expect(old.children.map((holder) => holder.userData.furniture)).toEqual([
    "fallback",
  ]);
  expect(scene.value.invalidate).not.toHaveBeenCalled();
  const calls = read.mock.calls.length;
  addFurniture(scene.value, floor);
  await flush();
  expect(read.mock.calls.length).toBe(calls);
  expect(furnitureState(scene.value.content)).toEqual({
    models: 1,
    fallbacks: 0,
  });
});
