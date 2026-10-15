import { Credentials, credentialKey } from "../credentials";
import type { KeyValueStorage } from "../storage";
import {
  normalizeUrl,
  validateSettings,
} from "../../session/homeAssistant/url";
class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}
test.each(["https://home.example.com:8443", "http://[::1]:8123"])(
  "credentials save, load and forget with safe keys: %s",
  async (url) => {
    const local = new MemoryStorage();
    const secrets = new MemoryStorage();
    const credentials = new Credentials(local, secrets, () => "uuid-123");
    await credentials.save({
      url,
      token: "private-token",
      allowInsecureHttp: true,
    });
    expect(await credentials.load()).toEqual({
      url,
      token: "private-token",
      allowInsecureHttp: true,
    });
    expect([...secrets.values.keys()]).toEqual(["profile.uuid123.token"]);
    expect(JSON.stringify([...local.values])).not.toContain("private-token");
    await credentials.forget(url);
    expect(await credentials.load()).toBeNull();
    expect(secrets.values.size).toBe(0);
  },
);
test("a journal removes an orphaned token after an interrupted save", async () => {
  const local = new MemoryStorage();
  const secrets = new MemoryStorage();
  await local.setItem(
    "profiles.v1",
    JSON.stringify({
      version: 1,
      active: null,
      entries: {},
      pending: { id: "ha:https://home.local", storageId: "orphan" },
    }),
  );
  await secrets.setItem(credentialKey("orphan"), "secret");
  expect(await new Credentials(local, secrets, () => "new").load()).toBeNull();
  expect(secrets.values.size).toBe(0);
});
test("forget cannot be overtaken by a pending credential write", async () => {
  const local = new MemoryStorage();
  const secrets = new MemoryStorage();
  const credentials = new Credentials(local, secrets, () => "new");
  await Promise.all([
    credentials.save({
      url: "https://home.local",
      token: "token",
      allowInsecureHttp: false,
    }),
    credentials.forget("https://home.local"),
  ]);
  expect(await credentials.load()).toBeNull();
  expect(secrets.values.size).toBe(0);
});
test("a crash after committing replacement metadata still cleans the superseded token on restart", async () => {
  const local = new MemoryStorage();
  const secrets = new MemoryStorage();
  let n = 0;
  const credentials = new Credentials(local, secrets, () => `id${++n}`);
  const settings = {
    url: "https://home.local",
    token: "old",
    allowInsecureHttp: false,
  };
  await credentials.save(settings);
  const remove = jest
    .spyOn(secrets, "removeItem")
    .mockRejectedValueOnce(new Error("process stopped"));
  await credentials.save({ ...settings, token: "new" }).catch(() => undefined);
  remove.mockRestore();
  const restarted = new Credentials(local, secrets, () => "unused");
  expect((await restarted.load())?.token).toBe("new");
  expect([...secrets.values.values()]).toEqual(["new"]);
});
test("an interrupted Forget cannot reactivate the forgotten profile on restart", async () => {
  const local = new MemoryStorage();
  const secrets = new MemoryStorage();
  const credentials = new Credentials(local, secrets, () => "one");
  await credentials.save({
    url: "https://home.local",
    token: "secret",
    allowInsecureHttp: false,
  });
  jest
    .spyOn(secrets, "removeItem")
    .mockRejectedValueOnce(new Error("process stopped"));
  await expect(credentials.forget("https://home.local")).rejects.toThrow(
    "process stopped",
  );
  expect(await new Credentials(local, secrets, () => "two").load()).toBeNull();
  expect(secrets.values.size).toBe(0);
});
test("metadata whose token is missing is removed without blocking the storage queue", async () => {
  const local = new MemoryStorage();
  const secrets = new MemoryStorage();
  const credentials = new Credentials(local, secrets, () => "one");
  await credentials.save({
    url: "https://home.local",
    token: "secret",
    allowInsecureHttp: false,
  });
  secrets.values.clear();
  expect(await credentials.load()).toBeNull();
  expect(await credentials.load()).toBeNull();
});
test.each([
  "ftp://home.local",
  "https://user:pass@home.local",
  "https://home.local/path",
  "https://home.local?token=secret",
  "https://home.local#secret",
  "home.local",
])("rejects unsupported origins: %s", (url) => {
  expect(() => normalizeUrl(url)).toThrow();
});
test("HTTP requires explicit consent and normalization removes default port and trailing slash", () => {
  expect(normalizeUrl(" https://HOME.example:443/ ")).toBe(
    "https://home.example",
  );
  expect(() =>
    validateSettings({
      url: "http://192.168.1.3:8123",
      token: "token",
      allowInsecureHttp: false,
    }),
  ).toThrow();
});
