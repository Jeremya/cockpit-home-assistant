import { ERR_INVALID_AUTH, type AuthData } from "home-assistant-js-websocket";
import { BrowserAuthorization } from "../authorization";

const data: AuthData = {
  hassUrl: "https://home.example.com",
  clientId: "https://maurice.example/",
  access_token: "public-access-1",
  refresh_token: "public-refresh",
  expires_in: 1800,
  expires: 0,
};
const tokenResponse = () =>
  new Response(
    JSON.stringify({
      access_token: "public-access-2",
      token_type: "Bearer",
      expires_in: 1800,
    }),
    { status: 200 },
  );
const libraryFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = libraryFetch;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("concurrent refreshes share one token request", async () => {
  const response = deferred<Response>();
  const refresh = jest.fn(() => response.promise);
  globalThis.fetch = refresh as unknown as typeof fetch;
  const authorization = new BrowserAuthorization(data, { fetch: jest.fn() });
  const first = authorization.auth.refreshAccessToken();
  const second = authorization.auth.refreshAccessToken();
  response.resolve(tokenResponse());
  await Promise.all([first, second]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(authorization.auth.accessToken).toBe("public-access-2");
  expect(authorization.auth.data.refresh_token).toBe("public-refresh");
  globalThis.fetch = jest.fn(async () => tokenResponse()) as typeof fetch;
  await authorization.auth.refreshAccessToken();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test("closing drops the tokens first, then revokes the refresh token once", async () => {
  const revoke = jest.fn(async () => new Response("", { status: 200 }));
  const authorization = new BrowserAuthorization(data, {
    fetch: revoke as unknown as typeof fetch,
  });
  const closing = authorization.close();
  expect(authorization.closed).toBe(true);
  expect(authorization.auth.data.access_token).toBe("");
  expect(authorization.auth.data.refresh_token).toBe("");
  expect(await closing).toEqual({ kind: "revoked" });
  expect(await authorization.close()).toEqual({ kind: "revoked" });
  expect(revoke).toHaveBeenCalledTimes(1);
  const [, init] = revoke.mock.calls[0] as unknown as [string, RequestInit];
  expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
    token: "public-refresh",
  });
});

test("a closed authorization refuses to refresh without network", async () => {
  globalThis.fetch = jest.fn() as typeof fetch;
  const authorization = new BrowserAuthorization(data, {
    fetch: jest.fn(
      async () => new Response("", { status: 200 }),
    ) as typeof fetch,
  });
  await authorization.close();
  await expect(authorization.auth.refreshAccessToken()).rejects.toBe(
    ERR_INVALID_AUTH,
  );
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test("a refresh finishing after close cannot restore any token", async () => {
  const response = deferred<Response>();
  globalThis.fetch = jest.fn(() => response.promise) as typeof fetch;
  const authorization = new BrowserAuthorization(data, {
    fetch: jest.fn(
      async () => new Response("", { status: 200 }),
    ) as typeof fetch,
  });
  const refreshing = authorization.auth.refreshAccessToken();
  await authorization.close();
  response.resolve(tokenResponse());
  await refreshing.catch(() => undefined);
  expect(authorization.auth.data.access_token).toBe("");
  expect(authorization.auth.data.refresh_token).toBe("");
});

test("an unreachable revocation is reported, and the tokens are still gone", async () => {
  const authorization = new BrowserAuthorization(data, {
    fetch: jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch,
  });
  expect(await authorization.close()).toEqual({ kind: "unconfirmed" });
  expect(authorization.auth.data.refresh_token).toBe("");
});

test("page unload closes locally and hands over one revocation beacon", () => {
  const authorization = new BrowserAuthorization(data, { fetch: jest.fn() });
  const beacon = authorization.closeForUnload();
  expect(beacon?.url).toBe("https://home.example.com/auth/revoke");
  expect(Object.fromEntries(beacon!.body)).toEqual({ token: "public-refresh" });
  expect(authorization.closed).toBe(true);
  expect(authorization.auth.data.refresh_token).toBe("");
  expect(authorization.closeForUnload()).toBeUndefined();
});
