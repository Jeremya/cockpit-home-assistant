import { entityTint } from "../../core/appearance";
import type { Condition } from "../../core/types";
import { markerStyle } from "../markerStyle";
import type { MarkerIcon } from "../sceneModel";

const conditions: Condition[] = [
  "normal",
  "active",
  "attention",
  "alert",
  "unavailable",
  "unknown",
  "stale",
];
const icons: MarkerIcon[] = [
  "lock",
  "climate",
  "fan",
  "switch",
  "camera",
  "sensor",
  "event",
];
/** What the eye can tell apart without colour. */
const silhouette = (condition: Condition) => {
  const style = markerStyle(condition);
  return `${style.head}/${style.mark}/${style.glow > 0 ? "glow" : "plain"}`;
};

test("a reading Maurice cannot vouch for is a hollow ring that never glows", () => {
  for (const condition of ["unavailable", "unknown", "stale"] as const) {
    const style = markerStyle(condition);
    expect(style.head).toBe("ring");
    expect(style.glow).toBe(0);
  }
  // Unavailable and cached readings are not live: no self-illumination at all.
  expect(markerStyle("unavailable").emissive).toBe(0);
  expect(markerStyle("stale").emissive).toBe(0);
  for (const condition of ["normal", "active", "attention", "alert"] as const)
    expect(markerStyle(condition).head).not.toBe("ring");
});

test("only a running or alerting device glows, and a healthy reading stays a plain bead", () => {
  expect(
    conditions.filter((condition) => markerStyle(condition).glow > 0),
  ).toEqual(["active", "alert"]);
  expect(markerStyle("normal")).toMatchObject({ head: "bead", mark: "none" });
  expect(markerStyle("active").emissive).toBeGreaterThan(
    markerStyle("normal").emissive,
  );
  expect(markerStyle("attention").head).toBe("diamond");
  expect(markerStyle("alert").head).toBe("diamond");
});

test("every condition has its own silhouette, so state never relies on colour alone", () => {
  expect(new Set(conditions.map(silhouette)).size).toBe(conditions.length);
  // Explicitly for the shared U04 tints: two conditions that share a colour
  // for a domain (a switch is amber when fine, when it needs attention and
  // when its state is unknown) must still look different.
  for (const icon of icons) {
    const byTint = new Map<string, Condition[]>();
    for (const condition of conditions) {
      const tint = entityTint(icon, condition);
      byTint.set(tint, [...(byTint.get(tint) ?? []), condition]);
    }
    for (const sharing of byTint.values())
      expect(new Set(sharing.map(silhouette)).size).toBe(sharing.length);
  }
});
