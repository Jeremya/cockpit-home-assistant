import * as THREE from "three";
import { entityTint } from "../core/appearance";
import {
  MARKER_GLOW_SIZE,
  MARKER_HEAD_RADIUS,
  MARKER_HEIGHT,
  MARKER_PICK_RADIUS,
  markerStyle,
} from "./markerStyle";
import { planToWorld, type SceneFloor, type SceneMarker } from "./sceneModel";
import { disposeGroup } from "./sceneResources";
import { FLOOR_THICKNESS, scenePalette } from "./sceneStyle";

/**
 * A placed device is a small turned-steel pin standing on the floor with an
 * enamel head. The head carries the shared U04 colour and, redundantly, a
 * silhouette per condition (see `markerStyle`). Head parts are authored in
 * CSS pixels and rescaled by the renderer so they stay legible at any zoom;
 * the stem keeps its world height so the pin belongs to the room it stands in.
 */
export interface MarkerNode {
  value: SceneMarker;
  /** Positioned at the head; children are relative to it. */
  group: THREE.Group;
  head: THREE.Group;
  /** The bead. Its geometry and material survive every condition change. */
  pin: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  diamond: THREE.Mesh;
  ring: THREE.Mesh;
  slash: THREE.Mesh;
  dot: THREE.Mesh;
  glow: THREE.Sprite;
  stem: THREE.Mesh;
  leader: THREE.Sprite;
  label: THREE.Sprite;
}
export type MarkerNodes = Map<string, MarkerNode>;

/** World length of the pin from the finished floor to the centre of its head. */
export const MARKER_STEM_LENGTH = MARKER_HEIGHT - FLOOR_THICKNESS;
/** Draw order above the house: leader and halo, then the head, then its name. */
const ORDER = { under: 2, head: 3, label: 4 };

/** Soft radial falloff generated in memory; no canvas or external request. */
function glowTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const distance =
        Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const falloff = Math.max(0, 1 - distance);
      const index = (y * size + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = 255;
      data[index + 3] = Math.round(255 * falloff * falloff * (3 - 2 * falloff));
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function applyCondition(node: MarkerNode, marker: SceneMarker) {
  const tint = entityTint(marker.icon, marker.condition);
  const style = markerStyle(marker.condition);
  const material = node.pin.material;
  material.color.set(tint);
  material.emissive.set(tint);
  material.emissiveIntensity = style.emissive;
  node.pin.visible = style.head === "bead";
  node.diamond.visible = style.head === "diamond";
  node.ring.visible = style.head === "ring";
  node.slash.visible = style.mark === "slash";
  node.dot.visible = style.mark === "dot";
  node.glow.material.color.set(tint);
  node.glow.material.opacity = style.glow;
  node.glow.visible = style.glow > 0;
}

function attachLabel(group: THREE.Group, label: THREE.Sprite) {
  label.renderOrder = ORDER.label;
  group.add(label);
  return label;
}

function createNode(
  marker: SceneMarker,
  makeLabel: (text: string, icon: SceneMarker["icon"]) => THREE.Sprite,
): MarkerNode {
  const group = new THREE.Group();
  group.userData.markerKey = marker.key;
  const head = new THREE.Group();
  // Always legible: the head is drawn over the house, like its name.
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(MARKER_HEAD_RADIUS, 16, 10),
    material,
  );
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(MARKER_HEAD_RADIUS * 1.3),
    material,
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(MARKER_HEAD_RADIUS * 0.92, 2.1, 6, 24),
    material,
  );
  const slash = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, MARKER_HEAD_RADIUS * 2.8, 2.4),
    material,
  );
  slash.rotation.z = -Math.PI / 4;
  const dot = new THREE.Mesh(pin.geometry, material);
  dot.scale.setScalar(0.36);
  // Generous touch target; never drawn, only hit by the selection ray.
  const target = new THREE.Mesh(
    new THREE.SphereGeometry(MARKER_PICK_RADIUS, 8, 6),
    new THREE.MeshBasicMaterial(),
  );
  target.visible = false;
  for (const part of [pin, diamond, ring, slash, dot]) {
    part.renderOrder = ORDER.head;
    head.add(part);
  }
  head.add(target);

  // One turned profile: a flared base plate rising into a slim stem.
  const stem = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -1),
        new THREE.Vector2(5, -1),
        new THREE.Vector2(5, -0.988),
        new THREE.Vector2(1.1, -0.97),
        new THREE.Vector2(1.1, 0),
      ],
      10,
    ),
    new THREE.MeshStandardMaterial({
      color: scenePalette.markerStem,
      roughness: 0.45,
      metalness: 0.1,
    }),
  );
  stem.scale.set(1, MARKER_STEM_LENGTH, 1);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    }),
  );
  glow.renderOrder = ORDER.under;
  glow.userData.pixelWidth = glow.userData.pixelHeight = MARKER_GLOW_SIZE;
  const leader = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: scenePalette.labelLeader,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
    }),
  );
  leader.renderOrder = ORDER.under;
  leader.visible = false;

  group.add(stem, leader, glow, head);
  const node: MarkerNode = {
    value: marker,
    group,
    head,
    pin,
    diamond,
    ring,
    slash,
    dot,
    glow,
    stem,
    leader,
    label: attachLabel(group, makeLabel(marker.label, marker.icon)),
  };
  applyCondition(node, marker);
  return node;
}

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
      node = createNode(marker, makeLabel);
      content.add(node.group);
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
      if (colorChanged) applyCondition(node, marker);
      if (labelChanged) {
        node.label.material.map?.dispose();
        node.label.material.dispose();
        node.group.remove(node.label);
        node.label = attachLabel(
          node.group,
          makeLabel(marker.label, marker.icon),
        );
      }
      changes.updated++;
    }
    const at = planToWorld(marker.position, floor.center, MARKER_HEIGHT);
    node.group.position.set(at.x, at.y, at.z);
    node.value = { ...marker, position: { ...marker.position } };
  }
  return changes;
}
