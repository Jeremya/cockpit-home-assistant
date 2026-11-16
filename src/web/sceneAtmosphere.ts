import * as THREE from "three";
import { planBounds, type PlanPoint } from "../spatial/model";
import { insetPolygon, windowSpills } from "./sceneAccents";
import { planToWorld, type SceneFloor, type SceneRoom } from "./sceneModel";
import {
  FLOOR_THICKNESS,
  groundStyle,
  KEY_LIGHT_DIRECTION,
  PLINTH_HEIGHT,
  PLINTH_OVERHANG,
  scenePalette,
  selectionAccent,
  windowLight,
} from "./sceneStyle";

/**
 * Painted atmosphere: a graded stage, a pool of light with a contact shadow
 * under the plinth, soft occlusion where the house meets it, daylight below
 * saved windows and the room-selection line. Everything is a static texture
 * or a flat mesh drawn in the normal pass — no post-processing, no extra
 * shadow map and nothing that needs a frame while the scene is idle.
 */

/** Deterministic noise: a plan renders identically on every rebuild. */
export function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function painted(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Flat decals sit a few millimetres above their surface; never z-fight it. */
function decalMaterial(parameters: THREE.MeshBasicMaterialParameters) {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...parameters,
  });
}

/**
 * Stage backdrop: lifted behind the model, falling off to the corners. The
 * texture stretches with the canvas, so the falloff follows any aspect ratio
 * and works as a restrained vignette without a post-processing pass.
 */
export function stageBackdrop() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(
    size / 2,
    size * 0.48,
    0,
    size / 2,
    size * 0.48,
    size * 0.74,
  );
  gradient.addColorStop(0, scenePalette.stageGlow);
  gradient.addColorStop(0.55, scenePalette.stage);
  gradient.addColorStop(1, scenePalette.stageEdge);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  // A dark 8-bit gradient bands; one level of fixed noise hides the steps.
  const image = context.getImageData(0, 0, size, size);
  const random = seeded(101);
  for (let index = 0; index < image.data.length; index += 4) {
    const noise = (random() - 0.5) * 2.2;
    image.data[index] = image.data[index]! + noise;
    image.data[index + 1] = image.data[index + 1]! + noise;
    image.data[index + 2] = image.data[index + 2]! + noise;
  }
  context.putImageData(image, 0, 0);
  const texture = painted(canvas);
  // Drawn full-screen and never minified: no mip chain to store.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/** Draws only the blurred shadow of a path: the path itself stays off-canvas. */
function castBlur(
  context: CanvasRenderingContext2D,
  size: number,
  blur: number,
  alpha: number,
  offset: { x: number; y: number },
  trace: (shift: number) => void,
) {
  context.save();
  context.shadowColor = `rgba(0,0,0,${alpha})`;
  context.shadowBlur = blur;
  context.shadowOffsetX = size * 2 + offset.x;
  context.shadowOffsetY = offset.y;
  context.fillStyle = "#000";
  context.beginPath();
  trace(-size * 2);
  context.fill();
  context.restore();
}

function plinthSize(floor: SceneFloor) {
  const bounds = planBounds(floor.outline);
  return {
    width: bounds.maxX - bounds.minX + PLINTH_OVERHANG,
    depth: bounds.maxZ - bounds.minZ + PLINTH_OVERHANG,
  };
}

/**
 * Ground under the plinth: a soft pool of light that fades into the stage and
 * the plinth's contact shadow. It is painted once per floor, not lit.
 */
export function groundPool(floor: SceneFloor) {
  const { width, depth } = plinthSize(floor);
  const reach = (Math.hypot(width, depth) / 2) * groundStyle.poolReach;
  const size = 512;
  const scale = size / (2 * reach);
  const centre = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const pool = context.createRadialGradient(
    centre,
    centre,
    0,
    centre,
    centre,
    centre,
  );
  pool.addColorStop(0, rgba(scenePalette.groundPool, groundStyle.poolOpacity));
  pool.addColorStop(
    0.42,
    rgba(scenePalette.groundPool, groundStyle.poolOpacity * 0.62),
  );
  pool.addColorStop(
    0.72,
    rgba(scenePalette.groundPool, groundStyle.poolOpacity * 0.18),
  );
  pool.addColorStop(1, rgba(scenePalette.groundPool, 0));
  context.fillStyle = pool;
  context.fillRect(0, 0, size, size);
  const footprint = (shift: number) =>
    context.roundRect(
      centre - (width * scale) / 2 + shift,
      centre - (depth * scale) / 2,
      width * scale,
      depth * scale,
      0.12 * scale,
    );
  // Canvas +X is world +X and canvas +Y is world +Z; shadows fall away from
  // the key light. A tight contact first, then a wide soft penumbra.
  const away = {
    x: -KEY_LIGHT_DIRECTION[0] * 0.55 * scale,
    y: -KEY_LIGHT_DIRECTION[2] * 0.55 * scale,
  };
  castBlur(
    context,
    size,
    0.45 * scale,
    groundStyle.contactOpacity,
    { x: 0, y: 0 },
    footprint,
  );
  castBlur(
    context,
    size,
    2.2 * scale,
    groundStyle.contactOpacity * 0.6,
    away,
    footprint,
  );
  const geometry = new THREE.PlaneGeometry(2 * reach, 2 * reach);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    decalMaterial({ map: painted(canvas), polygonOffset: false }),
  );
  mesh.position.y = -PLINTH_HEIGHT - 0.002;
  mesh.renderOrder = -1;
  return mesh;
}

/** Soft occlusion on the plinth top, hugging the real floor outline. */
export function plinthOcclusion(floor: SceneFloor) {
  const { width, depth } = plinthSize(floor);
  const scale = 256 / Math.max(width, depth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(width * scale));
  canvas.height = Math.max(8, Math.round(depth * scale));
  const context = canvas.getContext("2d")!;
  castBlur(
    context,
    Math.max(canvas.width, canvas.height),
    0.5 * scale,
    groundStyle.occlusionOpacity,
    { x: 0, y: 0 },
    (shift) => {
      floor.outline.forEach((point, index) => {
        const at = planToWorld(point, floor.center);
        const x = (at.x + width / 2) * scale + shift;
        const y = (at.z + depth / 2) * scale;
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.closePath();
    },
  );
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    decalMaterial({ map: painted(canvas) }),
  );
  mesh.position.y = 0.003;
  return mesh;
}

/** Daylight patches below saved window lines; null when the floor has none. */
export function windowDaylight(floor: SceneFloor) {
  const spills = windowSpills(floor.outline, floor.lines);
  if (!spills.length) return null;
  const positions: number[] = [];
  const uvs: number[] = [];
  const shades: number[] = [];
  const y = FLOOR_THICKNESS + 0.004;
  for (const spill of spills) {
    const length = Math.hypot(
      spill.to.x - spill.from.x,
      spill.to.z - spill.from.z,
    );
    const along = {
      x: (spill.to.x - spill.from.x) / length,
      z: (spill.to.z - spill.from.z) / length,
    };
    const spread = spill.depth * 0.14;
    const corner = (base: typeof spill.from, reach: number, side: number) =>
      planToWorld(
        {
          x: base.x + spill.inward.x * reach + along.x * side,
          z: base.z + spill.inward.z * reach + along.z * side,
        },
        floor.center,
        y,
      );
    const a = corner(spill.from, 0.04, 0);
    const b = corner(spill.to, 0.04, 0);
    const c = corner(spill.to, spill.depth, spread);
    const d = corner(spill.from, spill.depth, -spread);
    for (const [point, u, v] of [
      [a, 0, 1],
      [b, 1, 1],
      [c, 1, 0],
      [a, 0, 1],
      [c, 1, 0],
      [d, 0, 0],
    ] as const) {
      positions.push(point.x, point.y, point.z);
      uvs.push(u, v);
      shades.push(spill.strength, spill.strength, spill.strength);
    }
  }
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      // Bright at the glazing (top row), fading into the room and at the sides.
      const into = 1 - row / (size - 1);
      const across = Math.min(column, size - 1 - column) / (size * 0.22);
      const edge = Math.min(1, across);
      const alpha = into * into * edge * edge * (3 - 2 * edge);
      const index = (row * size + column) * 4;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(255 * alpha);
    }
  context.putImageData(image, 0, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
  return new THREE.Mesh(
    geometry,
    decalMaterial({
      map: painted(canvas),
      color: scenePalette.daylight,
      opacity: windowLight.opacity,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
}

/**
 * Accent for the selected room: a thin line just inside its walls and a wash
 * of the same light fading toward the middle of the room. One mesh.
 */
export function selectionLine(
  room: SceneRoom,
  floor: SceneFloor,
  color: string,
) {
  const { lineInset, lineWidth, washWidth, washOpacity } = selectionAccent;
  const [outer, inner, wash] = [
    lineInset,
    lineInset + lineWidth,
    lineInset + lineWidth + washWidth,
  ].map((distance) => insetPolygon(room.polygon, distance)) as [
    PlanPoint[],
    PlanPoint[],
    PlanPoint[],
  ];
  if (
    outer.length < 3 ||
    inner.length !== outer.length ||
    wash.length !== outer.length
  )
    return null;
  const y = FLOOR_THICKNESS + 0.006;
  const positions: number[] = [];
  const shades: number[] = [];
  const band = (
    from: PlanPoint[],
    to: PlanPoint[],
    fromAlpha: number,
    toAlpha: number,
  ) => {
    for (let index = 0; index < from.length; index++) {
      const next = (index + 1) % from.length;
      const quad = [
        [from[index]!, fromAlpha],
        [from[next]!, fromAlpha],
        [to[next]!, toAlpha],
        [to[index]!, toAlpha],
      ] as const;
      for (const corner of [0, 1, 2, 0, 2, 3]) {
        const [point, alpha] = quad[corner]!;
        const at = planToWorld(point, floor.center, y);
        positions.push(at.x, at.y, at.z);
        shades.push(1, 1, 1, alpha);
      }
    }
  };
  band(outer, inner, 0.95, 0.95);
  band(inner, wash, washOpacity, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 4));
  return new THREE.Mesh(
    geometry,
    decalMaterial({ color, vertexColors: true, side: THREE.DoubleSide }),
  );
}
