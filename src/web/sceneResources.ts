import * as THREE from "three";

/** Disposes shared resources once, including label textures, before emptying the group. */
export function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    // Sprite's quad is shared by Three.js, not owned by this group.
    if (mesh.geometry && !(object as THREE.Sprite).isSprite)
      geometries.add(mesh.geometry);
    const material = mesh.material as
      THREE.Material | THREE.Material[] | undefined;
    for (const item of Array.isArray(material)
      ? material
      : material
        ? [material]
        : []) {
      materials.add(item);
      const texture = (item as THREE.MeshBasicMaterial).map;
      if (texture) textures.add(texture);
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  group.clear();
  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  };
}
