import type { KeyValueStorage } from "../services/storage";
import { isPlanPoint, parseHousePlan } from "../spatial/model";
import {
  emptyPreferences,
  emptySpatial,
  type PlanPlacement,
  type PreferencesFile,
  type ProfilePreferences,
  type ProfilePreferencesV1,
  type ProfilePreferencesV2,
  type SwitchEnrollment,
  type SpatialPreferences,
} from "./types";

const CURRENT_VERSION = 3;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const values = <T>(v: unknown, item: (value: unknown) => value is T) =>
  record(v) && Object.values(v).every(item);

/** Returns a copy holding only documented fields, so no stray state is ever persisted. */
function parseV1Profile(value: unknown): ProfilePreferencesV1 | null {
  if (!record(value)) return null;
  const p = value as unknown as ProfilePreferencesV1;
  const identities = p.identities as unknown;
  if (
    !Array.isArray(p.favorites) ||
    !p.favorites.every((v) => typeof v === "string") ||
    !values(p.visibility, (v) => v === "shown" || v === "hidden") ||
    !values(p.roomOverrides, (v): v is string => typeof v === "string") ||
    !values(
      p.cameraEventOverrides,
      (v): v is string[] =>
        Array.isArray(v) && v.every((item) => typeof item === "string"),
    ) ||
    !record(identities) ||
    identities.schemaVersion !== 1 ||
    !values(identities.entityKeys, (v) => typeof v === "string") ||
    !values(identities.aliases, (v) => typeof v === "string")
  )
    return null;
  return {
    favorites: [...p.favorites],
    visibility: { ...p.visibility },
    roomOverrides: { ...p.roomOverrides },
    cameraEventOverrides: { ...p.cameraEventOverrides },
    identities: {
      schemaVersion: 1,
      entityKeys: { ...p.identities.entityKeys },
      aliases: { ...p.identities.aliases },
    },
  };
}
const placement = (v: unknown): v is PlanPlacement =>
  record(v) &&
  text(v.floorId) &&
  (v.roomId === null || text(v.roomId)) &&
  isPlanPoint(v.position);
/** Validates shape only: references to rooms, areas or entities may be unresolved. */
function parseSpatial(value: unknown): SpatialPreferences | null {
  if (!record(value)) return null;
  const plan = value.plan === null ? null : parseHousePlan(value.plan);
  const seeded = value.seededFrom;
  if (
    (value.plan !== null && !plan) ||
    !(
      seeded === null ||
      (record(seeded) &&
        text(seeded.planId) &&
        Number.isInteger(seeded.revision) &&
        Number(seeded.revision) >= 1)
    ) ||
    !values(value.areaLinks, text) ||
    !values(value.placements, placement)
  )
    return null;
  const placements = value.placements as Record<string, PlanPlacement>;
  return {
    plan,
    seededFrom: seeded
      ? { planId: seeded.planId as string, revision: seeded.revision as number }
      : null,
    areaLinks: { ...(value.areaLinks as Record<string, string>) },
    placements: Object.fromEntries(
      Object.entries(placements).map(([key, p]) => [
        key,
        {
          floorId: p.floorId,
          roomId: p.roomId,
          position: { x: p.position.x, z: p.position.z },
        },
      ]),
    ),
  };
}
function parseV2Profile(value: unknown): ProfilePreferencesV2 | null {
  const base = parseV1Profile(value);
  const spatial = record(value) ? parseSpatial(value.spatial) : null;
  return base && spatial ? { ...base, spatial } : null;
}
function parseProfile(value: unknown): ProfilePreferences | null {
  const base = parseV2Profile(value);
  if (!base || !record(value) || !record(value.switchEnrollments)) return null;
  const entries = Object.entries(value.switchEnrollments);
  if (
    entries.some(
      ([key, e]) =>
        !record(e) ||
        !text(e.profileId) ||
        e.entityKey !== key ||
        !text(key) ||
        !text(e.deviceId) ||
        e.platform !== "tplink" ||
        e.manufacturer !== "TP-Link" ||
        typeof e.model !== "string" ||
        !/^HS103(?:\(US\))?$/i.test(e.model) ||
        e.capability !== "switch",
    )
  )
    return null;
  return {
    ...base,
    switchEnrollments: Object.fromEntries(
      entries.map(([key, e]) => {
        const grant = e as unknown as SwitchEnrollment;
        return [
          key,
          {
            profileId: grant.profileId,
            entityKey: grant.entityKey,
            deviceId: grant.deviceId,
            platform: grant.platform,
            manufacturer: grant.manufacturer,
            model: grant.model,
            capability: grant.capability,
          },
        ];
      }),
    ),
  };
}

type Profiles<T> = Record<string, T>;
function parseProfiles<T>(
  value: unknown,
  parse: (profile: unknown) => T | null,
): Profiles<T> | null {
  if (!record(value)) return null;
  const parsed: Profiles<T> = {};
  for (const [id, profile] of Object.entries(value)) {
    const result = parse(profile);
    if (!result) return null;
    parsed[id] = result;
  }
  return parsed;
}
/** Ordered vN -> vN+1 steps; each version is validated as itself before migrating. */
const migrations: Record<number, (profiles: unknown) => unknown> = {
  1: (profiles) => {
    const v1 = parseProfiles(profiles, parseV1Profile);
    if (!v1) return null;
    return Object.fromEntries(
      Object.entries(v1).map(([id, p]) => [
        id,
        { ...p, spatial: emptySpatial() },
      ]),
    );
  },
  2: (profiles) => {
    const v2 = parseProfiles(profiles, parseV2Profile);
    return (
      v2 &&
      Object.fromEntries(
        Object.entries(v2).map(([id, p]) => [
          id,
          { ...p, switchEnrollments: {} },
        ]),
      )
    );
  },
};

class UnsupportedVersion extends Error {}
function parseFile(raw: string): PreferencesFile {
  const file: unknown = JSON.parse(raw);
  if (!record(file) || !Number.isInteger(file.schemaVersion))
    throw new Error("Unsupported preferences");
  let version = file.schemaVersion as number;
  if (version > CURRENT_VERSION) throw new UnsupportedVersion();
  if (version < 1) throw new Error("Unsupported preferences");
  let profiles: unknown = file.profiles;
  for (; version < CURRENT_VERSION; version++) {
    profiles = migrations[version]!(profiles);
    if (!profiles) throw new Error("Invalid preferences");
  }
  const parsed = parseProfiles(profiles, parseProfile);
  if (!parsed) throw new Error("Invalid preferences");
  return { schemaVersion: CURRENT_VERSION, profiles: parsed };
}

export class PreferencesStorage {
  private queue: Promise<void> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}
  async load(): Promise<{ file: PreferencesFile; notice?: string }> {
    const raw = await this.storage.getItem("prefs");
    const empty = (): PreferencesFile => ({
      schemaVersion: CURRENT_VERSION,
      profiles: {},
    });
    if (!raw) return { file: empty() };
    try {
      return { file: parseFile(raw) };
    } catch (error) {
      await this.storage.setItem(`prefs.corrupt.${Date.now()}`, raw);
      return {
        file: empty(),
        notice:
          error instanceof UnsupportedVersion
            ? "Preferences from a newer version of the app were backed up; defaults have been restored."
            : "Invalid preferences were backed up; defaults have been restored.",
      };
    }
  }
  saveProfile(id: string, profile: ProfilePreferences): Promise<void> {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        const { file } = await this.load();
        const parsed = parseProfile(profile);
        if (!parsed) throw new Error("Refusing to save invalid preferences");
        file.profiles[id] = parsed;
        await this.storage.setItem("prefs", JSON.stringify(file));
      });
    this.queue = operation;
    return operation;
  }
  defaults = emptyPreferences;
}
