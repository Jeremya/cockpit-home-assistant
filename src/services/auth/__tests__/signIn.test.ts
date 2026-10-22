import { TRANSACTION_KEY } from "../authTransaction";
import { createBrowserSignIn, type BrowserEnvironment } from "../signIn";

const origin = "http://localhost:8094";
const hassUrl = "http://127.0.0.1:8123";
const tokens = {
  access_token: "public-access",
  token_type: "Bearer",
  refresh_token: "public-refresh",
  expires_in: 1800,
};

function environment(href = `${origin}/settings`) {
  const values = new Map<string, string>();
  const listeners = new Map<string, (event: { persisted: boolean }) => void>();
  const history: string[] = [];
  const env = {
    location: {
      href,
      origin,
      assign: jest.fn((url: string) => {
        env.location.href = url;
      }),
    },
    history: {
      state: { key: "router" },
      replaceState: jest.fn((_state: unknown, _title: string, url: string) => {
        history.push(url);
        env.location.href = new URL(url, origin).href;
      }),
    },
    isSecureContext: true,
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    crypto: globalThis.crypto,
    fetch: jest.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(tokens), { status: 200 }),
    ),
    addEventListener: jest.fn(
      (type: string, listener: (event: { persisted: boolean }) => void) =>
        void listeners.set(type, listener),
    ),
    sendBeacon: jest.fn(() => true),
  };
  return {
    env,
    values,
    history,
    unload: (persisted = false) => listeners.get("pagehide")?.({ persisted }),
    signIn: createBrowserSignIn(env as unknown as BrowserEnvironment),
  };
}

/** HA redirects back to the registered callback with the same state. */
function returnFromHomeAssistant(env: ReturnType<typeof environment>["env"]) {
  const authorize = new URL(env.location.href);
  const callback = new URL(authorize.searchParams.get("redirect_uri")!);
  callback.searchParams.set("code", "0123456789abcdef0123456789abcdef");
  callback.searchParams.set("state", authorize.searchParams.get("state")!);
  env.location.href = callback.href;
}

test("begin navigates to the chosen Home Assistant only", async () => {
  const { env, values, signIn } = environment();
  const started = await signIn.begin({
    url: hassUrl,
    allowInsecureHttp: true,
    returnTo: "/settings",
  });
  expect(started.kind).toBe("redirect");
  expect(new URL(env.location.assign.mock.calls[0]![0]).origin).toBe(hassUrl);
  expect(values.has(TRANSACTION_KEY)).toBe(true);
});

test("a blocked pair never navigates", async () => {
  const { env, signIn } = environment();
  env.isSecureContext = false;
  expect(await signIn.begin({ url: hassUrl, allowInsecureHttp: true })).toEqual(
    { kind: "blocked", reason: "insecure_app" },
  );
  expect(env.location.assign).not.toHaveBeenCalled();
});

test("the callback clears code and state from the address before any request", async () => {
  const { env, history, signIn } = environment();
  await signIn.begin({
    url: hassUrl,
    allowInsecureHttp: true,
    returnTo: "/settings",
  });
  returnFromHomeAssistant(env);
  env.fetch.mockImplementationOnce(async () => {
    expect(history).toEqual(["/auth-callback"]);
    return new Response(JSON.stringify(tokens), { status: 200 });
  });
  const result = await signIn.complete();
  expect(env.history.replaceState).toHaveBeenCalledWith(
    { key: "router" },
    "",
    "/auth-callback",
  );
  expect(env.location.href).toBe(`${origin}/auth-callback`);
  expect(result).toMatchObject({
    kind: "signed_in",
    returnTo: "/settings",
    signIn: { url: hassUrl, allowInsecureHttp: true },
  });
  expect(env.fetch).toHaveBeenCalledTimes(1);
  expect(env.fetch.mock.calls[0]![0]).toBe(`${hassUrl}/auth/token`);
});

test("a rejected callback is cleared too and never reaches the token endpoint", async () => {
  const { env, history, signIn } = environment(
    `${origin}/auth-callback?code=abc&state=${"A".repeat(43)}`,
  );
  expect(await signIn.complete()).toEqual({
    kind: "failed",
    reason: "no_transaction",
  });
  expect(history).toEqual(["/auth-callback"]);
  expect(env.fetch).not.toHaveBeenCalled();
});

test.each([
  [400, { error: "invalid_grant" }, "invalid_grant"],
  [500, {}, "server_error"],
])(
  "an exchange answered %s is a qualified failure",
  async (status, body, reason) => {
    const { env, signIn } = environment();
    await signIn.begin({ url: hassUrl, allowInsecureHttp: true });
    returnFromHomeAssistant(env);
    env.fetch.mockImplementationOnce(
      async () => new Response(JSON.stringify(body), { status }),
    );
    expect(await signIn.complete()).toEqual({ kind: "failed", reason });
  },
);

test("unavailable browser storage fails closed", async () => {
  const { env, signIn } = environment(`${origin}/auth-callback?code=a&state=b`);
  env.sessionStorage.getItem = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  expect(await signIn.complete()).toEqual({
    kind: "failed",
    reason: "storage_unavailable",
  });
  expect(env.fetch).not.toHaveBeenCalled();
});

test("leaving the page revokes a memory sign-in with a beacon, but not for back-forward cache", async () => {
  const { env, signIn, unload } = environment();
  await signIn.begin({ url: hassUrl, allowInsecureHttp: true });
  returnFromHomeAssistant(env);
  const result = await signIn.complete();
  if (result.kind !== "signed_in") throw new Error(result.reason);
  unload(true);
  expect(env.sendBeacon).not.toHaveBeenCalled();
  expect(result.signIn.authorization.closed).toBe(false);
  unload(false);
  expect(env.sendBeacon).toHaveBeenCalledTimes(1);
  const [url, body] = env.sendBeacon.mock.calls[0] as unknown as [
    string,
    URLSearchParams,
  ];
  expect(url).toBe(`${hassUrl}/auth/revoke`);
  expect(Object.fromEntries(body)).toEqual({ token: "public-refresh" });
  expect(result.signIn.authorization.closed).toBe(true);
});

test("an authorization already signed out sends no beacon", async () => {
  const { env, signIn, unload } = environment();
  await signIn.begin({ url: hassUrl, allowInsecureHttp: true });
  returnFromHomeAssistant(env);
  const result = await signIn.complete();
  if (result.kind !== "signed_in") throw new Error(result.reason);
  env.fetch.mockImplementationOnce(
    async () => new Response("", { status: 200 }),
  );
  await result.signIn.authorization.close();
  unload(false);
  expect(env.sendBeacon).not.toHaveBeenCalled();
});
