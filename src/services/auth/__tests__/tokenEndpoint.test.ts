import {
  exchangeAuthorizationCode,
  revokeRefreshToken,
} from "../tokenEndpoint";

const request = {
  hassUrl: "https://home.example.com",
  clientId: "https://maurice.example/",
  code: "0123456789abcdef0123456789abcdef",
  codeVerifier: "v".repeat(43),
};

function respond(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  });
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

const tokens = {
  access_token: "public-fixture-access",
  token_type: "Bearer",
  refresh_token: "public-fixture-refresh",
  expires_in: 1800,
  ha_auth_provider: "homeassistant",
};

test("the code is exchanged once with its verifier, without browser credentials", async () => {
  const { calls, fetch } = respond(200, tokens);
  const result = await exchangeAuthorizationCode(request, {
    fetch,
    now: () => 5_000,
  });
  expect(result).toEqual({
    kind: "tokens",
    data: {
      hassUrl: request.hassUrl,
      clientId: request.clientId,
      access_token: "public-fixture-access",
      refresh_token: "public-fixture-refresh",
      expires_in: 1800,
      expires: 5_000 + 1800 * 1000,
    },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://home.example.com/auth/token");
  expect(calls[0]!.init).toMatchObject({
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  expect(
    Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body))),
  ).toEqual({
    grant_type: "authorization_code",
    client_id: request.clientId,
    code: request.code,
    code_verifier: request.codeVerifier,
  });
});

test.each([
  [
    400,
    { error: "invalid_grant", error_description: "Invalid code verifier" },
    "invalid_grant",
  ],
  [
    400,
    { error: "invalid_request", error_description: "Invalid code" },
    "invalid_request",
  ],
  [
    403,
    { error: "access_denied", error_description: "User is not active" },
    "access_denied",
  ],
  [400, "<html>proxy</html>", "invalid_request"],
  [500, "boom", "server_error"],
  [302, "", "server_error"],
])(
  "HTTP %s is a qualified, non-retried rejection",
  async (status, body, reason) => {
    const { fetch } = respond(status, body);
    const result = await exchangeAuthorizationCode(request, {
      fetch,
      now: () => 0,
    });
    expect(result).toEqual({ kind: "rejected", reason });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { ...tokens, refresh_token: undefined },
  { ...tokens, access_token: "" },
  { ...tokens, token_type: "mac" },
  { ...tokens, expires_in: -1 },
  { ...tokens, expires_in: Number.POSITIVE_INFINITY },
  { ...tokens, access_token: "with space" },
  { ...tokens, refresh_token: "x".repeat(20_000) },
  "not json",
  [],
])(
  "an unexpected token response is rejected without echoing it",
  async (body) => {
    const { fetch } = respond(200, body);
    const result = await exchangeAuthorizationCode(request, {
      fetch,
      now: () => 0,
    });
    expect(result).toEqual({ kind: "rejected", reason: "unexpected_response" });
    expect(JSON.stringify(result)).not.toContain("public-fixture");
  },
);

test("a network failure is reported as unreachable and never retried", async () => {
  const fetch = jest.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  expect(
    await exchangeAuthorizationCode(request, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => 0,
    }),
  ).toEqual({ kind: "unreachable" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a stalled token request is aborted at its deadline", async () => {
  jest.useFakeTimers();
  try {
    let aborted = false;
    const fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const pending = exchangeAuthorizationCode(request, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => 0,
      timeoutMs: 1_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await pending).toEqual({ kind: "unreachable" });
    expect(aborted).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

test("revocation posts only the refresh token and reports confirmation", async () => {
  const { calls, fetch } = respond(200, "");
  expect(
    await revokeRefreshToken(
      { hassUrl: request.hassUrl, refreshToken: "public-fixture-refresh" },
      { fetch },
    ),
  ).toEqual({ kind: "revoked" });
  expect(calls[0]!.url).toBe("https://home.example.com/auth/revoke");
  expect(calls[0]!.init).toMatchObject({
    method: "POST",
    credentials: "omit",
    redirect: "error",
  });
  expect(
    Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body))),
  ).toEqual({
    token: "public-fixture-refresh",
  });
});

test.each([
  ["network", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ["proxy error", async () => new Response("", { status: 502 })],
])("revocation without a 200 (%s) stays unconfirmed", async (_, impl) => {
  const fetch = jest.fn(impl) as unknown as typeof globalThis.fetch;
  expect(
    await revokeRefreshToken(
      { hassUrl: request.hassUrl, refreshToken: "public-fixture-refresh" },
      { fetch },
    ),
  ).toEqual({ kind: "unconfirmed" });
});
