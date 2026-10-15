import type { EntityRecord, HomeSnapshot } from "./types";
import type { ProfilePreferences } from "../preferences/types";
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
