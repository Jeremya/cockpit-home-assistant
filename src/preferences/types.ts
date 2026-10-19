import type { IdentityMetadata } from "../core/types";
import type { HousePlan, PlanPoint } from "../spatial/model";
export interface PlanPlacement {
  floorId: string;
  roomId: string | null;
  /** X/Z meters on the floor; elevation comes from the floor later. */
  position: PlanPoint;
}
/** References may be unresolved (deleted room, area or entity); they are kept for diagnostics. */
export interface SpatialPreferences {
  plan: HousePlan | null;
  seededFrom: { planId: string; revision: number } | null;
  /** Plan-room ID -> HA area ID. */
  areaLinks: Record<string, string>;
  /** Stable entity key -> placement. */
  placements: Record<string, PlanPlacement>;
}
export interface ProfilePreferences {
  favorites: string[];
  visibility: Record<string, "shown" | "hidden">;
  roomOverrides: Record<string, string>;
  cameraEventOverrides: Record<string, string[]>;
  identities: IdentityMetadata;
  spatial: SpatialPreferences;
  /** Explicit power permission; never follows identity aliases. */
  switchEnrollments: Record<string, SwitchEnrollment>;
}
export interface SwitchEnrollment {
  profileId: string;
  entityKey: string;
  deviceId: string;
  platform: "tplink";
  manufacturer: "TP-Link";
  model: string;
  capability: "switch";
}
export type ProfilePreferencesV2 = Omit<
  ProfilePreferences,
  "switchEnrollments"
>;
export type ProfilePreferencesV1 = Omit<ProfilePreferencesV2, "spatial">;
export interface PreferencesFile {
  schemaVersion: 3;
  profiles: Record<string, ProfilePreferences>;
}
export const emptySpatial = (): SpatialPreferences => ({
  plan: null,
  seededFrom: null,
  areaLinks: {},
  placements: {},
});
export const emptyIdentity = (): IdentityMetadata => ({
  schemaVersion: 1,
  entityKeys: {},
  aliases: {},
});
export const emptyPreferences = (): ProfilePreferences => ({
  favorites: [],
  visibility: {},
  roomOverrides: {},
  cameraEventOverrides: {},
  identities: emptyIdentity(),
  spatial: emptySpatial(),
  switchEnrollments: {},
});
export function resolveAlias(
  key: string,
  aliases: Record<string, string>,
): string {
  const seen = new Set<string>();
  while (aliases[key] && !seen.has(key)) {
    seen.add(key);
    key = aliases[key]!;
  }
  return key;
}
export function reconcilePreferences(
  p: ProfilePreferences,
  identities: IdentityMetadata,
): ProfilePreferences {
  const resolve = (key: string) => resolveAlias(key, identities.aliases);
  const rekey = <T>(values: Record<string, T>) => {
    const entries = Object.entries(values).sort(
      ([a], [b]) => Number(resolve(a) === a) - Number(resolve(b) === b),
    );
    return Object.fromEntries(
      entries.map(([key, value]) => [resolve(key), value]),
    );
  };
  return {
    ...p,
    identities,
    favorites: [...new Set(p.favorites.map(resolve))],
    visibility: rekey(p.visibility),
    roomOverrides: rekey(p.roomOverrides),
    cameraEventOverrides: Object.fromEntries(
      Object.entries(rekey(p.cameraEventOverrides)).map(([key, values]) => [
        key,
        values.map(resolve),
      ]),
    ),
    spatial: { ...p.spatial, placements: rekey(p.spatial.placements) },
  };
}
