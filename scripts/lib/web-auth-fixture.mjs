// Disposable, loopback-only double of the Home Assistant 2026.10 auth API for
// browser sign-in proofs. Every credential here is public; it never forwards
// traffic, accepts household credentials or executes services.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";

export const FIXTURE_HA_VERSION = "2026.10.1";
/** Public test identities, distinct from any household account. */
export const PUBLIC_USERS = Object.freeze([
  Object.freeze({
    id: "fixture-user-alice",
    name: "Alice (public fixture)",
    username: "alice",
    password: "public-fixture-password",
    isOwner: true,
  }),
  Object.freeze({
    id: "fixture-user-bob",
    name: "Bob (public fixture)",
    username: "bob",
    password: "public-fixture-password",
    isOwner: false,
  }),
]);
const CODE_LIFETIME_MS = 10 * 60_000;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CORS_PATHS = new Set([
  "/auth/token",
  "/auth/revoke",
  "/.well-known/oauth-authorization-server",
]);

/** Assertion messages quote actual values; no token-like string reaches output. */
export const redactSecrets = (text) =>
  String(text).replace(/[A-Za-z0-9._~+/=-]{24,}/g, "<redacted>");

const s256 = (verifier) =>
  createHash("sha256").update(verifier, "ascii").digest("base64url");

/** IndieAuth client id as HA parses it: URL, no fragment/credentials/dot segments. */
function clientUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hash ||
      url.username ||
      url.password ||
      // URL parsing normalizes dot segments away; HA checks the raw path.
      /\/\.{1,2}(\/|\?|$)/.test(value.replace(/^[a-z]+:\/\/[^/]*/i, ""))
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

async function readBody(request) {
  let body = "";
  for await (const part of request) {
    body += part;
    if (body.length > 16_384) throw new Error("Input too large");
  }
  return body;
}

/** aiohttp's request.post(): urlencoded or the official client's FormData. */
function formFields(request, body) {
  const type = request.headers["content-type"] ?? "";
  const boundary = /multipart\/form-data;\s*boundary=(.+)$/i.exec(type)?.[1];
  if (!boundary) return new URLSearchParams(body);
  const fields = new URLSearchParams();
  for (const part of body.split(`--${boundary.replace(/^"|"$/g, "")}`)) {
    const match = /name="([^"]+)"\r\n\r\n([\s\S]*)\r\n$/.exec(part);
    if (match) fields.append(match[1], match[2]);
  }
  return fields;
}

export async function startWebAuthFixture({
  version = FIXTURE_HA_VERSION,
  accessTokenLifetime = 1800,
  now = Date.now,
} = {}) {
  const users = new Map(PUBLIC_USERS.map((user) => [user.username, user]));
  const flows = new Map();
  const codes = new Map();
  const refreshTokens = new Map();
  const accessTokens = new Map();
  const counters = {
    codesIssued: 0,
    codesExchanged: 0,
    codeRejections: 0,
    refreshGrants: 0,
    revocations: 0,
    wsAuthentications: 0,
  };
  const sockets = new Set();

  const issueAccess = (refreshToken) => {
    const token = `maurice-fixture-access-${randomBytes(16).toString("hex")}`;
    accessTokens.set(token, {
      refreshToken,
      expires: now() + accessTokenLifetime * 1000,
    });
    return token;
  };
  const issueTokens = ({ clientId, username }) => {
    const user = users.get(username);
    assert(user, "Unknown public fixture user");
    const refresh_token = `maurice-fixture-refresh-${randomBytes(32).toString("hex")}`;
    refreshTokens.set(refresh_token, { userId: user.id, clientId });
    return {
      access_token: issueAccess(refresh_token),
      token_type: "Bearer",
      refresh_token,
      expires_in: accessTokenLifetime,
      ha_auth_provider: "homeassistant",
    };
  };
  const revoke = (token) => {
    if (!refreshTokens.delete(token)) return;
    counters.revocations++;
    for (const [access, owner] of accessTokens)
      if (owner.refreshToken === token) accessTokens.delete(access);
    for (const socket of sockets)
      if (socket.refreshToken === token) socket.terminate();
  };

  const tokenGrant = (fields) => {
    const reject = (error, description, status = 400) => ({
      status,
      body: {
        error,
        ...(description ? { error_description: description } : {}),
      },
    });
    const clientId = fields.get("client_id");
    if (fields.get("grant_type") === "authorization_code") {
      if (!clientId || !clientUrl(clientId))
        return reject("invalid_request", "Invalid client id");
      const code = fields.get("code");
      if (code === null) return reject("invalid_request", "Invalid code");
      // Popped before any verifier check, exactly like HA: one try per code.
      const key = `${clientId}\n${code}`;
      const entry = codes.get(key);
      codes.delete(key);
      if (!entry || now() - entry.created >= CODE_LIFETIME_MS) {
        counters.codeRejections++;
        return reject("invalid_request", "Invalid code");
      }
      const verifier = fields.get("code_verifier");
      if (entry.challenge !== null) {
        if (!verifier) {
          counters.codeRejections++;
          return reject("invalid_request", "Code verifier required");
        }
        if (!VERIFIER.test(verifier) || s256(verifier) !== entry.challenge) {
          counters.codeRejections++;
          return reject("invalid_grant", "Invalid code verifier");
        }
      } else if (fields.has("code_verifier")) {
        counters.codeRejections++;
        return reject(
          "invalid_request",
          "Code verifier provided but no code challenge was present",
        );
      }
      counters.codesExchanged++;
      return {
        status: 200,
        body: issueTokens({ clientId, username: entry.username }),
      };
    }
    if (fields.get("grant_type") === "refresh_token") {
      if (clientId !== null && !clientUrl(clientId))
        return reject("invalid_request", "Invalid client id");
      const token = fields.get("refresh_token");
      if (token === null) return reject("invalid_request");
      const owner = refreshTokens.get(token);
      if (!owner) return reject("invalid_grant");
      if (owner.clientId !== clientId) return reject("invalid_request");
      counters.refreshGrants++;
      return {
        status: 200,
        body: {
          access_token: issueAccess(token),
          token_type: "Bearer",
          expires_in: accessTokenLifetime,
        },
      };
    }
    return reject("unsupported_grant_type");
  };

  const loginStep = (flowId, data) => {
    const flow = flows.get(flowId);
    if (!flow)
      return { status: 404, body: { message: "Invalid flow specified" } };
    const user = users.get(data.username);
    if (!user || data.password !== user.password)
      return {
        status: 200,
        body: {
          type: "form",
          flow_id: flowId,
          handler: ["homeassistant", null],
          step_id: "init",
          data_schema: [],
          errors: { base: "invalid_auth" },
        },
      };
    flows.delete(flowId);
    const client = clientUrl(data.client_id);
    const redirect = clientUrl(flow.redirectUri);
    // Without link-tag discovery, HA accepts only the client id's own host.
    if (
      !client ||
      !redirect ||
      client.protocol + client.host !== redirect.protocol + redirect.host
    )
      return { status: 403, body: { message: "Invalid redirect URI" } };
    const code = randomBytes(16).toString("hex");
    codes.set(`${data.client_id}\n${code}`, {
      username: user.username,
      challenge: flow.challenge,
      created: now(),
    });
    counters.codesIssued++;
    return {
      status: 200,
      body: {
        type: "create_entry",
        flow_id: flowId,
        handler: ["homeassistant", null],
        result: code,
        title: "Public fixture",
        version: 1,
      },
    };
  };

  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, "http://fixture");
    const send = (status, body, headers = {}) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        ...headers,
      });
      response.end(body === undefined ? "" : JSON.stringify(body));
    };
    const origin = request.headers.origin;
    const cors = CORS_PATHS.has(pathname) && origin;
    if (cors) response.setHeader("Access-Control-Allow-Origin", origin);
    try {
      if (request.method === "OPTIONS") {
        if (!cors) return send(403);
        return send(200, undefined, {
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": String(
            request.headers["access-control-request-headers"] ?? "",
          ).toUpperCase(),
        });
      }
      if (pathname === "/_fixture/status" && request.method === "GET")
        return send(200, stats());
      if (pathname === "/.well-known/oauth-authorization-server")
        return send(200, {
          authorization_endpoint: "/auth/authorize",
          token_endpoint: "/auth/token",
          revocation_endpoint: "/auth/revoke",
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          response_types_supported: ["code"],
        });
      if (request.method !== "POST") return send(405);
      const body = await readBody(request);
      if (pathname === "/auth/token") {
        const { status, body: result } = tokenGrant(formFields(request, body));
        return send(status, result, {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        });
      }
      if (pathname === "/auth/revoke") {
        const token = formFields(request, body).get("token");
        if (token !== null) revoke(token);
        return send(200);
      }
      if (pathname === "/auth/login_flow") {
        const data = JSON.parse(body);
        if (
          typeof data.client_id !== "string" ||
          typeof data.redirect_uri !== "string" ||
          !Array.isArray(data.handler) ||
          data.handler.length !== 2 ||
          (data.code_challenge !== undefined &&
            !CHALLENGE.test(data.code_challenge))
        )
          return send(400, { message: "Message format incorrect" });
        if (!clientUrl(data.client_id))
          return send(400, { message: "Invalid client id" });
        if (data.code_challenge_method !== undefined && !data.code_challenge)
          return send(400, {
            message:
              "code_challenge required when code_challenge_method is provided",
          });
        if (data.code_challenge && data.code_challenge_method !== "S256")
          return send(400, { message: "Transform algorithm not supported" });
        const flowId = randomBytes(16).toString("hex");
        flows.set(flowId, {
          clientId: data.client_id,
          redirectUri: data.redirect_uri,
          challenge: data.code_challenge ?? null,
        });
        return send(200, {
          type: "form",
          flow_id: flowId,
          handler: ["homeassistant", null],
          step_id: "init",
          data_schema: [
            { name: "username", type: "string" },
            { name: "password", type: "string" },
          ],
          errors: {},
        });
      }
      const step = /^\/auth\/login_flow\/([0-9a-f]{32})$/.exec(pathname);
      if (step) {
        const data = JSON.parse(body);
        if (typeof data.client_id !== "string" || !clientUrl(data.client_id))
          return send(400, { message: "Invalid client id" });
        const { status, body: result } = loginStep(step[1], data);
        return send(status, result);
      }
      return send(404);
    } catch {
      return send(400, { message: "Invalid request" });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/api/websocket") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) =>
      wss.emit("connection", client),
    );
  });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let user;
    socket.send(JSON.stringify({ type: "auth_required", ha_version: version }));
    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        socket.close();
        return;
      }
      if (!user) {
        const access = accessTokens.get(message.access_token);
        const owner = access && refreshTokens.get(access.refreshToken);
        if (message.type !== "auth" || !owner || access.expires <= now()) {
          socket.send(
            JSON.stringify({ type: "auth_invalid", message: "Invalid access" }),
          );
          socket.close();
          return;
        }
        counters.wsAuthentications++;
        user = PUBLIC_USERS.find((candidate) => candidate.id === owner.userId);
        socket.refreshToken = access.refreshToken;
        socket.send(JSON.stringify({ type: "auth_ok", ha_version: version }));
        return;
      }
      const result = (value) =>
        socket.send(
          JSON.stringify({
            id: message.id,
            type: "result",
            success: true,
            result: value,
          }),
        );
      if (message.type === "ping")
        socket.send(JSON.stringify({ id: message.id, type: "pong" }));
      else if (message.type === "auth/current_user")
        result({
          id: user.id,
          name: user.name,
          is_owner: user.isOwner,
          is_admin: user.isOwner,
          credentials: [
            { auth_provider_type: "homeassistant", auth_provider_id: null },
          ],
          mfa_modules: [],
        });
      else
        socket.send(
          JSON.stringify({
            id: message.id,
            type: "result",
            success: false,
            error: { code: "unknown_command", message: "Unknown command." },
          }),
        );
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  function stats() {
    return {
      ...counters,
      pendingCodes: codes.size,
      activeRefreshTokens: refreshTokens.size,
      activeAccessTokens: accessTokens.size,
    };
  }
  return {
    origin,
    version,
    stats,
    issueTokens,
    async close() {
      for (const socket of sockets) socket.terminate();
      wss.close();
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

/** Same sequence against this fixture or a disposable real HA; never a household one. */
export async function runAuthConformance({
  origin,
  username,
  password,
  appOrigin = "http://localhost:8094",
}) {
  const clientId = `${appOrigin}/`;
  const redirectUri = `${appOrigin}/auth-callback`;
  const checks = [];
  const check = async (name, run) => {
    try {
      await run();
    } catch (error) {
      throw new Error(
        `Auth conformance failed: ${name}: ${redactSecrets(error?.message ?? error)}`,
      );
    }
    checks.push({ name, ok: true });
  };
  const json = (response) => response.json().catch(() => undefined);
  const pkce = () => {
    const verifier = randomBytes(32).toString("base64url");
    return { verifier, challenge: s256(verifier) };
  };
  const loginCode = async ({
    challenge,
    method = "S256",
    redirect = redirectUri,
  } = {}) => {
    const flow = await fetch(`${origin}/auth/login_flow`, {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        handler: ["homeassistant", null],
        redirect_uri: redirect,
        ...(challenge
          ? { code_challenge: challenge, code_challenge_method: method }
          : {}),
      }),
    });
    if (flow.status !== 200) return { status: flow.status };
    const { flow_id } = await flow.json();
    const step = await fetch(`${origin}/auth/login_flow/${flow_id}`, {
      method: "POST",
      body: JSON.stringify({ client_id: clientId, username, password }),
    });
    const body = await json(step);
    return {
      status: step.status,
      code: body?.type === "create_entry" ? body.result : undefined,
    };
  };
  const token = (fields, client = clientId) =>
    fetch(`${origin}/auth/token`, {
      method: "POST",
      headers: { Origin: appOrigin },
      body: new URLSearchParams({ client_id: client, ...fields }),
    });
  const exchange = (code, verifier, client) =>
    token(
      {
        grant_type: "authorization_code",
        code,
        ...(verifier ? { code_verifier: verifier } : {}),
      },
      client,
    );
  let haVersion;
  const socketAuth = (accessToken) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `${origin.replace(/^http/, "ws")}/api/websocket`,
      );
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("WebSocket timeout"));
      }, 10_000);
      const finish = (result) => {
        clearTimeout(timer);
        socket.close();
        resolve(result);
      };
      socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(String(data));
        if (message.type === "auth_required")
          socket.send(
            JSON.stringify({ type: "auth", access_token: accessToken }),
          );
        else if (message.type === "auth_invalid") finish({ ok: false });
        else if (message.type === "auth_ok") {
          haVersion = message.ha_version;
          socket.send(JSON.stringify({ id: 1, type: "auth/current_user" }));
        } else if (message.id === 1) finish({ ok: true, user: message.result });
      });
      socket.addEventListener("error", () => finish({ ok: false }));
    });

  await check("metadata advertises S256 only", async () => {
    const metadata = await fetch(
      `${origin}/.well-known/oauth-authorization-server`,
    ).then(json);
    assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  });
  await check("plain PKCE is refused when the flow starts", async () => {
    const { verifier } = pkce();
    const flow = await loginCode({
      challenge: verifier.slice(0, 43),
      method: "plain",
    });
    assert.equal(flow.status, 400);
  });
  await check(
    "a wrong verifier fails and still consumes the code",
    async () => {
      const { verifier, challenge } = pkce();
      const { code } = await loginCode({ challenge });
      assert.ok(code);
      const wrong = await exchange(code, pkce().verifier);
      assert.equal(wrong.status, 400);
      assert.equal((await json(wrong)).error, "invalid_grant");
      const retry = await exchange(code, verifier);
      assert.equal(retry.status, 400);
      assert.equal((await json(retry)).error, "invalid_request");
    },
  );
  await check("a PKCE code requires its verifier", async () => {
    const { verifier, challenge } = pkce();
    const { code } = await loginCode({ challenge });
    const missing = await exchange(code);
    assert.equal(missing.status, 400);
    assert.equal(
      (await json(missing)).error_description,
      "Code verifier required",
    );
    assert.equal((await exchange(code, verifier)).status, 400);
  });
  await check(
    "a code without challenge refuses a verifier (no silent downgrade)",
    async () => {
      const { code } = await loginCode();
      const response = await exchange(code, pkce().verifier);
      assert.equal(response.status, 400);
      assert.match(
        (await json(response)).error_description,
        /no code challenge/,
      );
    },
  );
  await check(
    "a redirect on another host is refused before a code exists",
    async () => {
      const { challenge } = pkce();
      const result = await loginCode({
        challenge,
        redirect: "http://localhost:9/auth-callback",
      });
      assert.equal(result.status, 403);
      assert.equal(result.code, undefined);
    },
  );
  let tokens;
  await check("a code is bound to its client id", async () => {
    const { verifier, challenge } = pkce();
    const { code } = await loginCode({ challenge });
    const other = await exchange(code, verifier, "http://localhost:8095/");
    assert.equal(other.status, 400);
    const response = await exchange(code, verifier);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      appOrigin,
    );
    tokens = await response.json();
    assert.equal(tokens.token_type, "Bearer");
    assert.ok(tokens.refresh_token && tokens.access_token);
    assert.ok(tokens.expires_in > 0);
    const replay = await exchange(code, verifier);
    assert.equal(replay.status, 400);
  });
  await check(
    "token and revoke endpoints allow cross-origin POST, login flow does not",
    async () => {
      for (const [path, allowed] of [
        ["/auth/token", true],
        ["/auth/revoke", true],
        ["/auth/login_flow", false],
      ]) {
        const preflight = await fetch(`${origin}${path}`, {
          method: "OPTIONS",
          headers: {
            Origin: appOrigin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
          },
        });
        assert.equal(
          preflight.headers.get("access-control-allow-origin"),
          allowed ? appOrigin : null,
        );
      }
    },
  );
  let principal;
  await check(
    "the access token opens the WebSocket and names its user",
    async () => {
      const session = await socketAuth(tokens.access_token);
      assert.equal(session.ok, true);
      assert.equal(typeof session.user.id, "string");
      principal = session.user.id;
    },
  );
  await check(
    "refresh keeps the refresh token and is bound to the client id",
    async () => {
      const wrongClient = await token(
        { grant_type: "refresh_token", refresh_token: tokens.refresh_token },
        "http://localhost:8095/",
      );
      assert.equal(wrongClient.status, 400);
      const refreshed = await token({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      });
      assert.equal(refreshed.status, 200);
      const body = await refreshed.json();
      assert.equal(body.refresh_token, undefined);
      // HA access tokens are per-second JWTs: a refresh may return the same value.
      assert.equal(body.token_type, "Bearer");
      const session = await socketAuth(body.access_token);
      assert.equal(session.user.id, principal);
    },
  );
  await check(
    "revocation always answers 200 and ends refresh and access",
    async () => {
      const unknown = await fetch(`${origin}/auth/revoke`, {
        method: "POST",
        headers: { Origin: appOrigin },
        body: new URLSearchParams({ token: "maurice-unknown-token" }),
      });
      assert.equal(unknown.status, 200);
      const revoked = await fetch(`${origin}/auth/revoke`, {
        method: "POST",
        headers: { Origin: appOrigin },
        body: new URLSearchParams({ token: tokens.refresh_token }),
      });
      assert.equal(revoked.status, 200);
      const refresh = await token({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      });
      assert.equal(refresh.status, 400);
      assert.equal((await json(refresh)).error, "invalid_grant");
      assert.equal((await socketAuth(tokens.access_token)).ok, false);
    },
  );
  await check("an unknown grant type is refused", async () => {
    const response = await token({ grant_type: "password" });
    assert.equal(response.status, 400);
  });
  return { haVersion, checks };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, target] = process.argv.slice(2);
  if (mode === "--serve") {
    const fixture = await startWebAuthFixture();
    console.log(JSON.stringify({ origin: fixture.origin, fixtureOnly: true }));
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(
        signal,
        () => void fixture.close().then(() => process.exit(0)),
      );
  } else if (mode === "--conformance" && target) {
    const url = new URL(target);
    assert(
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      "Conformance runs only against a loopback, disposable instance",
    );
    const report = await runAuthConformance({
      origin: url.origin,
      username: process.env.MAURICE_PROBE_USERNAME,
      password: process.env.MAURICE_PROBE_PASSWORD,
    });
    console.log(JSON.stringify(report, null, 2));
  } else {
    throw new Error(
      "Usage: web-auth-fixture.mjs --serve | --conformance http://127.0.0.1:<port>",
    );
  }
}
