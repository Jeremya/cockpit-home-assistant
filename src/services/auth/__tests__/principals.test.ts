import { GrantPrincipals, PRINCIPALS_KEY, principalFor } from "../principals";

class MemoryStorage {
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
const profile = "ha:https://home.example.com";

test("a principal names the HA user of one instance without storing its id", async () => {
  const alice = await principalFor("https://home.example.com", "user-alice");
  expect(alice).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(alice).not.toContain("alice");
  expect(await principalFor("https://home.example.com", "user-alice")).toBe(
    alice,
  );
  expect(await principalFor("https://home.example.com", "user-bob")).not.toBe(
    alice,
  );
  expect(
    await principalFor("https://other.example.com", "user-alice"),
  ).not.toBe(alice);
  // SHA-256 of "https://home.example.com\nuser-alice", base64url.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("https://home.example.com\nuser-alice"),
  );
  expect(alice).toBe(
    Buffer.from(digest)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  );
});

test("principals are recorded per profile in their own versioned record", async () => {
  const storage = new MemoryStorage();
  const principals = new GrantPrincipals(storage);
  expect(await principals.get(profile)).toBeUndefined();
  const alice = await principalFor("https://home.example.com", "user-alice");
  const other = await principalFor("https://other.example.com", "user-alice");
  await principals.set(profile, alice);
  await principals.set("ha:https://other.example.com", other);
  expect(await principals.get(profile)).toBe(alice);
  expect(JSON.parse(storage.values.get(PRINCIPALS_KEY)!)).toEqual({
    version: 1,
    principals: { [profile]: alice, "ha:https://other.example.com": other },
  });
  expect([...storage.values.keys()]).toEqual([PRINCIPALS_KEY]);
});

test.each([
  "not json",
  JSON.stringify({ version: 2, principals: {} }),
  JSON.stringify({ version: 1, principals: { [profile]: "short" } }),
  JSON.stringify({ version: 1, principals: [] }),
  JSON.stringify({ version: 1, principals: {}, extra: true }),
])("an unreadable record %s means unknown principals", async (raw) => {
  const storage = new MemoryStorage();
  storage.values.set(PRINCIPALS_KEY, raw);
  const principals = new GrantPrincipals(storage);
  expect(await principals.get(profile)).toBeUndefined();
  const alice = await principalFor("https://home.example.com", "user-alice");
  await principals.set(profile, alice);
  expect(JSON.parse(storage.values.get(PRINCIPALS_KEY)!)).toEqual({
    version: 1,
    principals: { [profile]: alice },
  });
});

test("concurrent writes keep every profile", async () => {
  const storage = new MemoryStorage();
  const principals = new GrantPrincipals(storage);
  const alice = await principalFor("https://home.example.com", "user-alice");
  await Promise.all([
    principals.set(profile, alice),
    principals.set("ha:https://other.example.com", alice),
  ]);
  expect(await principals.get(profile)).toBe(alice);
  expect(await principals.get("ha:https://other.example.com")).toBe(alice);
});

test("a malformed principal is never written", async () => {
  const principals = new GrantPrincipals(new MemoryStorage());
  await expect(principals.set(profile, "user-alice")).rejects.toThrow();
});
