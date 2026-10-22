import { ERR_INVALID_AUTH } from "home-assistant-js-websocket";
import { HomeAssistantBackend } from "../../../session/homeAssistant/HomeAssistantBackend";
import type { HomeSnapshot } from "../../../core/types";
import { BrowserAuthorization, type BrowserSignIn } from "../authorization";
import { beginTransaction, consumeCallback } from "../authTransaction";
import {
  exchangeAuthorizationCode,
  revokeRefreshToken,
} from "../tokenEndpoint";
import { nodeFetch } from "./nodeFetch";
import { authorizeAsHomeAssistant, startFixture } from "./fixtureProcess";

const appOrigin = "http://localhost:8094";
const expoFetch = globalThis.fetch;
const fixtures: Awaited<ReturnType<typeof startFixture>>[] = [];
beforeAll(() => {
  // The official Auth class refreshes through global fetch.
  globalThis.fetch = nodeFetch;
});
afterAll(() => {
  globalThis.fetch = expoFetch;
  fixtures.forEach((fixture) => fixture.stop());
});
async function fixture(args: string[] = []) {
  const started = await startFixture(args);
  fixtures.push(started);
  return started;
}

/** The whole browser path except the page: transaction, HA login, exchange. */
async function signIn(
  origin: string,
  expired = false,
): Promise<BrowserSignIn & { refreshToken: string }> {
  const values = new Map<string, string>();
  const deps = {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    crypto: globalThis.crypto,
    now: Date.now,
    app: { origin: appOrigin, secureContext: true },
  };
  const started = await beginTransaction(
    { url: origin, allowInsecureHttp: true },
    deps,
  );
  if (started.kind !== "redirect") throw new Error(started.reason);
  const verified = consumeCallback(
    await authorizeAsHomeAssistant(started.authorizeUrl, "alice"),
    deps,
  );
  if (verified.kind !== "verified") throw new Error(verified.reason);
  const exchanged = await exchangeAuthorizationCode(
    {
      hassUrl: verified.transaction.hassUrl,
      clientId: verified.transaction.clientId,
      code: verified.code,
      codeVerifier: verified.transaction.codeVerifier,
    },
    { fetch: nodeFetch },
  );
  if (exchanged.kind !== "tokens") throw new Error(exchanged.kind);
  return {
    url: origin,
    allowInsecureHttp: true,
    refreshToken: exchanged.data.refresh_token,
    authorization: new BrowserAuthorization(
      { ...exchanged.data, ...(expired ? { expires: 0 } : {}) },
      { fetch: nodeFetch },
    ),
  };
}

test("a browser sign-in reaches ready with fresh observations through the official client", async () => {
  const home = await fixture();
  const backend = new HomeAssistantBackend(await signIn(home.origin), "one");
  let snapshot: HomeSnapshot | undefined;
  backend.onSnapshot((value) => {
    snapshot = value;
  });
  try {
    await backend.start();
    expect(backend.status).toMatchObject({
      kind: "ready",
      haVersion: "2026.10.1",
    });
    expect(backend.verifiedUserId).toBe("fixture-user-alice");
    expect(Object.keys(snapshot!.entities).sort()).toEqual([
      "sensor.fixture_temperature",
      "switch.fixture_plug",
    ]);
    expect(snapshot!.entities["sensor.fixture_temperature"]!.state).toBe(
      "21.5",
    );
    expect(await home.stats()).toMatchObject({
      wsAuthentications: 1,
      refreshGrants: 0,
      serviceCalls: 0,
    });
  } finally {
    backend.stop();
  }
});

test("an expired access token is refreshed once, before the socket authenticates", async () => {
  const home = await fixture();
  const backend = new HomeAssistantBackend(
    await signIn(home.origin, true),
    "one",
  );
  try {
    await backend.start();
    expect(backend.status.kind).toBe("ready");
    expect(await home.stats()).toMatchObject({
      refreshGrants: 1,
      wsAuthentications: 1,
    });
  } finally {
    backend.stop();
  }
});

test("a revoked sign-in is a terminal authentication error, not a retry loop", async () => {
  const home = await fixture();
  const session = await signIn(home.origin, true);
  await revokeRefreshToken(
    { hassUrl: home.origin, refreshToken: session.refreshToken },
    { fetch: nodeFetch },
  );
  const backend = new HomeAssistantBackend(session, "one");
  try {
    // As with a manual token: start() rejects with the client's own error,
    // the typed error is the status every screen reads.
    await expect(backend.start()).rejects.toBe(ERR_INVALID_AUTH);
    expect(backend.status).toEqual({
      kind: "error",
      error: { code: "auth_invalid" },
      retrying: false,
    });
    expect((await home.stats()).wsAuthentications).toBe(0);
  } finally {
    backend.stop();
  }
});

test("a Home Assistant older than 2026.10 is refused after sign-in", async () => {
  const home = await fixture(["--version", "2026.9.0"]);
  const backend = new HomeAssistantBackend(await signIn(home.origin), "one");
  const snapshots = jest.fn();
  backend.onSnapshot(snapshots);
  try {
    await expect(backend.start()).rejects.toEqual({
      code: "ha_version_unsupported",
      haVersion: "2026.9.0",
    });
    expect(snapshots).not.toHaveBeenCalled();
    expect(backend.verifiedUserId).toBeUndefined();
  } finally {
    backend.stop();
  }
});
