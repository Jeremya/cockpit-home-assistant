import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { Auth } from "home-assistant-js-websocket";
import { beginTransaction, consumeCallback } from "../authTransaction";
import {
  exchangeAuthorizationCode,
  revokeRefreshToken,
} from "../tokenEndpoint";
import { nodeFetch } from "./nodeFetch";

const appOrigin = "http://localhost:8094";
let fixture: ChildProcess;
let origin: string;
const expoFetch = globalThis.fetch;

beforeAll(async () => {
  // The official Auth class refreshes through global fetch.
  globalThis.fetch = nodeFetch;
  fixture = spawn(
    process.execPath,
    [
      join(__dirname, "../../../../scripts/lib/web-auth-fixture.mjs"),
      "--serve",
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  origin = await new Promise<string>((resolve, reject) => {
    fixture.stdout!.once("data", (bytes) => {
      const ready = JSON.parse(String(bytes));
      if (ready.fixtureOnly === true) resolve(ready.origin);
      else reject(new Error("Unexpected fixture"));
    });
    fixture.once("exit", () => reject(new Error("Fixture exited")));
  });
});
afterAll(() => {
  globalThis.fetch = expoFetch;
  fixture.kill("SIGTERM");
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

/** What HA's authorize page does: login flow with the forwarded challenge, then redirect. */
async function authorizeAsHomeAssistant(
  authorizeUrl: string,
  username: string,
) {
  const authorize = new URL(authorizeUrl);
  const params = Object.fromEntries(authorize.searchParams);
  const flow = await nodeFetch(`${origin}/auth/login_flow`, {
    method: "POST",
    body: JSON.stringify({
      client_id: params.client_id,
      handler: ["homeassistant", null],
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
    }),
  }).then((response) => response.json());
  const step = await nodeFetch(`${origin}/auth/login_flow/${flow.flow_id}`, {
    method: "POST",
    body: JSON.stringify({
      client_id: params.client_id,
      username,
      password: "public-fixture-password",
    }),
  }).then((response) => response.json());
  const callback = new URL(params.redirect_uri!);
  callback.searchParams.set("code", step.result);
  callback.searchParams.set("state", params.state!);
  return callback.href;
}

const stats = () =>
  nodeFetch(`${origin}/_fixture/status`).then((response) => response.json());

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
