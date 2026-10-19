import {
  planBounds,
  pointInPolygon,
  type PlanFloor,
  type PlanPoint,
} from "./model";
import {
  floorViewBox,
  planToScreen,
  type ViewPoint,
  type ViewSize,
} from "./viewport";

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const markerTargetSize = 48;
export function rectanglesOverlap(a: LabelRect, b: LabelRect, gap = 4) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
const centered = (
  point: ViewPoint,
  width: number,
  height: number,
): LabelRect => ({
  x: point.x - width / 2,
  y: point.y - height / 2,
  width,
  height,
});
const inFrame = (rect: LabelRect, size: ViewSize) =>
  rect.x >= 0 &&
  rect.y >= 0 &&
  rect.x + rect.width <= size.width &&
  rect.y + rect.height <= size.height;

// Reject polygon boundaries crossing the rectangle, including thin concave notches.
function crossesInterior(a: PlanPoint, b: PlanPoint, rect: LabelRect) {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.x + 0.01, rect.x + rect.width - 0.01],
    [a.z, b.z - a.z, rect.y + 0.01, rect.y + rect.height - 0.01],
  ] as const) {
    if (!delta) {
      if (start <= min || start >= max) return false;
    } else {
      low = Math.max(
        low,
        Math.min((min - start) / delta, (max - start) / delta),
      );
      high = Math.min(
        high,
        Math.max((min - start) / delta, (max - start) / delta),
      );
    }
  }
  return high > low && high > 0 && low < 1;
}
function inRoom(rect: LabelRect, polygon: PlanPoint[]) {
  const corners = [
    { x: rect.x, z: rect.y },
    { x: rect.x + rect.width, z: rect.y },
    { x: rect.x, z: rect.y + rect.height },
    { x: rect.x + rect.width, z: rect.y + rect.height },
  ];
  return (
    corners.every((point) => pointInPolygon(point, polygon)) &&
    !polygon.some((point, index) =>
      crossesInterior(point, polygon[(index + 1) % polygon.length]!, rect),
    )
  );
}

/** Screen-only layout. Saved positions and polygon picking never depend on labels. */
export function layoutPlanLabels(
  floor: PlanFloor,
  markers: { key: string; position: PlanPoint }[],
  size: ViewSize,
  fontScale = 1,
) {
  const box = floorViewBox(floor);
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const markerLayouts = new Map<
    string,
    { point: ViewPoint; target: LabelRect; caption: LabelRect | null }
  >();
  for (const marker of markers) {
    const point = planToScreen(marker.position, box, size);
    if (point)
      markerLayouts.set(marker.key, {
        point,
        target: centered(point, markerTargetSize, markerTargetSize),
        caption: null,
      });
  }
  const obstacles = [...markerLayouts.values()].map((entry) => entry.target);
  const rooms: { id: string; rect: LabelRect }[] = [];
  for (const room of floor.rooms) {
    const anchor = planToScreen(room.label, box, size);
    if (!anchor) continue;
    const polygon = room.polygon
      .map((point) => planToScreen(point, box, size)!)
      .map((point) => ({ x: point.x, z: point.y }));
    const bounds = planBounds(polygon);
    const width = Math.min(132 * scale, bounds.maxX - bounds.minX - 12);
    const height = 32 * scale;
    if (width < 48 || height > bounds.maxZ - bounds.minZ - 8) continue;
    const dy = markerTargetSize / 2 + height / 2 + 8;
    const dx = markerTargetSize / 2 + width / 2 + 8;
    const candidates = [
      anchor,
      { x: anchor.x, y: anchor.y - dy },
      { x: anchor.x, y: anchor.y + dy },
      { x: anchor.x - dx, y: anchor.y },
      { x: anchor.x + dx, y: anchor.y },
    ];
    for (const y of [0.25, 0.5, 0.75])
      for (const x of [0.25, 0.5, 0.75])
        candidates.push({
          x: bounds.minX + (bounds.maxX - bounds.minX) * x,
          y: bounds.minZ + (bounds.maxZ - bounds.minZ) * y,
        });
    const rect = candidates
      .map((point) => centered(point, width, height))
      .find(
        (candidate) =>
          inFrame(candidate, size) &&
          inRoom(candidate, polygon) &&
          !obstacles.some((other) => rectanglesOverlap(candidate, other)),
      );
    if (rect) {
      rooms.push({ id: room.id, rect });
      obstacles.push(rect);
    }
  }
  for (const entry of markerLayouts.values()) {
    const { point } = entry;
    const width = Math.min(132 * scale, size.width),
      height = 32 * scale;
    const left = Math.max(0, Math.min(size.width - width, point.x - width / 2));
    const candidates = [
      { x: left, y: point.y + 32, width, height },
      { x: left, y: point.y - 32 - height, width, height },
      { x: point.x + 32, y: point.y - height / 2, width, height },
      { x: point.x - 32 - width, y: point.y - height / 2, width, height },
    ];
    const caption = candidates.find(
      (rect) =>
        inFrame(rect, size) &&
        !obstacles.some((other) => rectanglesOverlap(rect, other)),
    );
    if (caption) {
      entry.caption = caption;
      obstacles.push(caption);
    }
  }
  return { rooms, markers: markerLayouts };
}
