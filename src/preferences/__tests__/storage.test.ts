import { PreferencesStorage } from "../storage";
import {
  emptyIdentity,
  emptyPreferences,
  reconcilePreferences,
} from "../types";
test("corrupt preferences are backed up and do not prevent startup", async () => {
  const values = new Map([["prefs", "{bad-json"]]);
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
  const result = await new PreferencesStorage(storage).load();
  expect(result.file.profiles).toEqual({});
  expect(result.notice).toBeTruthy();
  expect(
    [...values.keys()].some((key) => key.startsWith("prefs.corrupt.")),
  ).toBe(true);
});
test("aliases migrate favorites, rooms, visibility and camera associations without overwriting newer preferences", () => {
  const prefs = {
    ...emptyPreferences(),
    favorites: ["entity:lock.door", "stable"],
    roomOverrides: { "entity:lock.door": "old-room", stable: "new-room" },
    visibility: { "entity:lock.door": "hidden" as const },
    cameraEventOverrides: { "entity:lock.door": ["entity:lock.door"] },
  };
  const migrated = reconcilePreferences(prefs, {
    ...emptyIdentity(),
    aliases: { "entity:lock.door": "stable" },
  });
  expect(migrated.favorites).toEqual(["stable"]);
  expect(migrated.roomOverrides.stable).toBe("new-room");
  expect(migrated.visibility.stable).toBe("hidden");
  expect(migrated.cameraEventOverrides.stable).toEqual(["stable"]);
});
