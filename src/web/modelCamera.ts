/** Presentation constants, independent of house geometry and renderer state. */
export const MODEL_FOV = 26;
export const MODEL_ELEVATION = (48 * Math.PI) / 180;
export const MODEL_YAW = (35 * Math.PI) / 180;
export const MODEL_YAW_RANGE = (40 * Math.PI) / 180;
export const MODEL_TRANSITION_MS = 220;
export const MODEL_MARGIN_PX = 20;
export const MODEL_MARGIN_FRACTION = 0.1;
export type Point3 = [number, number, number];
export interface ModelCameraInput {
  bounds: { min: Point3; max: Point3 };
  viewport: { width: number; height: number };
  yaw: number;
  zoomFactor: number;
}
export interface ModelCameraPose {
  /** World-space tuples. No mutable Three objects cross the host boundary. */
  target: Point3;
  position: Point3;
  fitDistance: number;
  yaw: number;
  zoomFactor: number;
  near: number;
  far: number;
}
export function clampModelYaw(yaw: number) {
  return Math.min(
    MODEL_YAW + MODEL_YAW_RANGE,
    Math.max(MODEL_YAW - MODEL_YAW_RANGE, yaw),
  );
}

/** Fit all eight corners inside the actual canvas's usable perspective frustum.
 * Includes depth, so an off-centre/high box is not treated as a flat rectangle.
 * Invalid/unrepresentable input yields null; arguments are never modified.
 */
export function fitModelCamera({
  bounds,
  viewport,
  yaw,
  zoomFactor,
}: ModelCameraInput): ModelCameraPose | null {
  const { min, max } = bounds;
  const { width, height } = viewport;
  if (
    ![...min, ...max, width, height, yaw, zoomFactor].every(Number.isFinite) ||
    min.some((value, i) => value > max[i]!)
  )
    return null;
  const qx = 1 - 2 * (MODEL_MARGIN_FRACTION + MODEL_MARGIN_PX / width);
  const qy = 1 - 2 * (MODEL_MARGIN_FRACTION + MODEL_MARGIN_PX / height);
  if (width <= 0 || height <= 0 || qx <= 0 || qy <= 0) return null;
  yaw = clampModelYaw(yaw);
  zoomFactor = Math.min(1.25, Math.max(1, zoomFactor));
  const target = min.map((value, i) => value / 2 + max[i]! / 2) as Point3;
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  const elevationSin = Math.sin(MODEL_ELEVATION),
    elevationCos = Math.cos(MODEL_ELEVATION);
  const direction: Point3 = [
    sin * elevationCos,
    elevationSin,
    cos * elevationCos,
  ];
  // normalize(worldUp × direction), then direction × right.
  const right: Point3 = [cos, 0, -sin];
  const up: Point3 = [-sin * elevationSin, elevationCos, -cos * elevationSin];
  const tangentY = Math.tan((MODEL_FOV * Math.PI) / 360);
  const tangentX = (tangentY * width) / height;
  const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nearMargin = 0.1;
  let fitDistance = 1,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let corner = 0; corner < 8; corner++) {
    const v = min.map(
      (value, i) => (corner & (1 << i) ? max[i]! : value) - target[i]!,
    ) as Point3;
    const x = dot(v, right),
      y = dot(v, up),
      z = dot(v, direction);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    fitDistance = Math.max(
      fitDistance,
      z + Math.abs(x) / (tangentX * qx),
      z + Math.abs(y) / (tangentY * qy),
      z + nearMargin,
    );
  }
  const distance = fitDistance * zoomFactor;
  const near = (distance - maxZ) / 2;
  const far = (distance - minZ) * 1.5 + nearMargin;
  const position = target.map(
    (value, i) => value + direction[i]! * distance,
  ) as Point3;
  if (
    ![fitDistance, near, far, ...position].every(Number.isFinite) ||
    near <= 0 ||
    far <= near
  )
    return null;
  return { target, position, fitDistance, yaw, zoomFactor, near, far };
}
