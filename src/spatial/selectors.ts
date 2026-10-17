import type { Area, EntityRecord, HomeSnapshot } from "../core/types";
import type { ProfilePreferences } from "../preferences/types";
import { isVisible, roomId } from "../core/selectors";
import type { HousePlan } from "./model";

/**
 * Plan rooms meet HA only through explicit links (plan-room ID -> HA area ID).
 * An entity's HA room still resolves app override -> entity area -> device area;
 * only that resolved area is then mapped onto the plan. Nothing is name-matched.
 */
/** Reads only a record's own properties: plan and area IDs are data, never prototype keys. */
export function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}
const dictionary = <T>(): Record<string, T> => Object.create(null);

export type AreaLinkStatus =
  | { kind: "unlinked" }
  /** `verified` is false when the name comes from a stale area registry. */
  | { kind: "linked"; area: Area; verified: boolean }
  /** The area registry is fresh and no longer contains this area. */
  | { kind: "missing"; areaId: string }
  /** Area names are unavailable (offline or stale registry): kept as is. */
  | { kind: "unverified"; areaId: string };

export function areaLinkStatus(
  planRoomId: string,
  areaLinks: Record<string, string>,
  snapshot: HomeSnapshot | null,
): AreaLinkStatus {
  const areaId = own(areaLinks, planRoomId);
  if (!areaId) return { kind: "unlinked" };
  const fresh = snapshot?.metadata.areas.kind === "fresh";
  const area = snapshot && own(snapshot.areas, areaId);
  if (area) return { kind: "linked", area, verified: fresh };
  return fresh ? { kind: "missing", areaId } : { kind: "unverified", areaId };
}

/** Links a room to an area (or unlinks it); an area belongs to one room at most. */
export function setAreaLink(
  areaLinks: Record<string, string>,
  planRoomId: string,
  areaId: string | null,
): Record<string, string> {
  // fromEntries defines own properties, so even "__proto__" stays a plain key.
  return Object.fromEntries([
    ...Object.entries(areaLinks).filter(
      ([room, area]) => room !== planRoomId && area !== areaId,
    ),
    ...(areaId ? [[planRoomId, areaId] as const] : []),
  ]);
}

export function planRoomForEntity(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  prefs: ProfilePreferences,
  plan: HousePlan,
): { floorId: string; roomId: string } | null {
  const areaId = roomId(entity, snapshot, prefs);
  if (!areaId) return null;
  for (const floor of plan.floors)
    for (const room of floor.rooms)
      if (own(prefs.spatial.areaLinks, room.id) === areaId)
        return { floorId: floor.id, roomId: room.id };
  return null;
}

/** Visible entities grouped by plan room; everything else stays in `unlinked`. */
export function entitiesByPlanRoom(
  snapshot: HomeSnapshot,
  prefs: ProfilePreferences,
  plan: HousePlan,
): { byRoom: Record<string, string[]>; unlinked: string[] } {
  const byRoom = dictionary<string[]>();
  const unlinked: string[] = [];
  for (const [id, entity] of Object.entries(snapshot.entities)) {
    if (!isVisible(entity, prefs)) continue;
    const room = planRoomForEntity(entity, snapshot, prefs, plan);
    if (room) (own(byRoom, room.roomId) ?? (byRoom[room.roomId] = [])).push(id);
    else unlinked.push(id);
  }
  return { byRoom, unlinked };
}
