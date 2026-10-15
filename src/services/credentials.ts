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
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.mutations.catch(() => undefined).then(operation);
    this.mutations = next;
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
    return data;
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
    try {
      await this.secrets.setItem(credentialKey(storageId), settings.token);
      const committed: Profiles = {
        version: 1,
        active: id,
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
    if (previous)
      await this.secrets.removeItem(credentialKey(previous.storageId));
  }
  async load(): Promise<ConnectionSettings | null> {
    await this.mutations.catch(() => undefined);
    const data = await this.profiles();
    const entry = data.active ? data.entries[data.active] : undefined;
    if (!entry) return null;
    const token = await this.secrets.getItem(credentialKey(entry.storageId));
    if (!token) {
      await this.forget(entry.url);
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
    if (entry) await this.secrets.removeItem(credentialKey(entry.storageId));
    delete data.entries[id];
    if (data.active === id) data.active = null;
    await this.local.setItem(KEY, JSON.stringify(data));
  }
}
