import type { Condition, EntityRecord, HomeSnapshot } from "./types";
import type { ProfilePreferences } from "../preferences/types";
import { assessEntity, needsAttention } from "./policy";
export function isVisible(
  entity: EntityRecord,
  prefs: ProfilePreferences,
): boolean {
  if (entity.disabledInHA) return false;
  const override = prefs.visibility[entity.key];
  return override
    ? override === "shown"
    : !entity.hiddenInHA && entity.entityCategory === null;
}
export function roomId(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  prefs: ProfilePreferences,
): string | null {
  const requested =
    prefs.roomOverrides[entity.key] ??
    entity.areaId ??
    (entity.deviceId ? snapshot.devices[entity.deviceId]?.areaId : null);
  return requested && snapshot.areas[requested] ? requested : null;
}
export function groupByRoom(snapshot: HomeSnapshot, prefs: ProfilePreferences) {
  const groups = new Map<
    string,
    { id: string; name: string; entityIds: string[] }
  >();
  for (const entity of Object.values(snapshot.entities)) {
    if (!isVisible(entity, prefs)) continue;
    const id = roomId(entity, snapshot, prefs) ?? "unassigned";
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: snapshot.areas[id]?.name ?? "Unassigned",
        entityIds: [],
      });
    groups.get(id)!.entityIds.push(entity.entityId);
  }
  return [...groups.values()].sort((a, b) =>
    a.id === "unassigned"
      ? 1
      : b.id === "unassigned"
        ? -1
        : a.name.localeCompare(b.name),
  );
}

/** Global visible coverage, independent of the selected room or physical grouping. */
export const attentionPriority: Partial<Record<Condition, number>> = {
  alert: 0,
  attention: 1,
  unavailable: 2,
  unknown: 3,
};
export function attentionSummary(
  snapshot: HomeSnapshot,
  prefs: ProfilePreferences,
  ready: boolean,
) {
  const visible = Object.values(snapshot.entities).filter((entity) =>
    isVisible(entity, prefs),
  );
  const assessed = visible.map((entity) => ({
    entity,
    assessment: assessEntity(entity, ready),
  }));
  return {
    visibleCount: visible.length,
    assessedCount: assessed.filter((item) => item.assessment.ruleApplied)
      .length,
    unassessedCount: assessed.filter((item) => !item.assessment.ruleApplied)
      .length,
    items: assessed
      .filter((item) => needsAttention(item.assessment.condition))
      .sort(
        (a, b) =>
          (attentionPriority[a.assessment.condition] ?? 4) -
          (attentionPriority[b.assessment.condition] ?? 4),
      )
      .map((item) => item.entity),
  };
}
