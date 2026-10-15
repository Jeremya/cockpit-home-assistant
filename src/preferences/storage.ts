import type { KeyValueStorage } from "../services/storage";
import {
  emptyPreferences,
  type PreferencesFile,
  type ProfilePreferences,
} from "./types";
function validProfile(value: unknown): value is ProfilePreferences {
  if (!value || typeof value !== "object") return false;
  const p = value as ProfilePreferences;
  const record = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  return (
    Array.isArray(p.favorites) &&
    p.favorites.every((v) => typeof v === "string") &&
    record(p.visibility) &&
    Object.values(p.visibility).every((v) => v === "shown" || v === "hidden") &&
    record(p.roomOverrides) &&
    Object.values(p.roomOverrides).every((v) => typeof v === "string") &&
    record(p.cameraEventOverrides) &&
    Object.values(p.cameraEventOverrides).every(
      (v) => Array.isArray(v) && v.every((item) => typeof item === "string"),
    ) &&
    p.identities?.schemaVersion === 1 &&
    record(p.identities.entityKeys) &&
    record(p.identities.aliases) &&
    Object.values(p.identities.entityKeys).every(
      (v) => typeof v === "string",
    ) &&
    Object.values(p.identities.aliases).every((v) => typeof v === "string")
  );
}
export class PreferencesStorage {
  private queue: Promise<void> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}
  async load(): Promise<{ file: PreferencesFile; notice?: string }> {
    const raw = await this.storage.getItem("prefs");
    if (!raw) return { file: { schemaVersion: 1, profiles: {} } };
    try {
      const file = JSON.parse(raw) as PreferencesFile;
      if (
        file.schemaVersion !== 1 ||
        !file.profiles ||
        !Object.values(file.profiles).every(validProfile)
      )
        throw new Error("Unsupported preferences");
      return { file };
    } catch {
      await this.storage.setItem(`prefs.corrupt.${Date.now()}`, raw);
      return {
        file: { schemaVersion: 1, profiles: {} },
        notice:
          "Invalid preferences were backed up; defaults have been restored.",
      };
    }
  }
  saveProfile(id: string, profile: ProfilePreferences): Promise<void> {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        const { file } = await this.load();
        file.profiles[id] = profile;
        await this.storage.setItem("prefs", JSON.stringify(file));
      });
    this.queue = operation;
    return operation;
  }
  defaults = emptyPreferences;
}
