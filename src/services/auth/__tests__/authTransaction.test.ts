import { createHash } from "node:crypto";
import {
  TRANSACTION_KEY,
  TRANSACTION_TTL_MS,
  beginTransaction,
  consumeCallback,
  type TransactionStorage,
} from "../authTransaction";

const appOrigin = "http://localhost:8094";
const hassUrl = "http://127.0.0.1:8123";

function pageStorage(): TransactionStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function setup(start = 1_000_000) {
  const storage = pageStorage();
  const clock = { now: start };
  const deps = {
    storage,
    crypto: globalThis.crypto,
    now: () => clock.now,
    app: { origin: appOrigin, secureContext: true },
  };
  return { storage, clock, deps };
}

async function begin(
  deps: ReturnType<typeof setup>["deps"],
  extra: { returnTo?: unknown; remember?: boolean } = {},
) {
  const started = await beginTransaction(
    { url: hassUrl, allowInsecureHttp: true, ...extra },
    deps,
  );
  if (started.kind !== "redirect") throw new Error("expected a redirect");
  return new URL(started.authorizeUrl);
}

/** What HA's authorize page does after a successful login. */
function callbackFor(
  authorize: URL,
  code = "0123456789abcdef0123456789abcdef",
) {
  const redirect = new URL(authorize.searchParams.get("redirect_uri")!);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", authorize.searchParams.get("state")!);
  return redirect.href;
}

test("begin redirects to the chosen instance with state and an S256 challenge", async () => {
  const { storage, deps } = setup();
  const authorize = await begin(deps);
  expect(authorize.origin).toBe(hassUrl);
  expect(authorize.pathname).toBe("/auth/authorize");
  expect(Object.fromEntries(authorize.searchParams)).toEqual({
    response_type: "code",
    client_id: `${appOrigin}/`,
    redirect_uri: `${appOrigin}/auth-callback`,
    state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: "S256",
  });
  const stored = JSON.parse(storage.values.get(TRANSACTION_KEY)!);
  expect(stored.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  // Independent oracle: RFC 7636 S256 = BASE64URL(SHA256(ASCII(verifier))).
  expect(authorize.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(stored.codeVerifier).digest("base64url"),
  );
  expect(authorize.href).not.toContain(stored.codeVerifier);
  expect(stored.state).toBe(authorize.searchParams.get("state"));
  expect(Object.keys(stored).sort()).toEqual(
    [
      "allowInsecureHttp",
      "clientId",
      "codeVerifier",
      "createdAt",
      "expiresAt",
      "hassUrl",
      "redirectUri",
      "remember",
      "returnTo",
      "state",
      "version",
    ].sort(),
  );
});

test("each attempt has fresh secrets and supersedes the previous one", async () => {
  const { deps } = setup();
  const first = await begin(deps);
  const second = await begin(deps);
  expect(second.searchParams.get("state")).not.toBe(
    first.searchParams.get("state"),
  );
  expect(second.searchParams.get("code_challenge")).not.toBe(
    first.searchParams.get("code_challenge"),
  );
  expect(consumeCallback(callbackFor(first), deps)).toEqual({
    kind: "rejected",
    reason: "state_mismatch",
  });
});

test("a valid callback is verified once and the transaction is consumed", async () => {
  const { storage, deps } = setup();
  const authorize = await begin(deps, {
    returnTo: "/settings",
    remember: true,
  });
  const callback = callbackFor(authorize);
  const verified = consumeCallback(callback, deps);
  expect(verified).toEqual({
    kind: "verified",
    code: "0123456789abcdef0123456789abcdef",
    transaction: expect.objectContaining({
      hassUrl,
      clientId: `${appOrigin}/`,
      redirectUri: `${appOrigin}/auth-callback`,
      allowInsecureHttp: true,
      returnTo: "/settings",
      remember: true,
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    }),
  });
  expect(storage.values.size).toBe(0);
  expect(consumeCallback(callback, deps)).toEqual({
    kind: "rejected",
    reason: "no_transaction",
  });
});

test("a forged state burns the pending transaction", async () => {
  const { storage, deps } = setup();
  const authorize = await begin(deps);
  const forged = new URL(callbackFor(authorize));
  forged.searchParams.set("state", "A".repeat(43));
  expect(consumeCallback(forged.href, deps)).toEqual({
    kind: "rejected",
    reason: "state_mismatch",
  });
  expect(storage.values.size).toBe(0);
  expect(consumeCallback(callbackFor(authorize), deps)).toEqual({
    kind: "rejected",
    reason: "no_transaction",
  });
});

test("an expired transaction is rejected and removed", async () => {
  const { storage, clock, deps } = setup();
  const authorize = await begin(deps);
  clock.now += TRANSACTION_TTL_MS + 1;
  expect(consumeCallback(callbackFor(authorize), deps)).toEqual({
    kind: "rejected",
    reason: "expired",
  });
  expect(storage.values.size).toBe(0);
});

test("a transaction from the future is not trusted", async () => {
  const { clock, deps } = setup();
  const authorize = await begin(deps);
  clock.now -= 60 * 60_000;
  expect(consumeCallback(callbackFor(authorize), deps)).toEqual({
    kind: "rejected",
    reason: "expired",
  });
});

test.each([
  ["missing code", (url: URL) => url.searchParams.delete("code")],
  ["missing state", (url: URL) => url.searchParams.delete("state")],
  ["duplicate code", (url: URL) => url.searchParams.append("code", "other")],
  ["duplicate state", (url: URL) => url.searchParams.append("state", "x")],
  ["empty code", (url: URL) => url.searchParams.set("code", "")],
  [
    "oversized code",
    (url: URL) => url.searchParams.set("code", "a".repeat(600)),
  ],
  ["code with spaces", (url: URL) => url.searchParams.set("code", "a b")],
  [
    "error response",
    (url: URL) => url.searchParams.set("error", "access_denied"),
  ],
])(
  "a malformed callback (%s) is rejected and consumes the attempt",
  async (_, alter) => {
    const { storage, deps } = setup();
    const callback = new URL(callbackFor(await begin(deps)));
    alter(callback);
    expect(consumeCallback(callback.href, deps)).toEqual({
      kind: "rejected",
      reason: "malformed",
    });
    expect(storage.values.size).toBe(0);
  },
);

test.each([
  "https://evil.example/auth-callback",
  "http://localhost:8095/auth-callback",
  "http://localhost:8094/settings",
  "http://localhost:8094/auth-callback/extra",
])(
  "a callback outside this app's redirect URI (%s) is rejected",
  async (base) => {
    const { storage, deps } = setup();
    const authorize = await begin(deps);
    const callback = new URL(callbackFor(authorize));
    const moved = new URL(base);
    moved.search = callback.search;
    expect(consumeCallback(moved.href, deps)).toEqual({
      kind: "rejected",
      reason: "wrong_redirect",
    });
    expect(storage.values.size).toBe(0);
  },
);

test("a corrupted stored transaction is removed without being used", async () => {
  const { storage, deps } = setup();
  const authorize = await begin(deps);
  const stored = JSON.parse(storage.values.get(TRANSACTION_KEY)!);
  for (const corrupt of [
    "not json",
    JSON.stringify({ ...stored, version: 2 }),
    JSON.stringify({ ...stored, hassUrl: "https://evil.example/path" }),
    JSON.stringify({ ...stored, codeVerifier: "short" }),
    JSON.stringify({ ...stored, accessToken: "unexpected" }),
    JSON.stringify({ ...stored, returnTo: "https://evil.example" }),
  ]) {
    storage.setItem(TRANSACTION_KEY, corrupt);
    expect(consumeCallback(callbackFor(authorize), deps)).toEqual({
      kind: "rejected",
      reason: "corrupt_transaction",
    });
    expect(storage.values.size).toBe(0);
  }
});

test("a transaction created for another app origin is not accepted here", async () => {
  const { deps } = setup();
  const authorize = await begin(deps);
  const elsewhere = {
    ...deps,
    app: { ...deps.app, origin: "http://localhost:8095" },
  };
  const callback = new URL(callbackFor(authorize));
  const moved = new URL("http://localhost:8095/auth-callback");
  moved.search = callback.search;
  expect(consumeCallback(moved.href, elsewhere)).toEqual({
    kind: "rejected",
    reason: "corrupt_transaction",
  });
});

test("an external or looping destination is stored as home", async () => {
  const { storage, deps } = setup();
  await begin(deps, { returnTo: "https://evil.example/" });
  expect(JSON.parse(storage.values.get(TRANSACTION_KEY)!).returnTo).toBe("/");
  await begin(deps, { returnTo: "/auth-callback?code=1" });
  expect(JSON.parse(storage.values.get(TRANSACTION_KEY)!).returnTo).toBe("/");
});

test("Home Assistant's own keep-me-logged-in flag never grants persistence", async () => {
  const { deps } = setup();
  const callback = new URL(callbackFor(await begin(deps)));
  callback.searchParams.set("storeToken", "true");
  const verified = consumeCallback(callback.href, deps);
  expect(verified).toMatchObject({
    kind: "verified",
    transaction: { remember: false },
  });
});

test("an incompatible pair is refused before anything is stored", async () => {
  const { storage, deps } = setup();
  const hosted = {
    ...deps,
    app: { origin: "https://maurice.example", secureContext: true },
  };
  expect(
    await beginTransaction({ url: hassUrl, allowInsecureHttp: true }, hosted),
  ).toEqual({ kind: "blocked", reason: "mixed_content" });
  expect(storage.values.size).toBe(0);
});
