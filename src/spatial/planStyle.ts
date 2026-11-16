import { colors } from "../theme";
import type { FurnitureKind, PlanLine, PlanPoint, RoomKind } from "./model";
import { planToScreen, type FloorViewBox, type ViewSize } from "./viewport";

/**
 * Drawing language of the 2D plan: one tonal family, three line weights, lit
 * selection. Presentation only. Coordinates, projection and hit-testing stay in
 * `viewport.ts`; nothing here is a measurement or a Home Assistant fact.
 */

type Rgb = readonly [number, number, number];
const channels = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
/** `to` laid over `from` at `amount` opacity; both opaque `#rrggbb`. */
export function mix(from: string, to: string, amount: number) {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((channel, index) =>
      Math.round(channel + (b[index]! - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function withAlpha(hex: string, alpha: number) {
  return `rgba(${channels(hex).join(",")},${alpha})`;
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** WCAG 2 contrast ratio between two opaque `#rrggbb` colours. */
export function contrastRatio(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light! + 0.05) / (dark! + 0.05);
}

/** A stroke or fill laid over whatever is beneath it. */
export interface PlanInk {
  color: string;
  opacity: number;
}
const ink = (color: string, opacity = 1): PlanInk => ({ color, opacity });

const wallInk = mix(colors.text, colors.muted, 0.42);
/** Every value derives from the cockpit tokens; none carries a device state. */
export const planPalette = {
  /** Near-black stage the house sits on. */
  stage: colors.background,
  stageEdge: withAlpha(colors.text, 0.07),
  /** Drawn once under the floor and once over it, so it is fainter indoors. */
  grid: ink(colors.muted, 0.055),
  ambient: ink(colors.accent, 0.14),
  /** Floor area no room claims. */
  plate: colors.surface,
  /**
   * One ink for shell, partitions and steps: weight alone tells them apart,
   * and it holds 3:1 even at the brightest point of a lit room.
   */
  wall: ink(wallInk),
  /** Where two rooms meet without a wall: a finish line, never a partition. */
  threshold: ink(colors.muted, 0.26),
  glass: ink(mix(colors.text, colors.accent, 0.45)),
  furnitureStroke: ink(colors.muted, 0.44),
  furnitureFill: ink(colors.muted, 0.07),
  selection: ink(colors.accent),
  /** Peak of the light pooled over a lit room, at its label anchor. */
  litPool: ink(colors.accent, 0.26),
  /** Room names and marker captions sit on a backing, never on bare linework. */
  label: {
    rest: {
      backing: ink(colors.background, 0.9),
      edge: withAlpha(colors.text, 0.12),
      text: colors.text,
    },
    receded: {
      backing: ink(colors.background, 0.9),
      edge: withAlpha(colors.text, 0.08),
      text: colors.muted,
    },
    lit: {
      backing: ink(colors.accent),
      edge: colors.accent,
      text: colors.background,
    },
  },
} as const;

/**
 * One rule for every room: the raised cockpit surface, nudged toward one token
 * hue by a small, comparable amount. Rooms differ by tone and edge, never by a
 * saturated colour, and no state token (warning, danger) is ever a room tint.
 */
const roomTint: Record<RoomKind, readonly [hue: string, amount: number]> = {
  living: [colors.accent, 0.1],
  kitchen: [colors.muted, 0.13],
  bedroom: [colors.security, 0.1],
  bathroom: [colors.comfort, 0.07],
  storage: [colors.muted, 0.06],
  circulation: [colors.muted, 0.02],
};
/** How a room is shown: at rest, lit by selection, or stepped back behind it. */
export type RoomTone = "rest" | "lit" | "receded";
/** A selection that is not on this floor leaves every room at rest. */
export function roomTones(
  rooms: readonly { id: string }[],
  selectedRoomId: string | null,
): Map<string, RoomTone> {
  const active = rooms.some((room) => room.id === selectedRoomId);
  return new Map(
    rooms.map((room) => [
      room.id,
      !active ? "rest" : room.id === selectedRoomId ? "lit" : "receded",
    ]),
  );
}
export function roomFill(kind: RoomKind, tone: RoomTone = "rest") {
  const [hue, amount] = roomTint[kind];
  const rest = mix(colors.raised, hue, amount);
  // Lit and receded differ by luminance, so selection never rests on hue.
  return tone === "lit"
    ? mix(rest, colors.accent, 0.24)
    : tone === "receded"
      ? mix(rest, colors.background, 0.45)
      : rest;
}

/** The brightest a lit room gets: its fill under the full light pool. */
export function litPeak(kind: RoomKind) {
  return mix(
    roomFill(kind, "lit"),
    planPalette.litPool.color,
    planPalette.litPool.opacity,
  );
}

/** Corner radius in drawing units; the footprint size caps it. */
export const furnitureRadius: Record<FurnitureKind, number> = {
  seating: 5,
  table: 2.5,
  rug: 2,
  counter: 1.5,
  storage: 1.5,
  appliance: 2,
  fixture: 3,
  plant: 6,
};
/** Rugs lie under everything, fitted counters next, loose pieces on top. */
export const furnitureLayer = (kind: FurnitureKind) =>
  kind === "rug" ? 0 : kind === "counter" ? 1 : 2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export type PlanDensity = "regular" | "compact";
/** Screen pixels, so the hierarchy holds at every size the plan is drawn. */
const weights = {
  regular: {
    shell: 3,
    partition: 1.75,
    glass: 1.5,
    hairline: 1,
    select: 3,
    halo: 14,
  },
  compact: {
    shell: 2.25,
    partition: 1.25,
    glass: 1.25,
    hairline: 0.75,
    select: 2.25,
    halo: 10,
  },
} as const;
export type PlanStrokes = Record<keyof (typeof weights)["regular"], number>;
/** Drawing units per screen pixel through the shared projection; 1 before layout. */
export function unitsPerPixel(box: FloorViewBox, size: ViewSize) {
  const { minX, minZ } = box.bounds;
  const origin = planToScreen({ x: minX, z: minZ }, box, size);
  const metre = planToScreen({ x: minX + 1, z: minZ }, box, size);
  const pixelsPerMetre = origin && metre ? metre.x - origin.x : 0;
  return pixelsPerMetre > 0 ? box.unit / pixelsPerMetre : 1;
}
/**
 * Line weights in drawing units for the measured stage. Detail lines keep
 * their pixel weight at any size; the structure (shell, partitions, selection)
 * gains up to half again on a large drawing so it never thins into a diagram.
 */
export function planStrokes(
  density: PlanDensity,
  box: FloorViewBox,
  size: ViewSize,
): PlanStrokes {
  const scale = unitsPerPixel(box, size);
  const structure = scale * clamp(Math.sqrt(1 / scale), 0.9, 1.5);
  const source = weights[density];
  return {
    shell: source.shell * structure,
    partition: source.partition * structure,
    select: source.select * structure,
    glass: source.glass * scale,
    hairline: source.hairline * scale,
    halo: source.halo * scale,
  };
}

/** Bounds for a stage that follows its floor instead of a fixed height. */
export interface PlanFrameLimits {
  minHeight: number;
  maxHeight: number;
  /** Optional cap as a share of the stage width, for landscape previews. */
  maxHeightRatio?: number;
}
export const planFrames = {
  /** Plan and placement editors on a phone or tablet. */
  screen: (windowHeight: number): PlanFrameLimits => ({
    minHeight: 160,
    maxHeight: clamp(Math.round(windowHeight * 0.6), 260, 520),
  }),
  /** Desktop workspace: the whole stage stays on screen under its tabs. */
  desktop: (windowHeight: number): PlanFrameLimits => ({
    minHeight: 360,
    maxHeight: clamp(windowHeight - 410, 360, 640),
  }),
  /** A plan hosted without knowledge of the window, such as the placement editor. */
  editor: { minHeight: 160, maxHeight: 440 },
  /** The Home plan card, compact and beside the attention list on desktop. */
  card: { minHeight: 160, maxHeight: 280 },
  cardWide: { minHeight: 220, maxHeight: 300 },
  /**
   * Home hero: landscape, and about a third of the window at most, so the
   * pulse stays on the first screen of a phone held either way.
   */
  preview: (windowHeight: number): PlanFrameLimits => ({
    minHeight: 140,
    maxHeight: clamp(Math.round(windowHeight * 0.34), 160, 320),
    maxHeightRatio: 0.64,
  }),
} as const;
/** Width over height of the stage before any height limit applies. */
export function planFrameAspect(
  box: Pick<FloorViewBox, "width" | "height">,
  limits: PlanFrameLimits,
) {
  const aspect = box.width / box.height;
  return limits.maxHeightRatio
    ? Math.max(aspect, 1 / limits.maxHeightRatio)
    : aspect;
}
/** Stage height for a measured width; null until the width is known. */
export function planFrameHeight(
  box: Pick<FloorViewBox, "width" | "height">,
  width: number,
  limits: PlanFrameLimits,
) {
  if (!Number.isFinite(width) || width <= 0) return null;
  return clamp(
    width / planFrameAspect(box, limits),
    limits.minHeight,
    limits.maxHeight,
  );
}

/** The visible stage in drawing units, including any letterboxing. */
export function planStageExtent(box: FloorViewBox, size: ViewSize) {
  const measured = size.width > 0 && size.height > 0;
  const scale = unitsPerPixel(box, size);
  const width = measured ? Math.max(box.width, size.width * scale) : box.width;
  const height = measured
    ? Math.max(box.height, size.height * scale)
    : box.height;
  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}
const round = (value: number) => Math.round(value * 100) / 100;
/**
 * Drafting grid across the whole stage, on whole plan metres so walls drawn on
 * a metre sit on a line. It widens to 2, 5 or 10 m rather than crowd a small
 * stage, and is omitted when even that would be denser than 14 px.
 */
export function planGridPath(box: FloorViewBox, size: ViewSize) {
  const pixelsPerMetre = box.unit / unitsPerPixel(box, size);
  const step = [1, 2, 5, 10].find((metres) => metres * pixelsPerMetre >= 14);
  if (!step) return "";
  const extent = planStageExtent(box, size);
  const right = extent.x + extent.width;
  const bottom = extent.y + extent.height;
  const metreX = (x: number) => (x - box.padding) / box.unit + box.bounds.minX;
  const metreZ = (y: number) => box.bounds.maxZ - (y - box.padding) / box.unit;
  const segments: string[] = [];
  for (
    let metre = Math.ceil(metreX(extent.x) / step) * step;
    metre <= metreX(right);
    metre += step
  ) {
    const x = round((metre - box.bounds.minX) * box.unit + box.padding);
    segments.push(`M${x} ${round(extent.y)}V${round(bottom)}`);
  }
  for (
    let metre = Math.ceil(metreZ(bottom) / step) * step;
    metre <= metreZ(extent.y);
    metre += step
  ) {
    const y = round((box.bounds.maxZ - metre) * box.unit + box.padding);
    segments.push(`M${round(extent.x)} ${y}H${round(right)}`);
  }
  return segments.join("");
}

/**
 * Wall ends shared by at least two wall lines. Walls are drawn with flat ends
 * so an opening keeps the exact width the model gives it; these corners get a
 * round joint instead. A free end is never extended.
 */
export function wallJoints(lines: readonly PlanLine[]): PlanPoint[] {
  const ends = new Map<string, { point: PlanPoint; walls: Set<number> }>();
  lines.forEach((line, index) => {
    if (line.kind !== "wall") return;
    for (const point of [line.from, line.to]) {
      const key = `${point.x.toFixed(4)},${point.z.toFixed(4)}`;
      const entry = ends.get(key) ?? { point, walls: new Set<number>() };
      entry.walls.add(index);
      ends.set(key, entry);
    }
  });
  return [...ends.values()]
    .filter((entry) => entry.walls.size > 1)
    .map((entry) => entry.point);
}

/**
 * A caption beside its marker stays against it; one above or below is centred.
 * The reserved rectangle is wider than most names, so its backing hugs the text.
 */
export function captionAlignment(
  caption: { x: number; width: number },
  markerX: number,
): "flex-start" | "flex-end" | "center" {
  return caption.x >= markerX
    ? "flex-start"
    : caption.x + caption.width <= markerX
      ? "flex-end"
      : "center";
}
