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
