import type { Condition, EntityRecord } from "./types";
export function getCondition(entity: EntityRecord, ready: boolean): Condition {
  if (!ready) return "stale";
  if (entity.state === "unavailable") return "unavailable";
  if (entity.state === "unknown") return "unknown";
  if (entity.domain === "lock") {
    if (entity.state === "jammed") return "alert";
    if (["open", "unlocked"].includes(entity.state)) return "attention";
    if (["locking", "unlocking", "opening"].includes(entity.state))
      return "active";
    return entity.state === "locked" ? "normal" : "unknown";
  }
  return entity.state === "on" ? "active" : "normal";
}
