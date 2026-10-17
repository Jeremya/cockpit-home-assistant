import type { Condition } from "./types";
import { colors } from "../theme";

/** The native cards, SVG markers and DOM markers share these presentation colors. */
export function entityTint(domain: string, condition: Condition) {
  if (condition === "stale" || condition === "unavailable") return colors.muted;
  if (condition === "alert") return colors.danger;
  if (condition === "attention" || condition === "unknown")
    return colors.warning;
  if (["lock", "camera", "event"].includes(domain)) return colors.security;
  if (["climate", "fan"].includes(domain)) return colors.comfort;
  return domain === "switch" ? colors.warning : colors.sensor;
}
