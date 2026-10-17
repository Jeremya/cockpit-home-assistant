import type { Condition } from "../core/types";
import {
  planBounds,
  pointInPolygon,
  type PlanFloor,
  type PlanLine,
  type PlanPoint,
  type RoomKind,
} from "../spatial/model";

/**
 * Pure helpers shared by the native wrapper and the DOM (Three.js) scene.
 * Everything crossing the bridge is JSON-safe geometry or a sanitized marker:
 * no tokens, raw HA attributes, dimensions or other free text beyond short labels.
 */

export interface SceneRoom {
  id: string;
  shortName: string;
  kind: RoomKind;
  polygon: PlanPoint[];
  label: PlanPoint;
}
export interface SceneFloor {
  id: string;
  outline: PlanPoint[];
  rooms: SceneRoom[];
  lines: PlanLine[];
  center: PlanPoint;
  extent: number; // largest side, meters
}
export type MarkerIcon =
  "lock" | "climate" | "fan" | "switch" | "camera" | "sensor" | "event";
export interface SceneMarker {
  key: string;
  floorId: string;
  position: PlanPoint;
  icon: MarkerIcon;
  label: string;
  condition: Condition;
}
export type SceneErrorCode =
  "webgl_unavailable" | "init_failed" | "context_lost" | "runtime_error";
export interface SceneMetrics {
  readyMs: number | null;
  hostReadyMs?: number | null;
  interaction: {
    frames: number;
    durationMs: number;
    fps: number;
    p95FrameMs?: number;
  };
  idleFrames: number;
  hiddenFrames: number;
  totalFrames: number;
  rebuilds: number;
  memory: { geometries: number; textures: number };
  contextLosses: number;
}

export function toSceneFloor(floor: PlanFloor): SceneFloor {
  const bounds = planBounds(floor.outline);
  return {
    id: floor.id,
    outline: floor.outline,
    rooms: floor.rooms.map((room) => ({
      id: room.id,
      shortName: room.shortName,
      kind: room.kind,
      polygon: room.polygon,
      label: room.label,
    })),
    lines: floor.lines,
    center: {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    },
    extent: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ),
  };
}

/** Plan X/Z (meters) → scene space centered on the floor; larger plan Z is farther (−Z). */
export function planToWorld(point: PlanPoint, center: PlanPoint, y = 0) {
  return { x: point.x - center.x, y, z: -(point.z - center.z) };
}
export function worldToPlan(
  world: { x: number; z: number },
  center: PlanPoint,
): PlanPoint {
  return { x: world.x + center.x, z: center.z - world.z };
}

export function pickRoomAt(point: PlanPoint, floor: SceneFloor): string | null {
  return (
    floor.rooms.find((room) => pointInPolygon(point, room.polygon))?.id ?? null
  );
}

export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_MS = 500;
export function classifyGesture(gesture: {
  dx: number;
  dy: number;
  durationMs: number;
  maxPointers: number;
  maxDistance?: number;
}): "tap" | "drag" | "multi" | "long" {
  if (gesture.maxPointers > 1) return "multi";
  if (
    Math.max(gesture.maxDistance ?? 0, Math.hypot(gesture.dx, gesture.dy)) >
    TAP_MAX_MOVE_PX
  )
    return "drag";
  if (gesture.durationMs > TAP_MAX_MS) return "long";
  return "tap";
}

const icons = new Set<MarkerIcon>([
  "lock",
  "climate",
  "fan",
  "switch",
  "camera",
  "sensor",
  "event",
]);
const conditions = new Set<Condition>([
  "normal",
  "active",
  "attention",
  "alert",
  "unavailable",
  "unknown",
  "stale",
]);
const finite = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1000;

/** Keeps only the documented marker fields for the active floor; drops anything malformed. */
export function sanitizeMarkers(
  input: readonly unknown[],
  floorId: string,
): SceneMarker[] {
  const markers: SceneMarker[] = [];
  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    const position = raw.position as Record<string, unknown> | undefined;
    if (
      typeof raw.key !== "string" ||
      !raw.key ||
      raw.key.length > 512 ||
      raw.floorId !== floorId ||
      !position ||
      !finite(position.x) ||
      !finite(position.z) ||
      !icons.has(raw.icon as MarkerIcon) ||
      typeof raw.label !== "string" ||
      !raw.label.trim() ||
      raw.label.length > 80 ||
      !conditions.has(raw.condition as Condition)
    )
      continue;
    markers.push({
      key: raw.key,
      floorId,
      position: { x: position.x as number, z: position.z as number },
      icon: raw.icon as MarkerIcon,
      label: raw.label,
      condition: raw.condition as Condition,
    });
  }
  return markers;
}

/** Counts rendered frames by phase so on-demand rendering can be proven, not assumed. */
export class FrameStats {
  private interactionStart: number | null = null;
  private interactionFrames = 0;
  private interactionMs = 0;
  private idle = 0;
  private hidden = 0;
  private total = 0;
  private intervals: number[] = [];
  private lastFrame: number | null = null;
  beginInteraction(now: number) {
    this.interactionStart = now;
    this.interactionFrames = 0;
    this.interactionMs = 0;
    this.intervals = [];
    this.lastFrame = null;
  }
  endInteraction(now: number) {
    if (this.interactionStart !== null)
      this.interactionMs = now - this.interactionStart;
    this.interactionStart = null;
  }
  frame(now: number, visible: boolean) {
    this.total++;
    if (!visible) this.hidden++;
    else if (this.interactionStart !== null) {
      this.interactionFrames++;
      if (this.lastFrame !== null) {
        this.intervals.push(now - this.lastFrame);
        if (this.intervals.length > 600) this.intervals.shift();
      }
      this.lastFrame = now;
    } else this.idle++;
  }
  report(now?: number) {
    const durationMs =
      this.interactionStart !== null && now !== undefined
        ? now - this.interactionStart
        : this.interactionMs;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    return {
      interaction: {
        frames: this.interactionFrames,
        durationMs,
        fps: durationMs > 0 ? (this.interactionFrames * 1000) / durationMs : 0,
        p95FrameMs:
          sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
      },
      idleFrames: this.idle,
      hiddenFrames: this.hidden,
      totalFrames: this.total,
    };
  }
}
