export interface LabelPoint {
  key: string;
  x: number;
  y: number;
}
export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: LabelRect, b: LabelRect) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2;

/** Keep names readable and inside the viewport. Crowded labels defer to the complete native list. */
export function layoutMarkerLabels(
  points: LabelPoint[],
  width: number,
  height: number,
) {
  const result = new Map<string, LabelRect & { visible: boolean }>();
  const placed: LabelRect[] = [];
  const pins = points.map((point) => ({ ...point, w: 20, h: 20 }));
  const w = 128,
    h = 32;
  for (const pin of [...points].sort((a, b) => a.key.localeCompare(b.key))) {
    let label = { x: pin.x, y: pin.y, w, h, visible: false };
    if (
      width >= w + 8 &&
      height >= h + 8 &&
      pin.x >= 0 &&
      pin.x <= width &&
      pin.y >= 0 &&
      pin.y <= height
    ) {
      const x = Math.max(w / 2 + 4, Math.min(width - w / 2 - 4, pin.x));
      for (let row = 0; row < 6 && !label.visible; row++) {
        for (const direction of [-1, 1]) {
          const candidate = {
            x,
            y: pin.y + direction * (29 + row * (h + 6)),
            w,
            h,
          };
          if (candidate.y - h / 2 < 4 || candidate.y + h / 2 > height - 4)
            continue;
          if ([...pins, ...placed].some((other) => overlaps(candidate, other)))
            continue;
          label = { ...candidate, visible: true };
          placed.push(label);
          break;
        }
      }
    }
    result.set(pin.key, label);
  }
  return result;
}
