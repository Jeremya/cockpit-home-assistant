import type { ConnectionSettings } from "../core/types";
import { profileIdFor, validateSettings } from "../session/homeAssistant/url";
import type { KeyValueStorage } from "./storage";
interface Profile {
  storageId: string;
  url: string;
  allowInsecureHttp: boolean;
}
interface Profiles {
  version: 1;
  active: string | null;
  entries: Record<string, Profile>;
  pending?: { id: string; storageId: string };
  cleanupStorageIds?: string[];
}
const KEY = "profiles.v1";
export const credentialKey = (storageId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(storageId))
    throw new Error("Invalid credential storage identifier");
  return `profile.${storageId}.token`;
};
export class Credentials {
  private mutations: Promise<void> = Promise.resolve();
  constructor(
    private local: KeyValueStorage,
    private secrets: KeyValueStorage,
    private randomId: () => string,
  ) {}
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.catch(() => undefined).then(operation);
    this.mutations = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  private async profiles(): Promise<Profiles> {
    const raw = await this.local.getItem(KEY);
    if (!raw) return { version: 1, active: null, entries: {} };
    const data = JSON.parse(raw) as Profiles;
    if (data.version !== 1 || !data.entries || typeof data.entries !== "object")
      throw new Error("Stored connection configuration is invalid.");
    if (data.pending) {
      await this.secrets.removeItem(credentialKey(data.pending.storageId));
      delete data.pending;
      await this.local.setItem(KEY, JSON.stringify(data));
    }
    await this.cleanup(data);
    return data;
  }
  private async cleanup(data: Profiles): Promise<void> {
    if (!data.cleanupStorageIds?.length) return;
    const referenced = new Set(
      Object.values(data.entries).map((entry) => entry.storageId),
    );
    for (const storageId of data.cleanupStorageIds) {
      if (!referenced.has(storageId))
        await this.secrets.removeItem(credentialKey(storageId));
    }
    delete data.cleanupStorageIds;
    await this.local.setItem(KEY, JSON.stringify(data));
  }
  save(input: ConnectionSettings): Promise<void> {
    return this.enqueue(() => this.saveNow(input));
  }
  private async saveNow(input: ConnectionSettings): Promise<void> {
    const settings = validateSettings(input);
    const data = await this.profiles();
    const id = profileIdFor(settings.url);
    const previous = data.entries[id];
    const storageId = this.randomId().replaceAll("-", "");
    // Journal the id before writing the secret: SecureStore does not support enumeration.
    data.pending = { id, storageId };
    await this.local.setItem(KEY, JSON.stringify(data));
    let committed: Profiles;
    try {
      await this.secrets.setItem(credentialKey(storageId), settings.token);
      committed = {
        version: 1,
        active: id,
        cleanupStorageIds: previous ? [previous.storageId] : [],
        entries: {
          ...data.entries,
          [id]: {
            storageId,
            url: settings.url,
            allowInsecureHttp: settings.allowInsecureHttp,
          },
        },
      };
      await this.local.setItem(KEY, JSON.stringify(committed));
    } catch (error) {
      await this.secrets.removeItem(credentialKey(storageId));
      throw error;
    }
    // Keep superseded ids durable until deletion succeeds, including after a crash.
    await this.cleanup(committed);
  }
  load(): Promise<ConnectionSettings | null> {
    return this.enqueue(() => this.loadNow());
  }
  private async loadNow(): Promise<ConnectionSettings | null> {
    const data = await this.profiles();
    const entry = data.active ? data.entries[data.active] : undefined;
    if (!entry) return null;
    const token = await this.secrets.getItem(credentialKey(entry.storageId));
    if (!token) {
      await this.forgetNow(entry.url);
      return null;
    }
    return validateSettings({
      url: entry.url,
      allowInsecureHttp: entry.allowInsecureHttp,
      token,
    });
  }
  forget(origin: string): Promise<void> {
    return this.enqueue(() => this.forgetNow(origin));
  }
  private async forgetNow(origin: string): Promise<void> {
    const data = await this.profiles();
    const id = profileIdFor(origin);
    const entry = data.entries[id];
    if (entry) data.cleanupStorageIds = [entry.storageId];
    delete data.entries[id];
    if (data.active === id) data.active = null;
    await this.local.setItem(KEY, JSON.stringify(data));
    await this.cleanup(data);
  }
}
