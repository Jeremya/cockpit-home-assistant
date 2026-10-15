export interface PlanPoint {
  x: number;
  z: number;
}
export type RoomKind =
  "living" | "kitchen" | "bedroom" | "bathroom" | "storage" | "circulation";
export interface PlanRoom {
  id: string;
  name: string;
  shortName: string;
  kind: RoomKind;
  polygon: PlanPoint[];
  label: PlanPoint;
  dimensions?: string;
}
export interface PlanLine {
  from: PlanPoint;
  to: PlanPoint;
  kind: "wall" | "step" | "window";
}
export interface PlanFloor {
  id: string;
  name: string;
  outline: PlanPoint[];
  rooms: PlanRoom[];
  lines: PlanLine[];
}
/** Meters, Y up, X/Z ground plane. No assumed compass orientation or story heights. */
export interface HousePlan {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  source: "reference_image" | "sample";
  scale: "approximate";
  floors: PlanFloor[];
}
export function planBounds(points: PlanPoint[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}
export function pointInPolygon(
  point: PlanPoint,
  polygon: PlanPoint[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const cross = (point.z - a.z) * (b.x - a.x) - (point.x - a.x) * (b.z - a.z);
    if (
      Math.abs(cross) < 1e-7 &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.z >= Math.min(a.z, b.z) &&
      point.z <= Math.max(a.z, b.z)
    )
      return true;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 160;
const point = (value: unknown): value is PlanPoint =>
  object(value) &&
  typeof value.x === "number" &&
  Number.isFinite(value.x) &&
  Math.abs(value.x) <= 1000 &&
  typeof value.z === "number" &&
  Number.isFinite(value.z) &&
  Math.abs(value.z) <= 1000;
const polygon = (value: unknown): value is PlanPoint[] => {
  if (
    !Array.isArray(value) ||
    value.length < 3 ||
    value.length > 128 ||
    !value.every(point)
  )
    return false;
  const area = value.reduce((sum, p, index) => {
    const next = value[(index + 1) % value.length]!;
    return sum + p.x * next.z - next.x * p.z;
  }, 0);
  return Math.abs(area) > 0.001;
};
/** Shared by the local build preparation and the renderer's bundled-data boundary. */
export function parseHousePlan(value: unknown): HousePlan | null {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !text(value.id) ||
    !text(value.name) ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !["reference_image", "sample"].includes(String(value.source)) ||
    value.scale !== "approximate" ||
    !Array.isArray(value.floors) ||
    !value.floors.length ||
    value.floors.length > 20
  )
    return null;
  const ids = new Set<string>();
  for (const floor of value.floors) {
    if (
      !object(floor) ||
      !text(floor.id) ||
      ids.has(floor.id) ||
      !text(floor.name) ||
      !polygon(floor.outline) ||
      !Array.isArray(floor.rooms) ||
      !floor.rooms.length ||
      floor.rooms.length > 100 ||
      !Array.isArray(floor.lines) ||
      floor.lines.length > 1000
    )
      return null;
    ids.add(floor.id);
    const outline = floor.outline;
    for (const room of floor.rooms) {
      if (
        !object(room) ||
        !text(room.id) ||
        ids.has(room.id) ||
        !text(room.name) ||
        !text(room.shortName) ||
        ![
          "living",
          "kitchen",
          "bedroom",
          "bathroom",
          "storage",
          "circulation",
        ].includes(String(room.kind)) ||
        !polygon(room.polygon) ||
        !point(room.label) ||
        !pointInPolygon(room.label, room.polygon) ||
        !room.polygon.every((p) => pointInPolygon(p, outline)) ||
        (room.dimensions !== undefined && !text(room.dimensions))
      )
        return null;
      ids.add(room.id);
    }
    for (const line of floor.lines) {
      if (
        !object(line) ||
        !point(line.from) ||
        !point(line.to) ||
        !["wall", "step", "window"].includes(String(line.kind))
      )
        return null;
    }
  }
  return value as unknown as HousePlan;
}
