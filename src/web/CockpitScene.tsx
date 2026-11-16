"use dom";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { DOMProps } from "expo/dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ModelCameraController } from "./ModelCameraController";
import { fitCameraToPoints, MODEL_FILL } from "./modelCamera";
import { colors } from "../theme";
import {
  MARKER_STEM_LENGTH,
  syncMarkers,
  type MarkerNodes,
} from "./sceneMarkers";
import {
  rendererCreated,
  rendererDisposed,
  rendererFrame,
  rendererLifecycle,
} from "./rendererLifecycle";
import { disposeGroup } from "./sceneResources";
import { labelLeader, layoutMarkerLabels, overlaps } from "./labelLayout";
import { planBounds, pointInPolygon } from "../spatial/model";
import {
  cameraFacing,
  FLOOR_THICKNESS,
  FLOOR_TILE_METRES,
  floorSurface,
  floorSurfaceColor,
  KEY_LIGHT_DIRECTION,
  PLINTH_HEIGHT,
  PLINTH_OVERHANG,
  SCENE_CORNER_RADIUS,
  scenePalette,
  selectionAccent,
  WALL_CAP_HEIGHT,
  type FloorSurface,
} from "./sceneStyle";
import { wallPieces } from "./sceneWalls";
import { addFurniture } from "./furnitureScene";
import {
  groundPool,
  plinthOcclusion,
  seeded,
  selectionLine,
  stageBackdrop,
  windowDaylight,
} from "./sceneAtmosphere";
import { sceneSilhouette } from "./sceneFraming";
import { markerLabel, roomLabel } from "./sceneLabels";
import { MARKER_HEAD_RADIUS, MARKER_HEIGHT } from "./markerStyle";
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

/** Visible keyboard focus in the cockpit accent with a dark inner keyline. */
const focusRingCss = `[data-s01-scene] > [data-scene-focus-ring]{position:absolute;inset:0;z-index:1;border-radius:${SCENE_CORNER_RADIUS}px;pointer-events:none;opacity:0;box-shadow:inset 0 0 0 2px ${colors.accent},inset 0 0 0 4px rgba(6,9,15,0.85)}[data-s01-scene]:focus-visible > [data-scene-focus-ring]{opacity:1}`;

/** The compact view keeps its free orbit; only its opening pose is fitted. */
const ORBIT_ELEVATION = Math.atan2(0.85, 0.75);
/**
 * A narrow lens keeps the walls of the miniature upright in the orbit view,
 * close to the model view's 26°. The far plane leaves room for the longer
 * fitted distance of a large floor zoomed all the way out.
 */
const ORBIT_FOV = 30;
const ORBIT_FAR = 1000;
/** Camera-space head radius kept clear of labels, plus a hairline of air. */
const HEAD_CLEARANCE = MARKER_HEAD_RADIUS * 1.3;

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
    .set(...KEY_LIGHT_DIRECTION)
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
  backdrop: THREE.Texture | null;
  roomMeshes: Map<string, THREE.Mesh>;
  roomLabels: Map<string, THREE.Sprite>;
  selectionLine: THREE.Mesh | null;
  markerNodes: MarkerNodes;
  markerChanges: { created: number; updated: number; removed: number };
  /** Last label layout in canvas pixels; read by the verification probe only. */
  labelLayout: {
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    visible: boolean;
  }[];
  /** Share of the canvas the fitted silhouette covers in the orbit view. */
  orbitShare: { width: number; height: number } | null;
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
  runtime.selectionLine = null;
  runtime.selectionKey = null;
  runtime.labelLayout = [];
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
    const surface = floorSurface[room.kind] ?? "stone";
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: surfaceTexture(surface, textures),
        roughness: 0.82,
        metalness: 0,
      }),
    );
    mesh.receiveShadow = true;
    mesh.userData.roomId = room.id;
    runtime.roomMeshes.set(room.id, mesh);
    runtime.content.add(mesh);
    const label = roomLabel(room.shortName);
    runtime.roomLabels.set(room.id, label);
    const at = planToWorld(room.label, floor.center, 0.35);
    label.position.set(at.x, at.y, at.z);
    runtime.content.add(label);
  }
  // Painted grounding: pool of light and contact shadow under the plinth,
  // soft occlusion where the house meets it.
  runtime.content.add(groundPool(floor), plinthOcclusion(floor));
  const daylight = windowDaylight(floor);
  if (daylight) runtime.content.add(daylight);
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

  // The envelope is static, so each material is drawn once: bodies, their
  // dark caps, glazing and its frame are merged into one mesh apiece.
  // (RoundedBoxGeometry keeps BoxGeometry's material groups, so a body and
  // its cap can never share one multi-material geometry.)
  const walls = {
    body: [] as THREE.BufferGeometry[],
    cap: [] as THREE.BufferGeometry[],
    glass: [] as THREE.BufferGeometry[],
    frame: [] as THREE.BufferGeometry[],
  };
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
    walls[glazing ? "glass" : "body"].push(
      roundedBox(
        length,
        bodyHeight,
        piece.thickness,
        Math.min(0.02, piece.thickness * 0.2),
      )
        .rotateY(rotation)
        .translate(x, FLOOR_THICKNESS + bodyHeight / 2, z),
    );
    walls[glazing ? "frame" : "cap"].push(
      roundedBox(
        length,
        WALL_CAP_HEIGHT,
        piece.thickness + 0.012,
        Math.min(0.01, piece.thickness * 0.1),
      )
        .rotateY(rotation)
        .translate(x, FLOOR_THICKNESS + piece.height - WALL_CAP_HEIGHT / 2, z),
    );
  }
  const wallMaterial: Record<keyof typeof walls, () => THREE.Material> = {
    body: () =>
      new THREE.MeshStandardMaterial({
        color: scenePalette.wallBody,
        roughness: 0.95,
      }),
    cap: () =>
      new THREE.MeshStandardMaterial({
        color: scenePalette.wallCap,
        roughness: 0.8,
      }),
    frame: () =>
      new THREE.MeshStandardMaterial({
        color: scenePalette.windowFrame,
        roughness: 0.6,
      }),
    glass: () =>
      new THREE.MeshStandardMaterial({
        color: scenePalette.glass,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        emissive: new THREE.Color(scenePalette.glassEmissive),
        emissiveIntensity: 0.5,
      }),
  };
  for (const part of ["body", "cap", "glass", "frame"] as const) {
    const pieces = walls[part];
    if (!pieces.length) continue;
    const merged = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, wallMaterial[part]());
    mesh.castShadow = part !== "glass";
    mesh.receiveShadow = part !== "glass";
    runtime.content.add(mesh);
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
    markerLabel,
  );
  for (const key of ["created", "updated", "removed"] as const)
    runtime.markerChanges[key] += changes[key];
  return changes.created + changes.updated + changes.removed > 0;
}

/**
 * Room selection is an accent, not a repaint: the selected floor keeps its
 * material and gains a faint glow and a perimeter line of accent light, while
 * the other rooms recede. The floor, walls and furniture are never rebuilt.
 */
function highlightRoom(
  runtime: Runtime,
  floor: SceneFloor,
  selectedRoomId: string | null,
) {
  const room = floor.rooms.find((item) => item.id === selectedRoomId);
  for (const [id, mesh] of runtime.roomMeshes) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const selected = id === room?.id;
    material.color.setScalar(room && !selected ? selectionAccent.othersDim : 1);
    material.emissive.set(selected ? colors.accent : "#000000");
    material.emissiveIntensity = selected ? selectionAccent.floorGlow : 0;
  }
  if (runtime.selectionLine) {
    runtime.content.remove(runtime.selectionLine);
    runtime.selectionLine.geometry.dispose();
    (runtime.selectionLine.material as THREE.Material).dispose();
    runtime.selectionLine = null;
  }
  if (!room) return;
  runtime.selectionLine = selectionLine(room, floor, colors.accent);
  if (runtime.selectionLine) runtime.content.add(runtime.selectionLine);
}

/** Opening pose of the free-orbit (compact) view; the user owns it afterwards. */
function frameCamera(
  runtime: Runtime,
  floor: SceneFloor,
  selectedRoomId: string | null = null,
  wallHeight = 0,
) {
  const canvas = runtime.renderer.domElement;
  // Framing must not depend on camera-relative label offsets from a previous orbit.
  const silhouette = sceneSilhouette(floor, {
    wallHeight,
    cameraMode: "orbit",
    roomId: selectedRoomId,
  });
  const fit = fitCameraToPoints({
    points: silhouette.points,
    viewport: {
      width: canvas.clientWidth || 1,
      height: canvas.clientHeight || 1,
    },
    yaw: 0,
    elevation: ORBIT_ELEVATION,
    fov: runtime.camera.fov,
    fill: MODEL_FILL,
  });
  if (!fit) return;
  runtime.orbitShare = fit.share;
  runtime.camera.position.fromArray(fit.position);
  runtime.controls.target.fromArray(fit.target);
  runtime.controls.minDistance = 2;
  runtime.controls.maxDistance = Math.max(
    fit.fitDistance * 2.5,
    floor.extent * 4,
  );
  runtime.controls.update();
}

/** Fits what is drawn (plinth, walls at their rendered height, furniture), not labels. */
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
  runtime.model.setBounds(
    sceneSilhouette(floor, { wallHeight, cameraMode: "model", roomId }),
    reset,
    animate,
    performance.now(),
  );
}

/** Small canvases get slightly smaller names so the model stays the subject. */
function labelScale(width: number, height: number) {
  return Math.min(1, Math.max(0.84, Math.min(width, height) / 360));
}

/**
 * Billboards and marker heads keep a constant, readable pixel size at every
 * camera distance; spatial positions stay in metres. Names take the nearest
 * free slot around their own head and are tied to it by a hairline.
 */
function sizeLabels(runtime: Runtime) {
  const canvas = runtime.renderer.domElement;
  const height = canvas.clientHeight;
  const width = canvas.clientWidth;
  if (!height || !width) return;
  const camera = runtime.camera;
  camera.updateMatrixWorld();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  // World units covered by one CSS pixel at depth 1.
  const factor =
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
  const ui = labelScale(width, height);
  const size = (sprite: THREE.Sprite, scale: number) => {
    const w = Number(sprite.userData.pixelWidth) * scale;
    const h = Number(sprite.userData.pixelHeight) * scale;
    sprite.scale.set(w * factor, h * factor, 1);
    return { w, h };
  };
  const screen = (world: THREE.Vector3) => {
    const at = world.clone().project(camera);
    return { x: ((at.x + 1) * width) / 2, y: ((1 - at.y) * height) / 2 };
  };
  const pins = [...runtime.markerNodes].map(([key, node]) => {
    const depth = node.group.position
      .clone()
      .sub(camera.position)
      .dot(direction);
    const pixel = Math.max(0.0001, depth * factor);
    node.head.scale.setScalar(pixel);
    node.head.quaternion.copy(camera.quaternion);
    // The stem keeps its world height and a constant on-screen thickness.
    const headWorld = HEAD_CLEARANCE * pixel;
    node.stem.position.y = -headWorld;
    node.stem.scale.set(
      pixel,
      Math.max(0.02, MARKER_STEM_LENGTH - headWorld),
      pixel,
    );
    size(node.glow, 1);
    return {
      key,
      node,
      pixel,
      ...screen(node.group.position),
      ...size(node.label, ui),
    };
  });
  const layout = layoutMarkerLabels(pins, width, height, {
    pin: HEAD_CLEARANCE * 2,
    gap: 5,
  });
  runtime.labelLayout = [];
  for (const pin of pins) {
    const { node, pixel } = pin;
    const placed = layout.get(pin.key)!;
    // Whole pixels keep the text of an even-sized label crisp.
    const label = {
      ...placed,
      x: Math.round(placed.x),
      y: Math.round(placed.y),
    };
    runtime.labelLayout.push({ key: pin.key, ...label });
    node.label.visible = label.visible;
    node.label.position
      .copy(right)
      .multiplyScalar((label.x - pin.x) * pixel)
      .addScaledVector(up, (pin.y - label.y) * pixel);
    const leader = label.visible
      ? labelLeader(pin, label, HEAD_CLEARANCE)
      : null;
    node.leader.visible = leader !== null;
    if (leader) {
      const dx = leader.to.x - leader.from.x;
      const dy = leader.to.y - leader.from.y;
      node.leader.position
        .copy(right)
        .multiplyScalar(((leader.from.x + leader.to.x) / 2 - pin.x) * pixel)
        .addScaledVector(
          up,
          (pin.y - (leader.from.y + leader.to.y) / 2) * pixel,
        );
      node.leader.scale.set(leader.length * factor, 1.25 * factor, 1);
      node.leader.material.rotation = Math.atan2(-dy, dx);
    }
  }
  const taken = [
    ...runtime.labelLayout.filter((label) => label.visible),
    ...pins.map((pin) => ({
      x: pin.x,
      y: pin.y,
      w: HEAD_CLEARANCE * 2,
      h: HEAD_CLEARANCE * 2,
    })),
  ];
  // A room name yields to any marker or device name it would touch.
  for (const sprite of runtime.roomLabels.values()) {
    const room = { ...screen(sprite.position), ...size(sprite, ui) };
    sprite.visible = !taken.some((other) => overlaps(other, room));
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
    // Softer penumbra from the same map and the same five samples.
    keyLight.shadow.radius = 2.4;
    scene.add(keyLight, keyLight.target);
    const camera = new THREE.PerspectiveCamera(ORBIT_FOV, 1, 0.1, ORBIT_FAR);
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
      backdrop: null,
      roomLabels: new Map(),
      selectionLine: null,
      labelLayout: [],
      orbitShare: null,
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
          // Counters of the last drawn frame; the shadow pass only runs on rebuild.
          render: {
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
          },
          fit: r.model?.probe.share ?? r.orbitShare,
          labels: r.labelLayout.map((label) => ({ ...label })),
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
            head: (["pin", "diamond", "ring"] as const).find(
              (part) => r.markerNodes.get(marker.key)?.[part].visible,
            ),
            geometry: r.markerNodes.get(marker.key)?.pin.geometry.id,
            material: r.markerNodes.get(marker.key)?.pin.material.uuid,
            color: r.markerNodes
              .get(marker.key)
              ?.pin.material.color.getHexString(),
            labelTexture: r.markerNodes.get(marker.key)?.label.material.map?.id,
            ...project(
              planToWorld(
                marker.position,
                latest.current.floor.center,
                MARKER_HEIGHT,
              ),
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
      // The ray also meets hidden parts: a crowded-out name must not be
      // tappable, while the invisible touch target around a head must be.
      const hit = raycaster
        .intersectObjects(
          [...r.markerNodes.values()].map((node) => node.group),
          true,
        )
        .find(
          (item) =>
            !(item.object as THREE.Sprite).isSprite || item.object.visible,
        );
      let owner: THREE.Object3D | null = hit?.object ?? null;
      while (owner && owner.userData.markerKey === undefined)
        owner = owner.parent;
      const key = owner?.userData.markerKey as string | undefined;
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
      // Painted once per renderer; a failure here is an ordinary init failure.
      r.backdrop = stageBackdrop();
      scene.background = r.backdrop;
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
      r.selectionLine = null;
      scene.background = null;
      r.backdrop?.dispose();
      r.backdrop = null;
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
    highlightRoom(r, latest.current.floor, selectedRoomId);
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
        borderRadius: SCENE_CORNER_RADIUS,
        outline: "none",
      }}
    >
      {/* Keyboard focus only (`:focus-visible`): a pointer press on the canvas
          draws nothing, and the ring follows the host's rounded shape. */}
      <style>{focusRingCss}</style>
      <div data-scene-focus-ring aria-hidden />
    </div>
  );
}
