import type { IdentityMetadata } from "../core/types";
export interface ProfilePreferences {
  favorites: string[];
  visibility: Record<string, "shown" | "hidden">;
  roomOverrides: Record<string, string>;
  cameraEventOverrides: Record<string, string[]>;
  identities: IdentityMetadata;
}
export interface PreferencesFile {
  schemaVersion: 1;
  profiles: Record<string, ProfilePreferences>;
}
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
  };
}
