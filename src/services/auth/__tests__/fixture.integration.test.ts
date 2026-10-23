import { Auth } from "home-assistant-js-websocket";
import { beginTransaction, consumeCallback } from "../authTransaction";
import {
  exchangeAuthorizationCode,
  revokeRefreshToken,
} from "../tokenEndpoint";
import { nodeFetch } from "./nodeFetch";
import { authorizeAsHomeAssistant, startFixture } from "./fixtureProcess";

const appOrigin = "http://localhost:8094";
let fixture: Awaited<ReturnType<typeof startFixture>>;
let origin: string;
const expoFetch = globalThis.fetch;

beforeAll(async () => {
  // The official Auth class refreshes through global fetch.
  globalThis.fetch = nodeFetch;
  fixture = await startFixture();
  origin = fixture.origin;
});
afterAll(() => {
  globalThis.fetch = expoFetch;
  fixture.stop();
});

function pageStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const stats = () => fixture.stats();

test("browser sign-in reaches tokens once, for the chosen instance only", async () => {
  const storage = pageStorage();
  const deps = {
    storage,
    crypto: globalThis.crypto,
    now: Date.now,
    app: { origin: appOrigin, secureContext: true },
  };
  const started = await beginTransaction(
    { url: origin, allowInsecureHttp: true, returnTo: "/settings" },
    deps,
  );
  if (started.kind !== "redirect") throw new Error("blocked");
  const callback = await authorizeAsHomeAssistant(
    started.authorizeUrl,
    "alice",
  );

  const verified = consumeCallback(callback, deps);
  if (verified.kind !== "verified") throw new Error(verified.reason);
  expect(consumeCallback(callback, deps)).toEqual({
    kind: "rejected",
    reason: "no_transaction",
  });
  const exchange = {
    hassUrl: verified.transaction.hassUrl,
    clientId: verified.transaction.clientId,
    code: verified.code,
    codeVerifier: verified.transaction.codeVerifier,
  };
  const result = await exchangeAuthorizationCode(exchange, {
    fetch: nodeFetch,
  });
  if (result.kind !== "tokens") throw new Error(JSON.stringify(result));
  expect(result.data.hassUrl).toBe(origin);
  // Even a replay that bypassed the consumed transaction is refused by the server.
  expect(
    await exchangeAuthorizationCode(exchange, { fetch: nodeFetch }),
  ).toEqual({
    kind: "rejected",
    reason: "invalid_request",
  });
  expect(await stats()).toMatchObject({
    codesIssued: 1,
    codesExchanged: 1,
    codeRejections: 1,
    pendingCodes: 0,
  });

  // The official client refreshes with the exchanged data; no getAuth() involved.
  const saved: unknown[] = [];
  const auth = new Auth({ ...result.data, expires: 0 }, (data) =>
    saved.push(data),
  );
  expect(auth.expired).toBe(true);
  await auth.refreshAccessToken();
  expect(auth.expired).toBe(false);
  expect(auth.data.refresh_token).toBe(result.data.refresh_token);
  expect(saved).toHaveLength(1);
  expect((await stats()).refreshGrants).toBe(1);

  expect(
    await revokeRefreshToken(
      { hassUrl: origin, refreshToken: result.data.refresh_token },
      { fetch: nodeFetch },
    ),
  ).toEqual({ kind: "revoked" });
  await expect(auth.refreshAccessToken()).rejects.toBe(
    2 /* ERR_INVALID_AUTH */,
  );
  expect((await stats()).activeRefreshTokens).toBe(0);
});

test("a code obtained for another attempt is never exchanged", async () => {
  const deps = {
    storage: pageStorage(),
    crypto: globalThis.crypto,
    now: Date.now,
    app: { origin: appOrigin, secureContext: true },
  };
  const victim = await beginTransaction(
    { url: origin, allowInsecureHttp: true },
    deps,
  );
  if (victim.kind !== "redirect") throw new Error("blocked");
  // An attacker's own login for the same client, delivered into the victim's tab.
  const attacker = await beginTransaction(
    { url: origin, allowInsecureHttp: true },
    { ...deps, storage: pageStorage() },
  );
  if (attacker.kind !== "redirect") throw new Error("blocked");
  const injected = await authorizeAsHomeAssistant(attacker.authorizeUrl, "bob");
  const before = await stats();
  expect(consumeCallback(injected, deps)).toEqual({
    kind: "rejected",
    reason: "state_mismatch",
  });
  expect((await stats()).codesExchanged).toBe(before.codesExchanged);
});
