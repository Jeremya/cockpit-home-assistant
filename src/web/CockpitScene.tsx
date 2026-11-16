"use dom";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { DOMProps } from "expo/dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ModelCameraController } from "./ModelCameraController";
import type { Point3 } from "./modelCamera";
import { colors } from "../theme";
import { syncMarkers, type MarkerNodes } from "./sceneMarkers";
import {
  rendererCreated,
  rendererDisposed,
  rendererFrame,
  rendererLifecycle,
} from "./rendererLifecycle";
import { disposeGroup } from "./sceneResources";
import { layoutMarkerLabels, overlaps } from "./labelLayout";
import { planBounds, pointInPolygon } from "../spatial/model";
import {
  cameraFacing,
  FLOOR_THICKNESS,
  FLOOR_TILE_METRES,
  floorSurface,
  floorSurfaceColor,
  PLINTH_HEIGHT,
  PLINTH_OVERHANG,
  scenePalette,
  WALL_CAP_HEIGHT,
  type FloorSurface,
} from "./sceneStyle";
import { wallPieces } from "./sceneWalls";
import { tallestFurniture } from "./furnitureCatalog";
import { addFurniture } from "./furnitureScene";
import {
  FrameStats,
  classifyGesture,
  pickRoomAt,
  planToWorld,
  worldToPlan,
  type SceneErrorCode,
  type SceneFloor,
  type SceneMarker,
  type SceneMetrics,
} from "./sceneModel";

/**
 * Shared spatial renderer (S01 lab and S02 placements). Runs in the DOM webview's own JS runtime: it receives
 * JSON-safe geometry and sanitized markers only, renders on demand, and reports
 * selection, readiness, errors and metrics through top-level async callbacks.
 */
export interface CockpitSceneProps {
  floor: SceneFloor;
  markers: SceneMarker[];
  selectedRoomId: string | null;
  resetKey: number;
  cameraMode?: "orbit" | "model";
  interactive?: boolean;
  onOverview?: () => Promise<void>;
  visible: boolean;
  /** Rendering-only preview height; not a measured story height. */
  wallHeight: number;
  /** Lab-only fault injection; production callers leave it null. */
  simulate: "context_loss" | null;
  onRoomPress: (roomId: string) => Promise<void>;
  onMarkerPress: (key: string) => Promise<void>;
  onSceneReady: () => Promise<void>;
  onSceneError: (code: SceneErrorCode) => Promise<void>;
  onMetrics: (metrics: SceneMetrics) => Promise<void>;
  dom?: DOMProps;
}

const SELECTED_FLOOR_COLOR = new THREE.Color(
  scenePalette.selectedFloor,
).getHex();

/** Deterministic texture noise: a plan renders identically on every rebuild. */
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small procedural floor tile; no external texture request is made. */
function surfaceTexture(
  surface: FloorSurface,
  cache: Map<FloorSurface, THREE.Texture>,
) {
  const cached = cache.get(surface);
  if (cached) return cached;
  const { base, seam, accent } = floorSurfaceColor[surface];
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const random = seeded(surface === "oak" ? 7 : surface === "walnut" ? 19 : 31);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  if (surface === "stone") {
    context.fillStyle = accent;
    context.globalAlpha = 0.3;
    for (let blot = 0; blot < 90; blot++) {
      context.beginPath();
      context.arc(
        random() * size,
        random() * size,
        2 + random() * 10,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.fillStyle = seam;
    context.globalAlpha = 0.25;
    for (let speck = 0; speck < 240; speck++) {
      context.beginPath();
      context.arc(
        random() * size,
        random() * size,
        0.5 + random() * 1.2,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  } else {
    const rows = 6;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * rowHeight;
      context.fillStyle = row % 2 ? accent : seam;
      context.globalAlpha = 0.12 + random() * 0.1;
      context.fillRect(0, y, size, rowHeight);
      context.fillStyle = seam;
      context.globalAlpha = 0.55;
      context.fillRect(0, y + rowHeight - 1, size, 1);
      const offset = (row % 2 ? 0.45 : 0.1) * size;
      context.fillRect(offset, y, 1, rowHeight);
      context.fillRect((offset + size * 0.5) % size, y, 1, rowHeight);
      context.globalAlpha = 0.12;
      for (let line = 0; line < 3; line++) {
        const grain = y + rowHeight * (0.25 + random() * 0.5);
        context.beginPath();
        context.moveTo(0, grain);
        context.bezierCurveTo(
          size * 0.3,
          grain + (random() - 0.5) * 3,
          size * 0.7,
          grain + (random() - 0.5) * 3,
          size,
          grain,
        );
        context.strokeStyle = seam;
        context.stroke();
      }
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / FLOOR_TILE_METRES, 1 / FLOOR_TILE_METRES);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(surface, texture);
  return texture;
}

function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.02,
) {
  const safe = Math.max(
    0.001,
    Math.min(radius, Math.min(width, height, depth) / 2 - 0.001),
  );
  return new RoundedBoxGeometry(width, height, depth, 2, safe);
}

/** One static key light per built floor; the shadow map is redrawn only on rebuild. */
function fitKeyLight(runtime: Runtime, floor: SceneFloor) {
  const distance = floor.extent * 1.6 + 5;
  runtime.keyLight.position
    .set(0.7, 1, 0.28)
    .normalize()
    .multiplyScalar(distance);
  runtime.keyLight.target.position.set(0, 0, 0);
  runtime.keyLight.target.updateMatrixWorld();
  const size = floor.extent / 2 + 2.5;
  const shadowCamera = runtime.keyLight.shadow.camera;
  shadowCamera.left = -size;
  shadowCamera.right = size;
  shadowCamera.top = size;
  shadowCamera.bottom = -size;
  shadowCamera.near = 0.5;
  shadowCamera.far = distance * 2 + size * 2;
  shadowCamera.updateProjectionMatrix();
}

interface Runtime {
  model: ModelCameraController | null;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  keyLight: THREE.DirectionalLight;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  roomMeshes: Map<string, THREE.Mesh>;
  roomLabels: Map<string, THREE.Sprite>;
  markerNodes: MarkerNodes;
  markerChanges: { created: number; updated: number; removed: number };
  selectionKey: string | null;
  stats: FrameStats;
  frameRequested: number | null;
  visible: boolean;
  rebuilds: number;
  builtKey: string | null;
  contextLosses: number;
  readyMs: number | null;
  disposed: boolean;
  listenersActive: number;
  controlsDisposed: boolean;
  observerDisconnected: boolean;
  invalidate: () => void;
  metrics: () => SceneMetrics;
  syncVisibility: () => void;
  teardown: { geometries: number; materials: number; textures: number } | null;
}

function labelSprite(text: string, icon?: SceneMarker["icon"]) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  if (icon) {
    context.fillStyle = "rgba(11,15,25,0.94)";
    context.beginPath();
    context.roundRect(0, 4, 256, 56, 12);
    context.fill();
  }
  context.font = "500 30px sans-serif";
  context.fillStyle = icon ? "#e5e9f2" : scenePalette.labelInk;
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (icon) {
    context.save();
    context.translate(10, 18);
    context.scale(1.15, 1.15);
    context.strokeStyle = colors.text;
    context.lineWidth = 1.8;
    context.lineCap = "round";
    context.lineJoin = "round";
    const paths: Record<SceneMarker["icon"], string> = {
      lock: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4",
      climate: "M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0 M12 10v8",
      fan: "M3 8h12a3 3 0 1 0-3-3 M2 12h17 M4 16h11a3 3 0 1 1-3 3",
      switch:
        "M7 7h10a5 5 0 0 1 0 10H7a5 5 0 0 1 0-10 M7 10a2 2 0 1 1 0 4a2 2 0 1 1 0-4",
      camera: "M3 6h12v12H3z M15 10l6-3v10l-6-3",
      sensor: "M2 12h5l3-8l4 16l3-8h5",
      event: "M5 17h14l-2-3V8a5 5 0 0 0-10 0v6z M10 21h4",
    };
    context.stroke(new Path2D(paths[icon]));
    context.restore();
  }
  context.fillText(
    text.length > 18 ? text.slice(0, 17) + "…" : text,
    icon ? 146 : 128,
    32,
    icon ? 205 : 250,
  );
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
      sizeAttenuation: false,
    }),
  );
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 2;
  sprite.userData.pixelHeight = icon ? 32 : 24;
  return sprite;
}

function buildFloor(
  runtime: Runtime,
  floor: SceneFloor,
  wallHeight: number,
  cameraMode: "orbit" | "model",
) {
  disposeGroup(runtime.content);
  runtime.roomMeshes.clear();
  runtime.roomLabels.clear();
  runtime.markerNodes.clear();
  runtime.selectionKey = null;
  const textures = new Map<FloorSurface, THREE.Texture>();
  for (const room of floor.rooms) {
    const shape = new THREE.Shape(
      room.polygon.map(
        (p) => new THREE.Vector2(p.x - floor.center.x, p.z - floor.center.z),
      ),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: FLOOR_THICKNESS,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2); // shape (x, z) → world (x, 0, −z)
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: surfaceTexture(floorSurface[room.kind] ?? "stone", textures),
        roughness: 0.82,
        metalness: 0,
      }),
    );
    mesh.receiveShadow = true;
    mesh.userData.roomId = room.id;
    runtime.roomMeshes.set(room.id, mesh);
    runtime.content.add(mesh);
    const label = labelSprite(room.shortName);
    runtime.roomLabels.set(room.id, label);
    const at = planToWorld(room.label, floor.center, 0.35);
    label.position.set(at.x, at.y, at.z);
    runtime.content.add(label);
  }
  const bounds = planBounds(floor.outline);
  const plinth = new THREE.Mesh(
    roundedBox(
      bounds.maxX - bounds.minX + PLINTH_OVERHANG,
      PLINTH_HEIGHT,
      bounds.maxZ - bounds.minZ + PLINTH_OVERHANG,
      0.12,
    ),
    new THREE.MeshStandardMaterial({
      color: scenePalette.plinth,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  plinth.position.set(0, -PLINTH_HEIGHT / 2, 0);
  plinth.receiveShadow = true;
  runtime.content.add(plinth);

  const wallBody = new THREE.MeshStandardMaterial({
    color: scenePalette.wallBody,
    roughness: 0.95,
  });
  const wallCap = new THREE.MeshStandardMaterial({
    color: scenePalette.wallCap,
    roughness: 0.8,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: scenePalette.windowFrame,
    roughness: 0.6,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: scenePalette.glass,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    emissive: new THREE.Color(scenePalette.glassEmissive),
    emissiveIntensity: 0.5,
  });
  for (const piece of wallPieces(floor.outline, floor.lines, {
    exteriorHeight: wallHeight,
    facing: cameraFacing(cameraMode),
  })) {
    const a = planToWorld(piece.from, floor.center, FLOOR_THICKNESS);
    const b = planToWorld(piece.to, floor.center, FLOOR_THICKNESS);
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (span < 0.01) continue;
    // Close corners and meet partitions by half a wall thickness at each end.
    const length = span + piece.thickness;
    const rotation = -Math.atan2(b.z - a.z, b.x - a.x);
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    const bodyHeight = Math.max(0.01, piece.height - WALL_CAP_HEIGHT);
    const glazing = piece.kind === "window";
    // RoundedBoxGeometry keeps BoxGeometry's indexed material groups, so the
    // body and the dark architectural cap are separate single-material meshes.
    const wall = new THREE.Mesh(
      roundedBox(
        length,
        bodyHeight,
        piece.thickness,
        Math.min(0.02, piece.thickness * 0.2),
      ),
      glazing ? glassMaterial : wallBody,
    );
    wall.position.set(x, FLOOR_THICKNESS + bodyHeight / 2, z);
    wall.rotation.y = rotation;
    wall.castShadow = !glazing;
    wall.receiveShadow = !glazing;
    runtime.content.add(wall);
    const cap = new THREE.Mesh(
      roundedBox(
        length,
        WALL_CAP_HEIGHT,
        piece.thickness + 0.012,
        Math.min(0.01, piece.thickness * 0.1),
      ),
      glazing ? frameMaterial : wallCap,
    );
    cap.position.set(
      x,
      FLOOR_THICKNESS + piece.height - WALL_CAP_HEIGHT / 2,
      z,
    );
    cap.rotation.y = rotation;
    cap.castShadow = true;
    cap.receiveShadow = true;
    runtime.content.add(cap);
  }
  addFurniture(
    {
      content: runtime.content,
      invalidate: () => runtime.invalidate(),
      isDisposed: () => runtime.disposed,
      refreshShadows: () => {
        runtime.renderer.shadowMap.needsUpdate = true;
      },
    },
    floor,
  );
  fitKeyLight(runtime, floor);
  runtime.rebuilds++;
  runtime.builtKey = JSON.stringify([floor, wallHeight, cameraMode]);
  // Static geometry: draw the shadow map once instead of every frame.
  runtime.renderer.shadowMap.needsUpdate = true;
}

function updateMarkers(
  runtime: Runtime,
  floor: SceneFloor,
  markers: SceneMarker[],
) {
  const changes = syncMarkers(
    runtime.content,
    runtime.markerNodes,
    floor,
    markers,
    labelSprite,
  );
  for (const key of ["created", "updated", "removed"] as const)
    runtime.markerChanges[key] += changes[key];
  return changes.created + changes.updated + changes.removed > 0;
}

function frameCamera(
  runtime: Runtime,
  floor: SceneFloor,
  selectedRoomId: string | null = null,
  wallHeight = 0,
) {
  const room = floor.rooms.find((item) => item.id === selectedRoomId);
  const top =
    FLOOR_THICKNESS +
    Math.max(
      wallHeight,
      tallestFurniture(floor.furniture.map((item) => item.variant)),
    );
  // Framing must not depend on camera-relative label offsets from a previous orbit.
  const bounds = new THREE.Box3().setFromPoints(
    (room?.polygon ?? floor.outline).flatMap((point) =>
      [-PLINTH_HEIGHT, top].map((y) => {
        const at = planToWorld(point, floor.center, y);
        return new THREE.Vector3(at.x, at.y, at.z);
      }),
    ),
  );
  if (!room)
    bounds.expandByVector(
      new THREE.Vector3(PLINTH_OVERHANG / 2, 0, PLINTH_OVERHANG / 2),
    );
  const target = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(0, 0.85, 0.75).normalize();
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(direction).normalize();
  const right = new THREE.Vector3().crossVectors(up, direction);
  const tanVertical =
    Math.tan(THREE.MathUtils.degToRad(runtime.camera.fov / 2)) *
    Math.max(0.4, 1 - 64 / runtime.renderer.domElement.clientHeight);
  const tanHorizontal =
    Math.tan(THREE.MathUtils.degToRad(runtime.camera.fov / 2)) *
    runtime.camera.aspect *
    Math.max(0.4, 1 - 110 / runtime.renderer.domElement.clientWidth);
  let distance = Math.max(2, floor.extent / 2);
  // Fit every box corner in the perspective frustum, including the near edge.
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).sub(target);
        const depth = point.dot(direction);
        distance = Math.max(
          distance,
          depth + Math.abs(point.dot(right)) / tanHorizontal,
          depth + Math.abs(point.dot(up)) / tanVertical,
        );
      }
  distance *= 1.12;
  runtime.camera.position.copy(target).addScaledVector(direction, distance);
  runtime.controls.target.copy(target);
  runtime.controls.minDistance = 2;
  runtime.controls.maxDistance = Math.max(distance * 2.5, floor.extent * 4);
  runtime.controls.update();
}

/** Bounds include rendered wall thickness/height and marker anchors, not labels. */
function frameScene(
  runtime: Runtime,
  floor: SceneFloor,
  roomId: string | null = null,
  animate = false,
  reset = false,
  wallHeight = 0,
) {
  if (!runtime.model) {
    frameCamera(runtime, floor, roomId, wallHeight);
    return;
  }
  const room = floor.rooms.find((item) => item.id === roomId);
  const points = (room?.polygon ?? floor.outline).map((point) =>
    planToWorld(point, floor.center),
  );
  const pad = room ? 0.04 : PLINTH_OVERHANG / 2 + 0.04;
  const min: Point3 = [
    Math.min(...points.map((p) => p.x)) - pad,
    room ? 0 : -PLINTH_HEIGHT,
    Math.min(...points.map((p) => p.z)) - pad,
  ];
  const max: Point3 = [
    Math.max(...points.map((p) => p.x)) + pad,
    Math.max(
      0.9,
      FLOOR_THICKNESS +
        Math.max(
          wallHeight,
          tallestFurniture(floor.furniture.map((item) => item.variant)),
        ),
    ),
    Math.max(...points.map((p) => p.z)) + pad,
  ];
  runtime.model.setBounds({ min, max }, reset, animate, performance.now());
}

/** Billboards retain a readable pixel size during orbit/zoom; spatial positions stay in meters. */
function sizeLabels(runtime: Runtime) {
  const height = runtime.renderer.domElement.clientHeight;
  if (!height) return;
  const camera = runtime.camera;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const factor =
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
  for (const node of runtime.markerNodes.values()) {
    const depth = node.group.position
      .clone()
      .sub(camera.position)
      .dot(direction);
    const pixel = Math.max(0.001, depth * factor);
    node.pin.scale.setScalar((pixel * 10) / 0.22);
    node.label.position.copy(up).multiplyScalar(pixel * 29);
  }
  runtime.content.traverse((object) => {
    const sprite = object as THREE.Sprite;
    if (!sprite.isSprite) return;
    const scale = factor * Number(sprite.userData.pixelHeight);
    sprite.scale.set(scale * 4, scale, 1);
  });
  runtime.content.updateMatrixWorld(true);
  const width = runtime.renderer.domElement.clientWidth;
  const pins = [...runtime.markerNodes].map(([key, node]) => {
    const at = node.group.position.clone().project(camera);
    return { key, x: ((at.x + 1) * width) / 2, y: ((1 - at.y) * height) / 2 };
  });
  const layout = layoutMarkerLabels(pins, width, height);
  for (const pin of pins) {
    const node = runtime.markerNodes.get(pin.key)!;
    const label = layout.get(pin.key)!;
    node.label.visible = label.visible;
    const pixel = Math.max(
      0.001,
      node.group.position.clone().sub(camera.position).dot(direction) * factor,
    );
    node.label.position
      .copy(right)
      .multiplyScalar((label.x - pin.x) * pixel)
      .addScaledVector(up, (pin.y - label.y) * pixel);
  }
  runtime.content.updateMatrixWorld(true);
  const rectangle = (sprite: THREE.Sprite) => {
    const at = sprite.getWorldPosition(new THREE.Vector3()).project(camera);
    const h = Number(sprite.userData.pixelHeight);
    return {
      x: ((at.x + 1) * width) / 2,
      y: ((1 - at.y) * height) / 2,
      w: h * 4,
      h,
    };
  };
  const markers = [...layout.values()].filter((label) => label.visible);
  for (const sprite of runtime.roomLabels.values()) {
    const room = rectangle(sprite);
    sprite.visible = ![
      ...markers,
      ...pins.map((pin) => ({ ...pin, w: 20, h: 20 })),
    ].some((marker) => overlaps(marker, room));
  }
}

export default function CockpitScene(props: CockpitSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef(props);
  // Layout effects run before the effects below, so they always read current props.
  useLayoutEffect(() => {
    latest.current = props;
  });

  // Create the renderer once per mount; tear everything down on unmount.
  useEffect(() => {
    const started = performance.now();
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2", {
        antialias: true,
        powerPreference: "low-power",
      });
      if (!context) {
        void latest.current.onSceneError("webgl_unavailable");
        return;
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      void latest.current.onSceneError("init_failed");
      return;
    }
    rendererCreated();
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Static house: redraw shadow maps on rebuild, never per frame.
    renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(scenePalette.stage);
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x2a2521, 0.6));
    const keyLight = new THREE.DirectionalLight(0xfff2e0, 2.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.03;
    scene.add(keyLight, keyLight.target);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    const content = new THREE.Group();
    scene.add(content);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; // damping needs a continuous loop; we render on demand
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.screenSpacePanning = false;

    const r: Runtime = {
      model: null,
      renderer,
      scene,
      keyLight,
      camera,
      controls,
      content,
      roomMeshes: new Map(),
      roomLabels: new Map(),
      markerNodes: new Map(),
      markerChanges: { created: 0, updated: 0, removed: 0 },
      selectionKey: null,
      stats: new FrameStats(),
      frameRequested: null,
      visible: latest.current.visible && !document.hidden,
      rebuilds: 0,
      builtKey: null,
      contextLosses: 0,
      readyMs: null,
      teardown: null,
      disposed: false,
      listenersActive: 0,
      controlsDisposed: false,
      observerDisconnected: false,
      invalidate: () => {
        if (!r.visible || r.disposed || r.frameRequested !== null) return;
        r.frameRequested = requestAnimationFrame((now) => {
          r.frameRequested = null;
          if (!r.visible || r.disposed) return;
          let animating = false;
          try {
            animating = r.model?.tick(now) ?? false;
            sizeLabels(r);
            renderer.render(scene, camera);
            rendererFrame();
          } catch {
            void latest.current.onSceneError("runtime_error");
            return;
          }
          r.stats.frame(now, r.visible);
          if (animating) r.invalidate();
          if (r.readyMs === null) {
            r.readyMs = Math.round(performance.now() - started);
            void latest.current.onSceneReady();
            void latest.current.onMetrics(r.metrics());
          }
        });
      },
      syncVisibility: () => undefined,
      metrics: () => ({
        readyMs: r.readyMs,
        ...r.stats.report(performance.now()),
        rebuilds: r.rebuilds,
        memory: {
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        contextLosses: r.contextLosses,
      }),
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (latest.current.cameraMode === "model")
      r.model = new ModelCameraController(
        camera,
        controls,
        () => motion.matches,
        r.invalidate,
      );
    runtime.current = r;
    // Read-only bounded instrumentation for the feasibility lab. No renderer,
    // connection, arbitrary evaluation API or raw entity data is exposed.
    Object.defineProperty(element, "sceneProbe", {
      configurable: true,
      get: () => {
        const rect = renderer.domElement.getBoundingClientRect();
        const project = (p: { x: number; y: number; z: number }) => {
          const at = new THREE.Vector3(p.x, p.y, p.z).project(camera);
          return {
            x: ((at.x + 1) * rect.width) / 2,
            y: ((1 - at.y) * rect.height) / 2,
          };
        };
        const bounds = planBounds(latest.current.floor.outline);
        let outsideFloor: { x: number; y: number } | null = null;
        for (let x = 1; x < 4 && !outsideFloor; x++)
          for (let z = 1; z < 4 && !outsideFloor; z++) {
            const point = {
              x: bounds.minX + ((bounds.maxX - bounds.minX) * x) / 4,
              z: bounds.minZ + ((bounds.maxZ - bounds.minZ) * z) / 4,
            };
            if (!pointInPolygon(point, latest.current.floor.outline))
              outsideFloor = project(
                planToWorld(point, latest.current.floor.center, 0.06),
              );
          }
        return {
          ...r.metrics(),
          lifecycle: rendererLifecycle(),
          visible: r.visible,
          pendingFrame: r.frameRequested !== null,
          disposed: r.disposed,
          teardown: r.teardown,
          listenersActive: r.listenersActive,
          controlsDisposed: r.controlsDisposed,
          observerDisconnected: r.observerDisconnected,
          contentObjects: content.children.length,
          markerChanges: { ...r.markerChanges },
          camera: {
            position: camera.position.toArray(),
            target: controls.target.toArray(),
          },
          animatedCamera:
            controls.enableDamping ||
            controls.autoRotate ||
            (r.model?.probe.animating ?? false),
          modelCamera: r.model?.probe ?? null,
          selection: latest.current.selectedRoomId,
          size: { width: rect.width, height: rect.height },
          floorCorners: latest.current.floor.outline.map((point) =>
            project(planToWorld(point, latest.current.floor.center, 0.06)),
          ),
          outsideFloor,
          rooms: latest.current.floor.rooms.map((room) => ({
            id: room.id,
            ...project(
              planToWorld(room.label, latest.current.floor.center, 0.06),
            ),
          })),
          markers: latest.current.markers.map((marker) => ({
            key: marker.key,
            condition: marker.condition,
            icon: marker.icon,
            geometry: r.markerNodes.get(marker.key)?.pin.geometry.id,
            material: r.markerNodes.get(marker.key)?.pin.material.uuid,
            color: r.markerNodes
              .get(marker.key)
              ?.pin.material.color.getHexString(),
            labelTexture: r.markerNodes.get(marker.key)?.label.material.map?.id,
            ...project(
              planToWorld(marker.position, latest.current.floor.center, 0.9),
            ),
          })),
        };
      },
    });
    const changed = () => {
      r.model?.orbitChanged();
      r.invalidate();
    };
    const manual = () => r.model?.finish();
    const motionChanged = () => {
      if (motion.matches) r.model?.finish();
    };
    controls.addEventListener("change", changed);
    controls.addEventListener("start", manual);
    motion.addEventListener("change", motionChanged);

    const resize = () => {
      const { clientWidth, clientHeight } = element;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      if (r.model) r.model.resize(clientWidth, clientHeight);
      else
        frameCamera(
          r,
          latest.current.floor,
          latest.current.selectedRoomId,
          latest.current.wallHeight,
        );
      r.invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    // Tap vs orbit: decided from the whole gesture, never from pointerdown alone.
    const pointers = new Set<number>();
    const pinchPoints = new Map<number, { x: number; y: number }>();
    let pinchDistance: number | null = null;
    let gesture: {
      x: number;
      y: number;
      t: number;
      max: number;
      distance: number;
    } | null = null;
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06);
    const down = (event: PointerEvent) => {
      if (!r.visible) return;
      pointers.add(event.pointerId);
      pinchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchPoints.size > 1) r.model?.finish();
      if (pointers.size === 1) {
        gesture = {
          x: event.clientX,
          y: event.clientY,
          t: performance.now(),
          max: 1,
          distance: 0,
        };
        r.stats.beginInteraction(performance.now());
      } else if (gesture) gesture.max = Math.max(gesture.max, pointers.size);
    };
    const move = (event: PointerEvent) => {
      if (pinchPoints.has(event.pointerId))
        pinchPoints.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
      if (r.visible && r.model && pinchPoints.size === 2) {
        const [a, b] = [...pinchPoints.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinchDistance && distance > 0)
          r.model.zoom(pinchDistance / distance);
        pinchDistance = distance;
      }
      if (gesture)
        gesture.distance = Math.max(
          gesture.distance,
          Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y),
        );
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinchPoints.delete(event.pointerId);
      pinchDistance = null;
      if (pointers.size || !gesture) return;
      const kind = classifyGesture({
        dx: event.clientX - gesture.x,
        dy: event.clientY - gesture.y,
        durationMs: performance.now() - gesture.t,
        maxPointers: gesture.max,
        maxDistance: gesture.distance,
      });
      gesture = null;
      r.stats.endInteraction(performance.now());
      void latest.current.onMetrics(r.metrics());
      if (kind !== "tap" || !r.visible) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster.intersectObjects(
        [...r.markerNodes.values()].map((node) => node.group),
        true,
      )[0];
      const key = hit?.object.userData.markerKey as string | undefined;
      if (key) {
        void latest.current.onMarkerPress(key);
        return;
      }
      const point = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      if (!point) return;
      const roomId = pickRoomAt(
        worldToPlan(point, latest.current.floor.center),
        latest.current.floor,
      );
      if (roomId) void latest.current.onRoomPress(roomId);
      else if (r.model) void latest.current.onOverview?.();
    };
    const cancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinchPoints.delete(event.pointerId);
      pinchDistance = null;
      if (!pointers.size) {
        gesture = null;
        r.stats.endInteraction(performance.now());
      }
    };
    const wheel = (event: WheelEvent) => {
      if (!r.model || !r.visible || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      r.model.zoom(
        Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
      );
    };
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointercancel", cancel);

    const lost = (event: Event) => {
      event.preventDefault();
      r.contextLosses++;
      r.model?.dispose();
      if (r.frameRequested !== null) cancelAnimationFrame(r.frameRequested);
      r.frameRequested = null;
      void latest.current.onSceneError("context_lost");
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const failed = () => void latest.current.onSceneError("runtime_error");
    window.addEventListener("error", failed);
    window.addEventListener("unhandledrejection", failed);
    const visibility = () => {
      r.visible = latest.current.visible && !document.hidden;
      if (!r.visible) {
        if (r.frameRequested !== null) cancelAnimationFrame(r.frameRequested);
        r.frameRequested = null;
        pointers.clear();
        pinchPoints.clear();
        pinchDistance = null;
        r.model?.finish();
        gesture = null;
        r.stats.endInteraction(performance.now());
      } else r.invalidate();
    };
    r.syncVisibility = visibility;
    document.addEventListener("visibilitychange", visibility);
    r.listenersActive = 11;

    try {
      buildFloor(
        r,
        latest.current.floor,
        latest.current.wallHeight,
        latest.current.cameraMode ?? "orbit",
      );
      updateMarkers(r, latest.current.floor, latest.current.markers);
      frameScene(
        r,
        latest.current.floor,
        latest.current.selectedRoomId,
        false,
        false,
        latest.current.wallHeight,
      );
      resize();
    } catch {
      void latest.current.onSceneError("init_failed");
    }

    return () => {
      if (r.frameRequested !== null) cancelAnimationFrame(r.frameRequested);
      r.frameRequested = null;
      r.disposed = true;
      r.model?.dispose();
      observer.disconnect();
      r.observerDisconnected = true;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("error", failed);
      window.removeEventListener("unhandledrejection", failed);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("wheel", wheel);
      motion.removeEventListener("change", motionChanged);
      controls.removeEventListener("start", manual);
      controls.removeEventListener("change", changed);
      controls.dispose();
      r.controlsDisposed = true;
      r.listenersActive = 0;
      r.teardown = disposeGroup(content);
      r.roomMeshes.clear();
      r.roomLabels.clear();
      r.markerNodes.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      rendererDisposed();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, []);

  // Geometry changes rebuild the floor (and prove disposal via renderer.info).
  const {
    floor,
    wallHeight,
    markers,
    selectedRoomId,
    resetKey,
    visible,
    simulate,
    cameraMode,
  } = props;
  useEffect(() => {
    const r = runtime.current;
    const mode = cameraMode ?? "orbit";
    if (!r || r.builtKey === JSON.stringify([floor, wallHeight, mode])) return;
    buildFloor(r, floor, wallHeight, mode);
    updateMarkers(r, floor, latest.current.markers);
    frameScene(r, floor, null, false, true, wallHeight);
    r.invalidate();
    // Markers/selection have their own effects; a floor change implies both.
  }, [floor, wallHeight, cameraMode]);

  useEffect(() => {
    const r = runtime.current;
    if (r && updateMarkers(r, latest.current.floor, markers)) r.invalidate();
  }, [markers]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const key = JSON.stringify([r.builtKey, selectedRoomId, resetKey]);
    if (r.selectionKey === key) return;
    r.selectionKey = key;
    for (const [id, mesh] of r.roomMeshes) {
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(
        id === selectedRoomId ? SELECTED_FLOOR_COLOR : 0xffffff,
      );
    }
    // Orbit stays instant; model transitions run only until their target is reached.
    frameScene(
      r,
      latest.current.floor,
      selectedRoomId,
      true,
      selectedRoomId === null,
      latest.current.wallHeight,
    );
    r.invalidate();
  }, [selectedRoomId, resetKey, floor]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.syncVisibility();
    void latest.current.onMetrics(r.metrics());
  }, [visible]);

  useEffect(() => {
    if (simulate !== "context_loss") return;
    runtime.current?.renderer.forceContextLoss();
  }, [simulate]);

  return (
    <div
      ref={host}
      data-s01-scene
      data-camera-mode={props.cameraMode ?? "orbit"}
      tabIndex={
        props.cameraMode === "model" && props.interactive !== false
          ? 0
          : undefined
      }
      aria-label={
        props.cameraMode === "model"
          ? "House model. Left and right arrows rotate. Escape shows the whole floor."
          : undefined
      }
      onKeyDown={(event) => {
        const r = runtime.current;
        if (
          event.target !== event.currentTarget ||
          event.defaultPrevented ||
          !r?.model ||
          !r.visible
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          r.model.rotate(
            ((event.key === "ArrowLeft" ? -1 : 1) * 5 * Math.PI) / 180,
          );
        } else if (event.key === "Escape") {
          event.preventDefault();
          void latest.current.onOverview?.();
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: scenePalette.stage,
        outlineOffset: -3,
      }}
    />
  );
}
