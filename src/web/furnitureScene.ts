import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { furnitureAssets } from "./furnitureAssets";
import {
  furnitureCatalog,
  type FurnitureCatalogEntry,
} from "./furnitureCatalog";
import {
  counterModuleCount,
  flatScale,
  footprintFit,
  furnitureScale,
} from "./furnitureModel";
import {
  planToWorld,
  type SceneFloor,
  type SceneFurniture,
} from "./sceneModel";
import { FLOOR_THICKNESS, furniturePalette, scenePalette } from "./sceneStyle";

/**
 * Furniture is decorative: it never reads an entity, a room link or a command.
 * Each item starts as a fallback volume and is replaced by its GLB when the
 * asset resolves. A failed load leaves the volume in place.
 */
export interface FurnitureHost {
  content: THREE.Group;
  invalidate: () => void;
  isDisposed: () => boolean;
  refreshShadows: () => void;
}

interface MaterialSpec {
  color: string;
  roughness: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

const specs: Record<string, MaterialSpec> = {
  wood: { color: furniturePalette.wood, roughness: 0.78 },
  woodDark: { color: furniturePalette.woodDark, roughness: 0.8 },
  metal: { color: furniturePalette.metal, roughness: 0.45, metalness: 0.25 },
  metalLight: {
    color: furniturePalette.metalLight,
    roughness: 0.4,
    metalness: 0.2,
  },
  metalDark: {
    color: furniturePalette.metalDark,
    roughness: 0.5,
    metalness: 0.2,
  },
  carpet: { color: furniturePalette.fabric, roughness: 0.95 },
  carpetWhite: { color: furniturePalette.fabricLight, roughness: 0.95 },
  carpetDarker: { color: furniturePalette.fabricDark, roughness: 0.95 },
  rug: { color: furniturePalette.rug, roughness: 0.98 },
  rugDark: { color: furniturePalette.rugDark, roughness: 0.98 },
  lamp: {
    color: furniturePalette.lamp,
    roughness: 0.6,
    emissive: furniturePalette.lampGlow,
    emissiveIntensity: 0.4,
  },
  plant: { color: furniturePalette.plant, roughness: 0.9 },
  glass: {
    color: scenePalette.glass,
    roughness: 0.1,
    transparent: true,
    opacity: 0.3,
  },
  // Fallback volumes reuse the palette intentionally; they are not vendor art.
  fabric: { color: furniturePalette.fabric, roughness: 0.95 },
  stone: { color: furniturePalette.stone, roughness: 0.9 },
};

const gltfCache = new Map<string, Promise<THREE.Object3D>>();

/** One loader per asset URL per app lifetime; a failed URL can be retried. */
export function loadFurnitureAsset(url: string) {
  const cached = gltfCache.get(url);
  if (cached) return cached;
  const promise = new Promise<THREE.Object3D>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    );
  });
  gltfCache.set(url, promise);
  promise.catch(() => gltfCache.delete(url));
  return promise;
}

function materialFactory() {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  return (name: string) => {
    const key = specs[name] ? name : "wood";
    const cached = materials.get(key);
    if (cached) return cached;
    const spec = specs[key]!;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness ?? 0,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      depthWrite: !spec.transparent,
    });
    if (spec.emissive) {
      material.emissive = new THREE.Color(spec.emissive);
      material.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    materials.set(key, material);
    return material;
  };
}

function instantiate(
  asset: THREE.Object3D,
  entry: FurnitureCatalogEntry,
  item: SceneFurniture,
  materialFor: (name: string) => THREE.MeshStandardMaterial,
) {
  const root = asset.clone(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // The cached GLTF keeps its own geometry; each instance owns a clone so
    // `disposeGroup` can never invalidate the cache.
    mesh.geometry = mesh.geometry.clone();
    const source = mesh.material as
      THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(source))
      mesh.material = source.map((material) => materialFor(material.name));
    else if (source) mesh.material = materialFor(source.name);
    mesh.castShadow = !entry.flat;
    mesh.receiveShadow = true;
  });
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // Center the asset on its plan point and stand it on the finished floor.
  root.position.set(-center.x, -bounds.min.y, -center.z);
  // Rotation happens around the centered model, then the holder applies the
  // plan's own rotation.
  const pivot = new THREE.Group();
  pivot.add(root);
  const wrapper = new THREE.Group();
  wrapper.add(pivot);

  if (entry.flat) {
    const scale = flatScale(size, item.width, item.depth);
    wrapper.scale.set(scale.x, scale.y, scale.z);
    return wrapper;
  }

  if (item.fitToFootprint) {
    // Legacy/photo-derived footprints: fill the drawn rectangle instead of
    // floating at a height-derived scale. Long axes are aligned first.
    if (entry.tile) {
      const count = counterModuleCount(item.width, 0.6);
      const moduleWidth = item.width / count;
      const fit = footprintFit(size, moduleWidth, item.depth, entry.height);
      if (fit.rotate) pivot.rotation.y = Math.PI / 2;
      wrapper.scale.set(fit.scale.x, fit.scale.y, fit.scale.z);
      const run = new THREE.Group();
      for (let index = 0; index < count; index++) {
        // Copies share geometries/materials within this build; disposal dedupes.
        const copy = wrapper.clone(true);
        copy.position.x = (index - (count - 1) / 2) * moduleWidth;
        run.add(copy);
      }
      return run;
    }
    const fit = footprintFit(size, item.width, item.depth, entry.height);
    if (fit.rotate) pivot.rotation.y = Math.PI / 2;
    wrapper.scale.set(fit.scale.x, fit.scale.y, fit.scale.z);
    return wrapper;
  }

  wrapper.scale.setScalar(furnitureScale(size, entry));
  if (!entry.tile) return wrapper;
  const moduleWidth = size.x * Math.abs(wrapper.scale.x);
  const count = counterModuleCount(item.width, moduleWidth);
  if (count < 2) return wrapper;
  const run = new THREE.Group();
  for (let index = 0; index < count; index++) {
    // Copies share geometries/materials within this build; disposal dedupes them.
    const copy = wrapper.clone(true);
    copy.position.x = (index - (count - 1) / 2) * moduleWidth;
    run.add(copy);
  }
  return run;
}

function fallback(
  item: SceneFurniture,
  entry: FurnitureCatalogEntry,
  materialFor: (name: string) => THREE.MeshStandardMaterial,
) {
  const height = entry.flat ? 0.02 : entry.height;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(item.width, height, item.depth),
    materialFor(entry.fallback),
  );
  mesh.position.y = height / 2;
  mesh.castShadow = !entry.flat;
  mesh.receiveShadow = true;
  return mesh;
}

/** Adds one group of furniture to the content group. Synchronous fallbacks first. */
export function addFurniture(host: FurnitureHost, floor: SceneFloor) {
  if (!floor.furniture.length) return;
  const group = new THREE.Group();
  group.name = "furniture";
  host.content.add(group);
  const baseMaterialFor = materialFactory();
  for (const item of floor.furniture) {
    const entry = furnitureCatalog[item.variant];
    if (!entry) continue;
    // Rugs reuse the carpet materials; remap them so textiles never read as wood.
    const materialFor = (name: string) =>
      baseMaterialFor(
        entry.flat && name === "carpet"
          ? "rug"
          : entry.flat && name === "carpetDarker"
            ? "rugDark"
            : name,
      );
    const at = planToWorld(item.center, floor.center, FLOOR_THICKNESS);
    const holder = new THREE.Group();
    holder.position.set(at.x, at.y, at.z);
    holder.rotation.y = THREE.MathUtils.degToRad(item.rotation);
    group.add(holder);
    const placeholder = fallback(item, entry, materialFor);
    holder.add(placeholder);
    const url = furnitureAssets[item.variant];
    if (!url) continue;
    void loadFurnitureAsset(url)
      .then((asset) => {
        if (host.isDisposed() || group.parent !== host.content) return;
        holder.remove(placeholder);
        placeholder.geometry.dispose();
        holder.add(instantiate(asset, entry, item, materialFor));
        host.refreshShadows();
        host.invalidate();
      })
      .catch(() => undefined);
  }
}
