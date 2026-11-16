export interface LabelPoint {
  key: string;
  x: number;
  y: number;
  /** Rendered label size in CSS pixels; names are fitted, not a fixed slab. */
  w?: number;
  h?: number;
}
export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PlacedLabel extends LabelRect {
  visible: boolean;
}
export interface LabelLayoutOptions {
  /** Square kept clear around every marker head. */
  pin?: number;
  /** Distance between a head and its own label. */
  gap?: number;
  /** Labels never come closer than this to the canvas edge. */
  margin?: number;
}
const DEFAULT_LABEL_WIDTH = 128;
const DEFAULT_LABEL_HEIGHT = 32;
export const overlaps = (a: LabelRect, b: LabelRect) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2;

/** Preferred slots around a head, nearest first; offsets are label centres. */
function slots(w: number, h: number, reach: number) {
  const side = reach + w / 2 - h / 2;
  const shift = Math.max(0, w / 2 - 12);
  const row = h + 4;
  const offsets: [number, number][] = [
    [0, -reach],
    [shift, -reach],
    [-shift, -reach],
    [side, 0],
    [-side, 0],
    [side, -row / 2],
    [-side, -row / 2],
    [0, reach],
    [shift, reach],
    [-shift, reach],
  ];
  for (let extra = 1; extra <= 4; extra++)
    for (const direction of [-1, 1])
      for (const dx of [0, shift, -shift, side, -side])
        offsets.push([dx, direction * (reach + extra * row)]);
  return offsets;
}

/** Distance from a point to the edge of a rectangle; zero inside it. */
const gapTo = (point: { x: number; y: number }, rect: LabelRect) =>
  Math.hypot(
    Math.max(0, Math.abs(point.x - rect.x) - rect.w / 2),
    Math.max(0, Math.abs(point.y - rect.y) - rect.h / 2),
  );

/** The first slots hug the head; they decide how constrained a name is. */
const NEAR_SLOTS = 7;

/**
 * Keep names readable, attached to their marker and inside the viewport.
 *
 * A name never covers a head or another name and is clamped inside the canvas
 * instead of being clipped. It prefers a slot that is closer to its own head
 * than to any other, so the eye cannot attach it to a neighbour. The name with
 * the fewest good slots left chooses first; one with none takes what remains.
 * Crowded labels defer to the complete native list. The result depends only on
 * the points, never on their order.
 */
export function layoutMarkerLabels(
  points: LabelPoint[],
  width: number,
  height: number,
  options: LabelLayoutOptions = {},
) {
  const { pin = 20, gap = 3, margin = 4 } = options;
  const result = new Map<string, PlacedLabel>();
  const pins = points.map((point) => ({
    x: point.x,
    y: point.y,
    w: pin,
    h: pin,
  }));
  const pending: {
    key: string;
    candidates: (LabelRect & { near: boolean })[];
  }[] = [];
  for (const point of [...points].sort((a, b) => a.key.localeCompare(b.key))) {
    const w = point.w ?? DEFAULT_LABEL_WIDTH;
    const h = point.h ?? DEFAULT_LABEL_HEIGHT;
    result.set(point.key, { x: point.x, y: point.y, w, h, visible: false });
    if (
      width < w + 2 * margin ||
      height < h + 2 * margin ||
      point.x < 0 ||
      point.x > width ||
      point.y < 0 ||
      point.y > height
    )
      continue;
    const own: (LabelRect & { near: boolean })[] = [];
    const ambiguous: (LabelRect & { near: boolean })[] = [];
    slots(w, h, pin / 2 + gap + h / 2).forEach(([dx, dy], index) => {
      const candidate = {
        x: Math.max(
          w / 2 + margin,
          Math.min(width - w / 2 - margin, point.x + dx),
        ),
        y: Math.max(
          h / 2 + margin,
          Math.min(height - h / 2 - margin, point.y + dy),
        ),
        w,
        h,
      };
      if (pins.some((other) => overlaps(candidate, other))) return;
      const distance = gapTo(point, candidate);
      if (
        points.every(
          (other) => other === point || gapTo(other, candidate) >= distance,
        )
      )
        own.push({ ...candidate, near: index < NEAR_SLOTS });
      else ambiguous.push({ ...candidate, near: false });
    });
    pending.push({ key: point.key, candidates: [...own, ...ambiguous] });
  }
  while (pending.length) {
    let pick = 0;
    let fewest = Infinity;
    pending.forEach((item, index) => {
      const near = item.candidates.filter((candidate) => candidate.near);
      if (near.length && near.length < fewest) {
        fewest = near.length;
        pick = index;
      }
    });
    const [item] = pending.splice(pick, 1);
    const chosen = item!.candidates[0];
    if (!chosen) continue;
    const { x, y, w, h } = chosen;
    result.set(item!.key, { x, y, w, h, visible: true });
    for (const other of pending)
      other.candidates = other.candidates.filter(
        (candidate) => !overlaps(candidate, chosen),
      );
  }
  return result;
}

/**
 * The short line tying a label to its marker head: from the rim of the head
 * to the nearest point of the label. Null when they already touch.
 */
export function labelLeader(
  head: { x: number; y: number },
  label: LabelRect,
  headRadius: number,
) {
  const x = Math.max(
    label.x - label.w / 2,
    Math.min(label.x + label.w / 2, head.x),
  );
  const y = Math.max(
    label.y - label.h / 2,
    Math.min(label.y + label.h / 2, head.y),
  );
  const distance = Math.hypot(x - head.x, y - head.y);
  if (distance <= headRadius + 1) return null;
  const ux = (x - head.x) / distance;
  const uy = (y - head.y) / distance;
  return {
    from: { x: head.x + ux * headRadius, y: head.y + uy * headRadius },
    to: { x, y },
    length: distance - headRadius,
  };
}
