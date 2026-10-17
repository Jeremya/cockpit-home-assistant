import * as THREE from "three";
import { entityTint } from "../core/appearance";
import { planToWorld, type SceneFloor, type SceneMarker } from "./sceneModel";
import { disposeGroup } from "./sceneResources";

export interface MarkerNode {
  value: SceneMarker;
  group: THREE.Group;
  pin: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
}
export type MarkerNodes = Map<string, MarkerNode>;

/** Diff by stable entity key. An observation update never rebuilds floor geometry or the camera. */
export function syncMarkers(
  content: THREE.Group,
  nodes: MarkerNodes,
  floor: SceneFloor,
  markers: readonly SceneMarker[],
  makeLabel: (text: string, icon: SceneMarker["icon"]) => THREE.Sprite,
) {
  const wanted = new Set(markers.map((marker) => marker.key));
  const changes = { created: 0, updated: 0, removed: 0 };
  for (const [key, node] of nodes) {
    if (wanted.has(key)) continue;
    content.remove(node.group);
    disposeGroup(node.group);
    nodes.delete(key);
    changes.removed++;
  }
  for (const marker of markers) {
    let node = nodes.get(marker.key);
    if (!node) {
      const tint = entityTint(marker.icon, marker.condition);
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 12),
        new THREE.MeshStandardMaterial({
          color: tint,
          emissive: tint,
          emissiveIntensity: 0.25,
        }),
      );
      const group = new THREE.Group();
      const label = makeLabel(marker.label, marker.icon);
      label.position.set(0, 0.45, 0);
      pin.userData.markerKey =
        group.userData.markerKey =
        label.userData.markerKey =
          marker.key;
      group.add(pin, label);
      content.add(group);
      node = { value: marker, group, pin, label };
      nodes.set(marker.key, node);
      changes.created++;
    } else {
      const before = node.value;
      const colorChanged =
        before.condition !== marker.condition || before.icon !== marker.icon;
      const labelChanged =
        before.label !== marker.label || before.icon !== marker.icon;
      const positionChanged =
        before.position.x !== marker.position.x ||
        before.position.z !== marker.position.z;
      if (!colorChanged && !labelChanged && !positionChanged) continue;
      if (colorChanged) {
        const tint = entityTint(marker.icon, marker.condition);
        node.pin.material.color.set(tint);
        node.pin.material.emissive.set(tint);
      }
      if (labelChanged) {
        node.label.material.map?.dispose();
        node.label.material.dispose();
        node.group.remove(node.label);
        node.label = makeLabel(marker.label, marker.icon);
        node.label.position.set(0, 0.45, 0);
        node.label.userData.markerKey = marker.key;
        node.group.add(node.label);
      }
      changes.updated++;
    }
    const at = planToWorld(marker.position, floor.center, 0.9);
    node.group.position.set(at.x, at.y, at.z);
    node.value = { ...marker, position: { ...marker.position } };
  }
  return changes;
}
