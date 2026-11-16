/** Presentation constants, independent of house geometry and renderer state. */
export const MODEL_FOV = 26;
export const MODEL_ELEVATION = (38 * Math.PI) / 180;
export const MODEL_YAW = (35 * Math.PI) / 180;
export const MODEL_YAW_RANGE = (40 * Math.PI) / 180;
export const MODEL_TRANSITION_MS = 220;
/**
 * Share of the limiting canvas dimension covered by the fitted silhouette.
 * The remainder is the margin that keeps labels and the plinth off the edge;
 * it is proportional, so there is no absolute pixel term.
 */
export const MODEL_FILL = 0.8;
export type Point3 = [number, number, number];

export interface CameraFitInput {
  /** World-space silhouette points that must stay inside the fitted frame. */
  points: readonly Point3[];
  viewport: { width: number; height: number };
  /** Radians around world +Y, measured from +Z toward +X. */
  yaw: number;
  /** Radians above the ground plane. */
  elevation: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Share (0–1] of the limiting viewport dimension the points should span. */
  fill: number;
}
export interface CameraFit {
  /** World-space tuples. No mutable Three objects cross the host boundary. */
  target: Point3;
  position: Point3;
  fitDistance: number;
  /** Depth of the nearest/farthest point at `fitDistance`. */
  nearDepth: number;
  farDepth: number;
  /** Share of each canvas dimension covered by the points. */
  share: { width: number; height: number };
}

const NEAR_MARGIN = 0.1;
const MIN_DISTANCE = 1;
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Centred half-extent of `value / depth` over all points, and its centring offset. */
function centred(values: number[], depths: number[], tangent: number) {
  // f(offset) = max((v − offset)/d) + min((v − offset)/d) decreases strictly,
  // so the offset that centres the projection is unique.
  let low = Infinity,
    high = -Infinity;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const extent = (offset: number) => {
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const projected = (values[i]! - offset) / depths[i]!;
      min = Math.min(min, projected);
      max = Math.max(max, projected);
    }
    return { min, max };
  };
  for (let step = 0; step < 48 && high - low > 1e-12; step++) {
    const middle = (low + high) / 2;
    const { min, max } = extent(middle);
    if (max + min > 0) low = middle;
    else high = middle;
  }
  const offset = (low + high) / 2;
  const { min, max } = extent(offset);
  return { offset, half: (max - min) / 2 / tangent };
}

/**
 * Exact perspective fit: the projected bounds of `points` are centred in the
 * canvas and span `fill` of its limiting dimension. Depth is part of the fit,
 * so a tall or off-centre shape is not treated as a flat rectangle.
 * Invalid or unrepresentable input yields null; arguments are never modified.
 */
export function fitCameraToPoints({
  points,
  viewport,
  yaw,
  elevation,
  fov,
  fill,
}: CameraFitInput): CameraFit | null {
  const { width, height } = viewport;
  if (
    !points.length ||
    ![width, height, yaw, elevation, fov, fill].every(Number.isFinite) ||
    !points.every((point) => point.every(Number.isFinite)) ||
    width <= 0 ||
    height <= 0 ||
    fill <= 0 ||
    fill > 1 ||
    fov <= 0 ||
    fov >= 180
  )
    return null;
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  const elevationSin = Math.sin(elevation),
    elevationCos = Math.cos(elevation);
  const direction: Point3 = [
    sin * elevationCos,
    elevationSin,
    cos * elevationCos,
  ];
  // normalize(worldUp × direction), then direction × right.
  const right: Point3 = [cos, 0, -sin];
  const up: Point3 = [-sin * elevationSin, elevationCos, -cos * elevationSin];
  const tangentY = Math.tan((fov * Math.PI) / 360);
  const tangentX = (tangentY * width) / height;
  // Work around the box centre so a translated house fits identically.
  const origin: Point3 = [0, 1, 2].map((axis) => {
    let min = Infinity,
      max = -Infinity;
    for (const point of points) {
      min = Math.min(min, point[axis]!);
      max = Math.max(max, point[axis]!);
    }
    return min / 2 + max / 2;
  }) as Point3;
  const xs: number[] = [],
    ys: number[] = [],
    zs: number[] = [];
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const point of points) {
    const local = point.map((value, axis) => value - origin[axis]!) as Point3;
    const z = dot(local, direction);
    xs.push(dot(local, right));
    ys.push(dot(local, up));
    zs.push(z);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const frame = (distance: number) => {
    const depths = zs.map((z) => distance - z);
    const x = centred(xs, depths, tangentX);
    const y = centred(ys, depths, tangentY);
    return { x, y, limiting: Math.max(x.half, y.half) };
  };
  // The centred extent shrinks monotonically with distance: bracket, then bisect.
  let near = Math.max(MIN_DISTANCE, maxZ + NEAR_MARGIN);
  let far = near;
  let framed = frame(far);
  if (!Number.isFinite(framed.limiting)) return null;
  for (let step = 0; step < 80 && framed.limiting > fill; step++) {
    near = far;
    far *= 2;
    framed = frame(far);
  }
  if (!Number.isFinite(far) || framed.limiting > fill) return null;
  for (let step = 0; step < 60 && far - near > far * 1e-12; step++) {
    const middle = (near + far) / 2;
    if (frame(middle).limiting > fill) near = middle;
    else far = middle;
  }
  const fitDistance = far;
  framed = frame(fitDistance);
  const target = origin.map(
    (value, axis) =>
      value + right[axis]! * framed.x.offset + up[axis]! * framed.y.offset,
  ) as Point3;
  const position = target.map(
    (value, axis) => value + direction[axis]! * fitDistance,
  ) as Point3;
  if (![fitDistance, ...target, ...position].every(Number.isFinite))
    return null;
  return {
    target,
    position,
    fitDistance,
    nearDepth: fitDistance - maxZ,
    farDepth: fitDistance - minZ,
    share: { width: framed.x.half, height: framed.y.half },
  };
}

export interface ModelCameraInput {
  /** The box drives clipping; `points` may tighten the fit to the real silhouette. */
  bounds: { min: Point3; max: Point3; points?: readonly Point3[] };
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
  /** Share of each canvas dimension covered at zoom 1. */
  share: { width: number; height: number };
}
export function clampModelYaw(yaw: number) {
  return Math.min(
    MODEL_YAW + MODEL_YAW_RANGE,
    Math.max(MODEL_YAW - MODEL_YAW_RANGE, yaw),
  );
}

/** Fit the silhouette (or all eight box corners) at the model view's fixed elevation.
 * Invalid/unrepresentable input yields null; arguments are never modified.
 */
export function fitModelCamera({
  bounds,
  viewport,
  yaw,
  zoomFactor,
}: ModelCameraInput): ModelCameraPose | null {
  const { min, max } = bounds;
  if (
    ![...min, ...max, yaw, zoomFactor].every(Number.isFinite) ||
    min.some((value, i) => value > max[i]!)
  )
    return null;
  yaw = clampModelYaw(yaw);
  zoomFactor = Math.min(1.25, Math.max(1, zoomFactor));
  const corners: Point3[] = [];
  for (let corner = 0; corner < 8; corner++)
    corners.push(
      min.map((value, i) => (corner & (1 << i) ? max[i]! : value)) as Point3,
    );
  const silhouette = bounds.points?.length ? bounds.points : corners;
  const fit = fitCameraToPoints({
    points: silhouette,
    viewport,
    yaw,
    elevation: MODEL_ELEVATION,
    fov: MODEL_FOV,
    fill: MODEL_FILL,
  });
  if (!fit) return null;
  const distance = fit.fitDistance * zoomFactor;
  const direction = fit.position.map(
    (value, i) => (value - fit.target[i]!) / fit.fitDistance,
  ) as Point3;
  // Clip around the fitted silhouette. A box corner the silhouette never
  // reaches may sit closer than the camera; it must not push `near` negative.
  const near = (fit.nearDepth + distance - fit.fitDistance) / 2;
  let farDepth = fit.farDepth + distance - fit.fitDistance;
  for (const corner of corners)
    farDepth = Math.max(
      farDepth,
      distance -
        dot(
          corner.map((value, i) => value - fit.target[i]!) as Point3,
          direction,
        ),
    );
  const far = farDepth * 1.5 + NEAR_MARGIN;
  const position = fit.target.map(
    (value, i) => value + direction[i]! * distance,
  ) as Point3;
  if (
    ![near, far, ...position].every(Number.isFinite) ||
    near <= 0 ||
    far <= near
  )
    return null;
  return {
    target: fit.target,
    position,
    fitDistance: fit.fitDistance,
    yaw,
    zoomFactor,
    near,
    far,
    share: fit.share,
  };
}
