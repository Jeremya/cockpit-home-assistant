"use dom";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { DOMProps } from "expo/dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { colors } from "../theme";
import { syncMarkers, type MarkerNodes } from "./sceneMarkers";
import { disposeGroup } from "./sceneResources";
import { layoutMarkerLabels, overlaps } from "./labelLayout";
import { planBounds, pointInPolygon } from "../spatial/model";
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

const roomColors: Record<string, number> = {
  living: 0x2f4a50,
  kitchen: 0x4a3f3a,
  bedroom: 0x3d3a57,
  bathroom: 0x2d4a5e,
  storage: 0x3d4352,
  circulation: 0x2c3646,
};
const selectedColor = 0x3f6694;

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
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
  context.fillStyle = "#e5e9f2";
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

function buildFloor(runtime: Runtime, floor: SceneFloor, wallHeight: number) {
  disposeGroup(runtime.content);
  runtime.roomMeshes.clear();
  runtime.roomLabels.clear();
  runtime.markerNodes.clear();
  runtime.selectionKey = null;
  for (const room of floor.rooms) {
    const shape = new THREE.Shape(
      room.polygon.map(
        (p) => new THREE.Vector2(p.x - floor.center.x, p.z - floor.center.z),
      ),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2); // shape (x, z) → world (x, 0, −z)
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: roomColors[room.kind] ?? 0x333846,
      }),
    );
    mesh.userData.roomId = room.id;
    runtime.roomMeshes.set(room.id, mesh);
    runtime.content.add(mesh);
    const label = labelSprite(room.shortName);
    runtime.roomLabels.set(room.id, label);
    const at = planToWorld(room.label, floor.center, 0.35);
    label.position.set(at.x, at.y, at.z);
    runtime.content.add(label);
  }
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbc3d0 });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x7cc4ff,
    transparent: true,
    opacity: 0.7,
  });
  for (const line of floor.lines) {
    if (line.kind === "step") continue;
    const a = planToWorld(line.from, floor.center);
    const b = planToWorld(line.to, floor.center);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;
    const height = line.kind === "window" ? wallHeight * 0.6 : wallHeight;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(
        length,
        height,
        line.kind === "window" ? 0.05 : 0.08,
      ),
      line.kind === "window" ? windowMaterial : wallMaterial,
    );
    wall.position.set((a.x + b.x) / 2, height / 2 + 0.06, (a.z + b.z) / 2);
    wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    runtime.content.add(wall);
  }
  runtime.rebuilds++;
  runtime.builtKey = JSON.stringify([floor, wallHeight]);
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
) {
  const room = floor.rooms.find((item) => item.id === selectedRoomId);
  // Framing must not depend on camera-relative label offsets from a previous orbit.
  const bounds = new THREE.Box3().setFromPoints(
    (room?.polygon ?? floor.outline).flatMap((point) =>
      [0, 1.5].map((y) => {
        const at = planToWorld(point, floor.center, y);
        return new THREE.Vector3(at.x, at.y, at.z);
      }),
    ),
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
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.background);
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a1f2b, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(4, 10, 6);
    scene.add(sun);
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
      renderer,
      scene,
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
          try {
            sizeLabels(r);
            renderer.render(scene, camera);
          } catch {
            void latest.current.onSceneError("runtime_error");
            return;
          }
          r.stats.frame(now, r.visible);
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
          animatedCamera: controls.enableDamping || controls.autoRotate,
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
    controls.addEventListener("change", r.invalidate);

    const resize = () => {
      const { clientWidth, clientHeight } = element;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      frameCamera(r, latest.current.floor, latest.current.selectedRoomId);
      r.invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    // Tap vs orbit: decided from the whole gesture, never from pointerdown alone.
    const pointers = new Set<number>();
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
      if (gesture)
        gesture.distance = Math.max(
          gesture.distance,
          Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y),
        );
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
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
    };
    const cancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (!pointers.size) {
        gesture = null;
        r.stats.endInteraction(performance.now());
      }
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointercancel", cancel);

    const lost = (event: Event) => {
      event.preventDefault();
      r.contextLosses++;
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
        gesture = null;
        r.stats.endInteraction(performance.now());
      } else r.invalidate();
    };
    r.syncVisibility = visibility;
    document.addEventListener("visibilitychange", visibility);
    r.listenersActive = 8;

    try {
      buildFloor(r, latest.current.floor, latest.current.wallHeight);
      updateMarkers(r, latest.current.floor, latest.current.markers);
      frameCamera(r, latest.current.floor, latest.current.selectedRoomId);
      resize();
    } catch {
      void latest.current.onSceneError("init_failed");
    }

    return () => {
      if (r.frameRequested !== null) cancelAnimationFrame(r.frameRequested);
      r.frameRequested = null;
      r.disposed = true;
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
      controls.removeEventListener("change", r.invalidate);
      controls.dispose();
      r.controlsDisposed = true;
      r.listenersActive = 0;
      r.teardown = disposeGroup(content);
      r.roomMeshes.clear();
      r.roomLabels.clear();
      r.markerNodes.clear();
      renderer.dispose();
      renderer.forceContextLoss();
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
  } = props;
  useEffect(() => {
    const r = runtime.current;
    if (!r || r.builtKey === JSON.stringify([floor, wallHeight])) return;
    buildFloor(r, floor, wallHeight);
    updateMarkers(r, floor, latest.current.markers);
    frameCamera(r, floor);
    r.invalidate();
    // Markers/selection have their own effects; a floor change implies both.
  }, [floor, wallHeight]);

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
      const room = latest.current.floor.rooms.find((item) => item.id === id);
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(
        id === selectedRoomId
          ? selectedColor
          : (roomColors[room?.kind ?? ""] ?? 0x333846),
      );
    }
    // Instant framing, no auto-rotation or damping: reduced motion is honored by design.
    frameCamera(r, latest.current.floor, selectedRoomId);
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
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: colors.background,
      }}
    />
  );
}
