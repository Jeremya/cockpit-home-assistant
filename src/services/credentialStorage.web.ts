import type { KeyValueStorage } from "./storage";

/** Credentials never touch browser persistence; each page owns isolated stores. */
export function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

export const credentialPersistence = "page" as "device" | "page";
export const connectionStorage = memoryStorage();
export const secretStorage = memoryStorage();
