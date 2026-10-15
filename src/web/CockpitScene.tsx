"use dom";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { DOMProps } from "expo/dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Condition } from "../core/types";
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
 * Feasibility scene (S01). Runs in the DOM webview's own JS runtime: it receives
 * JSON-safe geometry and sanitized markers only, renders on demand, and reports
 * selection, readiness, errors and metrics through top-level async callbacks.
 */
export interface CockpitSceneProps {
  floor: SceneFloor;
  markers: SceneMarker[];
  selectedRoomId: string | null;
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
const conditionColors: Record<Condition, number> = {
  normal: 0x8fa3ff,
  active: 0x5fd4a8,
  attention: 0xf6b26b,
  alert: 0xff6b6b,
  unavailable: 0x6b7280,
  unknown: 0xb38bd9,
  stale: 0x6b7280,
};

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  roomMeshes: Map<string, THREE.Mesh>;
  markerMeshes: THREE.Object3D[];
  stats: FrameStats;
  frameRequested: number | null;
  visible: boolean;
  rebuilds: number;
  builtKey: string | null;
  builtMarkers: SceneMarker[] | null;
  contextLosses: number;
  readyMs: number | null;
  invalidate: () => void;
  metrics: () => SceneMetrics;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as
      THREE.Material | THREE.Material[] | undefined;
    for (const item of Array.isArray(material)
      ? material
      : material
        ? [material]
        : []) {
      (item as THREE.MeshBasicMaterial).map?.dispose();
      item.dispose();
    }
  });
  group.clear();
}

function labelSprite(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.font = "500 30px sans-serif";
  context.fillStyle = "#e5e9f2";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text.slice(0, 18), 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 2;
  return sprite;
}

function buildFloor(runtime: Runtime, floor: SceneFloor, wallHeight: number) {
  disposeGroup(runtime.content);
  runtime.roomMeshes.clear();
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
  runtime.builtKey = `${floor.id}:${wallHeight}`;
}

function buildMarkers(
  runtime: Runtime,
  floor: SceneFloor,
  markers: SceneMarker[],
) {
  for (const old of runtime.markerMeshes) {
    runtime.content.remove(old);
    disposeGroup(old as THREE.Group);
  }
  runtime.builtMarkers = markers;
  runtime.markerMeshes = markers.map((marker) => {
    const group = new THREE.Group();
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({
        color: conditionColors[marker.condition],
        emissive: conditionColors[marker.condition],
        emissiveIntensity: 0.25,
      }),
    );
    pin.userData.markerKey = marker.key;
    const at = planToWorld(marker.position, floor.center, 0.9);
    group.position.set(at.x, at.y, at.z);
    group.add(pin);
    const label = labelSprite(marker.label);
    label.position.set(0, 0.45, 0);
    group.add(label);
    runtime.content.add(group);
    return group;
  });
}

function frameCamera(runtime: Runtime, floor: SceneFloor) {
  const distance = Math.max(6, floor.extent * 1.25);
  runtime.camera.position.set(0, distance * 0.85, distance * 0.75);
  runtime.controls.target.set(0, 0, 0);
  runtime.controls.minDistance = 2;
  runtime.controls.maxDistance = distance * 2.5;
  runtime.controls.update();
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
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
        void latest.current.onSceneError("webgl_unavailable");
        return;
      }
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      void latest.current.onSceneError("init_failed");
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);
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
      markerMeshes: [],
      stats: new FrameStats(),
      frameRequested: null,
      visible: latest.current.visible,
      rebuilds: 0,
      builtKey: null,
      builtMarkers: null,
      contextLosses: 0,
      readyMs: null,
      invalidate: () => {
        if (!r.visible || r.frameRequested !== null) return;
        r.frameRequested = requestAnimationFrame((now) => {
          r.frameRequested = null;
          renderer.render(scene, camera);
          r.stats.frame(now, r.visible);
          if (r.readyMs === null) {
            r.readyMs = Math.round(performance.now() - started);
            void latest.current.onSceneReady();
            void latest.current.onMetrics(r.metrics());
          }
        });
      },
      metrics: () => ({
        readyMs: r.readyMs,
        ...r.stats.report(),
        rebuilds: r.rebuilds,
        memory: {
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        contextLosses: r.contextLosses,
      }),
    };
    runtime.current = r;
    controls.addEventListener("change", r.invalidate);

    const resize = () => {
      const { clientWidth, clientHeight } = element;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      r.invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    // Tap vs orbit: decided from the whole gesture, never from pointerdown alone.
    const pointers = new Set<number>();
    let gesture: { x: number; y: number; t: number; max: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06);
    const down = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      if (pointers.size === 1) {
        gesture = {
          x: event.clientX,
          y: event.clientY,
          t: performance.now(),
          max: 1,
        };
        r.stats.beginInteraction(performance.now());
      } else if (gesture) gesture.max = Math.max(gesture.max, pointers.size);
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size || !gesture) return;
      const kind = classifyGesture({
        dx: event.clientX - gesture.x,
        dy: event.clientY - gesture.y,
        durationMs: performance.now() - gesture.t,
        maxPointers: gesture.max,
      });
      gesture = null;
      r.stats.endInteraction(performance.now());
      void latest.current.onMetrics(r.metrics());
      if (kind !== "tap") return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster.intersectObjects(r.markerMeshes, true)[0];
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

    try {
      buildFloor(r, latest.current.floor, latest.current.wallHeight);
      buildMarkers(r, latest.current.floor, latest.current.markers);
      frameCamera(r, latest.current.floor);
      resize();
    } catch {
      void latest.current.onSceneError("init_failed");
    }

    return () => {
      if (r.frameRequested !== null) cancelAnimationFrame(r.frameRequested);
      observer.disconnect();
      window.removeEventListener("error", failed);
      window.removeEventListener("unhandledrejection", failed);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.removeEventListener("change", r.invalidate);
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, []);

  // Geometry changes rebuild the floor (and prove disposal via renderer.info).
  const { floor, wallHeight, markers, selectedRoomId, visible, simulate } =
    props;
  useEffect(() => {
    const r = runtime.current;
    if (!r || r.builtKey === `${floor.id}:${wallHeight}`) return;
    buildFloor(r, floor, wallHeight);
    buildMarkers(r, floor, latest.current.markers);
    frameCamera(r, floor);
    r.invalidate();
    // Markers/selection have their own effects; a floor change implies both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.id, wallHeight]);

  useEffect(() => {
    const r = runtime.current;
    if (!r || r.builtMarkers === markers) return;
    buildMarkers(r, latest.current.floor, markers);
    r.invalidate();
  }, [markers]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    for (const [id, mesh] of r.roomMeshes) {
      const room = latest.current.floor.rooms.find((item) => item.id === id);
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(
        id === selectedRoomId
          ? selectedColor
          : (roomColors[room?.kind ?? ""] ?? 0x333846),
      );
    }
    r.invalidate();
  }, [selectedRoomId, floor.id]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.visible = visible;
    if (!visible && r.frameRequested !== null) {
      cancelAnimationFrame(r.frameRequested);
      r.frameRequested = null;
    }
    if (visible) r.invalidate(); // fresh frame after returning
    void latest.current.onMetrics(r.metrics());
  }, [visible]);

  useEffect(() => {
    if (simulate !== "context_loss") return;
    runtime.current?.renderer.forceContextLoss();
  }, [simulate]);

  return (
    <div
      ref={host}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#111827",
      }}
    />
  );
}
