import type { Condition, EntityRecord, HomeSnapshot } from "../core/types";
import { getCondition } from "../core/policy";
import { isVisible } from "../core/selectors";
import {
  resolveAlias,
  type PlanPlacement,
  type ProfilePreferences,
} from "../preferences/types";
import { isPlanPoint, pointInPolygon, type HousePlan } from "./model";

export type PlacementIssue =
  | "floor_missing"
  | "room_missing"
  | "outside_floor"
  | "outside_room"
  | "entity_missing"
  | "entity_unverified"
  | "entity_hidden";
export const placementIssueLabel: Record<PlacementIssue, string> = {
  floor_missing: "Floor is no longer in this plan",
  room_missing: "Room is no longer on this floor",
  outside_floor: "Position is outside the floor",
  outside_room: "Position is outside the chosen room",
  entity_missing: "Not in current observations",
  entity_unverified: "Connect to verify this entity",
  entity_hidden: "Hidden or disabled entity",
};
export function placementGeometryIssue(
  plan: HousePlan,
  placement: PlanPlacement,
): PlacementIssue | null {
  const floor = plan.floors.find((f) => f.id === placement.floorId);
  if (!floor) return "floor_missing";
  if (
    !isPlanPoint(placement.position) ||
    !pointInPolygon(placement.position, floor.outline)
  )
    return "outside_floor";
  if (placement.roomId !== null) {
    const room = floor.rooms.find((r) => r.id === placement.roomId);
    if (!room) return "room_missing";
    if (!pointInPolygon(placement.position, room.polygon))
      return "outside_room";
  }
  return null;
}
export function placementEntity(
  snapshot: HomeSnapshot | null,
  prefs: ProfilePreferences,
  key: string,
) {
  const canonical = resolveAlias(key, prefs.identities.aliases);
  return (
    Object.values(snapshot?.entities ?? {}).find(
      (entity) => entity.key === canonical,
    ) ?? null
  );
}
export interface SavedPlacement {
  storedKey: string;
  key: string;
  placement: PlanPlacement;
  entity: EntityRecord | null;
  condition: Condition;
  issues: PlacementIssue[];
}
/** Never matches by name or mutable entityId; unresolved configuration is retained. */
export function savedPlacements(
  snapshot: HomeSnapshot | null,
  prefs: ProfilePreferences,
  plan: HousePlan,
  ready: boolean,
): SavedPlacement[] {
  const entities = new Map(
    Object.values(snapshot?.entities ?? {}).map((entity) => [
      entity.key,
      entity,
    ]),
  );
  const result = new Map<string, SavedPlacement>();
  for (const [storedKey, placement] of Object.entries(
    prefs.spatial.placements,
  )) {
    const key = resolveAlias(storedKey, prefs.identities.aliases);
    if (result.get(key)?.storedKey === key && storedKey !== key) continue; // canonical entry wins
    const entity = entities.get(key) ?? null;
    const geometryIssue = placementGeometryIssue(plan, placement);
    const issues: PlacementIssue[] = geometryIssue ? [geometryIssue] : [];
    if (!entity) issues.push(snapshot ? "entity_missing" : "entity_unverified");
    else if (!isVisible(entity, prefs)) issues.push("entity_hidden");
    result.set(key, {
      storedKey,
      key,
      placement,
      entity,
      condition: entity ? getCondition(entity, ready) : "unknown",
      issues,
    });
  }
  return [...result.values()];
}
export function withoutPlacement(prefs: ProfilePreferences, key: string) {
  const canonical = resolveAlias(key, prefs.identities.aliases);
  return Object.fromEntries(
    Object.entries(prefs.spatial.placements).filter(
      ([stored]) =>
        resolveAlias(stored, prefs.identities.aliases) !== canonical,
    ),
  );
}
