import { resolveAlias, type ProfilePreferences } from "../preferences/types";
import { assessEntity, needsAttention } from "./policy";
import { attentionPriority, isVisible, roomId } from "./selectors";
import {
  OBSERVATION_DOMAINS,
  type EntityRecord,
  type HomeSnapshot,
  type PhysicalDevice,
} from "./types";

export interface DeviceSummary {
  /** View identity only; never persisted as an entity favorite or placement key. */
  id: string;
  profileId: string;
  deviceId: string | null;
  device: PhysicalDevice | null;
  name: string;
  members: EntityRecord[];
  roomIds: (string | null)[];
  roomLabel: string;
  favoriteRank: number | null;
  issues: EntityRecord[];
  coverage: {
    assessed: number;
    visible: number;
    unknown: number;
    unavailable: number;
    missing: number;
    metadataCached: boolean;
  };
}
const domains = new Set<string>(OBSERVATION_DOMAINS);

/** One view model per actual HA device membership, or per standalone reading. */
export function deviceSummaries(
  snapshot: HomeSnapshot,
  prefs: ProfilePreferences,
  profileId: string,
  ready: boolean,
): DeviceSummary[] {
  const groups = new Map<string, EntityRecord[]>();
  for (const entity of Object.values(snapshot.entities)) {
    if (!isVisible(entity, prefs)) continue;
    const key = entity.deviceId
      ? `device:${entity.deviceId}`
      : `entity:${entity.key}`;
    const members = groups.get(key) ?? [];
    members.push(entity);
    groups.set(key, members);
  }
  const aliases = {
    ...prefs.identities.aliases,
    ...snapshot.identities.aliases,
  };
  const favorites = prefs.favorites.map((key) => resolveAlias(key, aliases));
  return [...groups]
    .map(([key, members]): DeviceSummary => {
      members.sort(
        (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
      );
      const deviceId = members[0]!.deviceId;
      const device = deviceId ? (snapshot.devices[deviceId] ?? null) : null;
      const rooms = [
        ...new Set(members.map((e) => roomId(e, snapshot, prefs))),
      ];
      const assessments = members.map((entity) => ({
        entity,
        ...assessEntity(entity, ready),
      }));
      const ranks = members
        .map((e) => favorites.indexOf(e.key))
        .filter((rank) => rank >= 0);
      const missing = deviceId
        ? new Set(
            snapshot.registryEntries
              .filter((entry) => {
                if (
                  entry.device_id !== deviceId ||
                  entry.disabled_by ||
                  snapshot.entities[entry.entity_id]
                )
                  return false;
                if (!domains.has(entry.entity_id.split(".")[0]!)) return false;
                const override = prefs.visibility[entry.id];
                return override
                  ? override === "shown"
                  : !entry.hidden_by && entry.entity_category === null;
              })
              .map((e) => e.id),
          ).size
        : 0;
      return {
        id: JSON.stringify([profileId, key]),
        profileId,
        deviceId,
        device,
        name:
          (device?.name && device.name !== device.id ? device.name : null) ||
          (members.length === 1 ? members[0]!.name : "Unnamed device"),
        members,
        roomIds: rooms,
        roomLabel:
          rooms.length > 1
            ? "Multiple rooms"
            : rooms[0]
              ? (snapshot.areas[rooms[0]]?.name ?? "Unassigned")
              : "Unassigned",
        favoriteRank: ranks.length ? Math.min(...ranks) : null,
        issues: assessments
          .filter((a) => needsAttention(a.condition))
          .sort(
            (a, b) =>
              (attentionPriority[a.condition] ?? 4) -
              (attentionPriority[b.condition] ?? 4),
          )
          .map((a) => a.entity),
        coverage: {
          assessed: assessments.filter((a) => a.ruleApplied).length,
          visible: members.length,
          unknown: assessments.filter((a) => a.condition === "unknown").length,
          unavailable: assessments.filter((a) => a.condition === "unavailable")
            .length,
          missing,
          metadataCached: Object.values(snapshot.metadata).some(
            (meta) => meta.kind !== "fresh",
          ),
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
