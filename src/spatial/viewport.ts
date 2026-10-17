import { planBounds, type PlanFloor, type PlanPoint } from "./model";

/** The SVG and the hit surface share this exact viewBox, including its padding. */
export function floorViewBox(floor: PlanFloor) {
  const bounds = planBounds(floor.outline);
  return {
    bounds,
    unit: 40,
    padding: 14,
    width: (bounds.maxX - bounds.minX) * 40 + 28,
    height: (bounds.maxZ - bounds.minZ) * 40 + 28,
  };
}
export type FloorViewBox = ReturnType<typeof floorViewBox>;
export interface ViewSize {
  width: number;
  height: number;
}
export interface ViewPoint {
  x: number;
  y: number;
}
/** RN emits local touch coordinates; RN Web onPress receives a DOM click. */
export function pressLocation(event: {
  nativeEvent: {
    locationX?: number;
    locationY?: number;
    clientX?: number;
    clientY?: number;
  };
  currentTarget?: unknown;
}): ViewPoint | null {
  const target = event.currentTarget as {
    getBoundingClientRect?: () => { left: number; top: number };
  } | null;
  const { locationX, locationY, clientX, clientY } = event.nativeEvent;
  if (
    typeof target?.getBoundingClientRect === "function" &&
    typeof clientX === "number" &&
    typeof clientY === "number"
  ) {
    const rect = target.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  return typeof locationX === "number" && typeof locationY === "number"
    ? { x: locationX, y: locationY }
    : null;
}
export function planToSvg(point: PlanPoint, box: FloorViewBox): ViewPoint {
  return {
    x: (point.x - box.bounds.minX) * box.unit + box.padding,
    y: (box.bounds.maxZ - point.z) * box.unit + box.padding,
  };
}
function fit(box: FloorViewBox, size: ViewSize) {
  if (![size.width, size.height].every((n) => Number.isFinite(n) && n > 0))
    return null;
  const scale = Math.min(size.width / box.width, size.height / box.height);
  return {
    scale,
    x: (size.width - box.width * scale) / 2,
    y: (size.height - box.height * scale) / 2,
  };
}
export function planToScreen(
  point: PlanPoint,
  box: FloorViewBox,
  size: ViewSize,
): ViewPoint | null {
  const fitted = fit(box, size);
  if (!fitted) return null;
  const svg = planToSvg(point, box);
  return {
    x: fitted.x + svg.x * fitted.scale,
    y: fitted.y + svg.y * fitted.scale,
  };
}
/** Inverts xMidYMid meet; taps in letterboxing never become a location. */
export function screenToPlan(
  point: ViewPoint,
  box: FloorViewBox,
  size: ViewSize,
): PlanPoint | null {
  const fitted = fit(box, size);
  if (!fitted || ![point.x, point.y].every(Number.isFinite)) return null;
  const x = (point.x - fitted.x) / fitted.scale;
  const y = (point.y - fitted.y) / fitted.scale;
  if (x < 0 || x > box.width || y < 0 || y > box.height) return null;
  return {
    x: (x - box.padding) / box.unit + box.bounds.minX,
    z: box.bounds.maxZ - (y - box.padding) / box.unit,
  };
}
