import * as THREE from "three";
import { colors } from "../theme";
import type { SceneMarker } from "./sceneModel";
import { scenePalette } from "./sceneStyle";

/**
 * Canvas-drawn billboards. Every label is fitted to its own text, drawn at
 * twice its CSS size and shown at a constant on-screen size, so names stay
 * crisp and equally readable at any camera distance. No font or image is
 * requested from the network.
 */
const SCALE = 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MARKER_LABEL_HEIGHT = 24;
const MARKER_TEXT_MAX = 132;
const ROOM_LABEL_HEIGHT = 16;

const iconPaths: Record<SceneMarker["icon"], string> = {
  lock: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4",
  climate: "M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0 M12 10v8",
  fan: "M3 8h12a3 3 0 1 0-3-3 M2 12h17 M4 16h11a3 3 0 1 1-3 3",
  switch:
    "M7 7h10a5 5 0 0 1 0 10H7a5 5 0 0 1 0-10 M7 10a2 2 0 1 1 0 4a2 2 0 1 1 0-4",
  camera: "M3 6h12v12H3z M15 10l6-3v10l-6-3",
  sensor: "M2 12h5l3-8l4 16l3-8h5",
  event: "M5 17h14l-2-3V8a5 5 0 0 0-10 0v6z M10 21h4",
};

/** Shortens a name to the available width instead of squeezing its glyphs. */
function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (context.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (
    end > 1 &&
    context.measureText(text.slice(0, end).trimEnd() + "…").width > maxWidth
  )
    end--;
  return text.slice(0, end).trimEnd() + "…";
}

function billboard(canvas: HTMLCanvasElement, width: number, height: number) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      sizeAttenuation: false,
    }),
  );
  sprite.renderOrder = 2;
  sprite.userData.pixelWidth = width;
  sprite.userData.pixelHeight = height;
  return sprite;
}

/** Even sizes keep a centred sprite on whole pixels. */
const even = (value: number) => 2 * Math.ceil(value / 2);

/** A device name: dark glass tag with its domain glyph. State lives on the pin. */
export function markerLabel(text: string, icon: SceneMarker["icon"]) {
  const canvas = document.createElement("canvas");
  let context = canvas.getContext("2d")!;
  // Measured at the size it is drawn: system fonts track differently per size.
  const font = `600 12.5px ${FONT}`;
  context.font = font;
  const shown = fitText(context, text, MARKER_TEXT_MAX);
  const pad = 9,
    glyph = 13,
    gap = 5;
  const height = MARKER_LABEL_HEIGHT;
  const width = even(
    pad + glyph + gap + context.measureText(shown).width + pad + 1,
  );
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  // Resizing a canvas resets its drawing state.
  context = canvas.getContext("2d")!;
  context.scale(SCALE, SCALE);
  context.beginPath();
  context.roundRect(0.5, 0.5, width - 1, height - 1, height / 2);
  context.fillStyle = scenePalette.labelChip;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = scenePalette.labelChipEdge;
  context.stroke();
  context.save();
  context.translate(pad, (height - glyph) / 2);
  context.scale(glyph / 24, glyph / 24);
  context.strokeStyle = colors.muted;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(iconPaths[icon]));
  context.restore();
  context.font = font;
  context.fillStyle = colors.text;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(shown, pad + glyph + gap, height / 2 + 0.5);
  return billboard(canvas, width, height);
}

/** A room name: a small paper tag in spaced capitals, like a model's legend. */
export function roomLabel(text: string) {
  const canvas = document.createElement("canvas");
  let context = canvas.getContext("2d")!;
  const size = 9.5;
  const spacing = 1.1;
  const letters = [...text.toUpperCase().slice(0, 28)];
  const font = `700 ${size}px ${FONT}`;
  context.font = font;
  const advance = letters.map(
    (letter) => context.measureText(letter).width + spacing,
  );
  const textWidth = advance.reduce((sum, value) => sum + value, -spacing);
  const height = ROOM_LABEL_HEIGHT;
  const width = even(textWidth + 14);
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  context = canvas.getContext("2d")!;
  context.scale(SCALE, SCALE);
  context.beginPath();
  context.roundRect(0, 0, width, height, 5);
  context.fillStyle = scenePalette.roomTag;
  context.fill();
  context.font = font;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = scenePalette.labelInk;
  let cursor = (width - textWidth) / 2;
  letters.forEach((letter, index) => {
    context.fillText(letter, cursor, height / 2 + 0.5);
    cursor += advance[index]!;
  });
  return billboard(canvas, width, height);
}
