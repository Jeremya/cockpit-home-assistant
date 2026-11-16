import type { Condition } from "../core/types";

/**
 * How a placed device reads in the miniature, independent of its colour.
 * Colour keeps the shared U04 meaning (`entityTint`); the silhouette says the
 * same thing a second time so state never relies on colour alone:
 *
 * - a filled bead is an observed, unremarkable reading; it glows when running;
 * - a pointed diamond asks for attention; an alert also glows;
 * - a hollow ring is a reading Maurice cannot vouch for — plain when unknown,
 *   struck through when unavailable, with a retained dot when cached.
 *
 * A hollow ring never glows, so it can never be mistaken for a live device.
 */
export type MarkerHead = "bead" | "diamond" | "ring";
export type MarkerMark = "none" | "slash" | "dot";
export interface MarkerStyle {
  head: MarkerHead;
  mark: MarkerMark;
  /** Self-illumination of the head; zero for readings that are not live. */
  emissive: number;
  /** Opacity of the soft halo around the head; zero hides it. */
  glow: number;
}

const styles: Record<Condition, MarkerStyle> = {
  normal: { head: "bead", mark: "none", emissive: 0.22, glow: 0 },
  active: { head: "bead", mark: "none", emissive: 0.9, glow: 0.5 },
  attention: { head: "diamond", mark: "none", emissive: 0.45, glow: 0 },
  alert: { head: "diamond", mark: "none", emissive: 0.9, glow: 0.6 },
  unknown: { head: "ring", mark: "none", emissive: 0.25, glow: 0 },
  unavailable: { head: "ring", mark: "slash", emissive: 0, glow: 0 },
  stale: { head: "ring", mark: "dot", emissive: 0, glow: 0 },
};

export function markerStyle(condition: Condition): MarkerStyle {
  return styles[condition];
}

/** Rendering-only height of a marker head above the plan, in metres. */
export const MARKER_HEIGHT = 1.05;
/** On-screen sizes in CSS pixels; markers keep them at every zoom. */
export const MARKER_HEAD_RADIUS = 8;
export const MARKER_PICK_RADIUS = 22;
export const MARKER_GLOW_SIZE = 46;
