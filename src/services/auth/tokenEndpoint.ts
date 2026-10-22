import type { AuthData } from "home-assistant-js-websocket";

/**
 * The installed client's getAuth() exchanges codes without PKCE and from an
 * unvalidated state. Only this exchange is Maurice's; refresh stays with the
 * official Auth class.
 */
export interface EndpointDeps {
  fetch: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}
export type ExchangeRejection =
  | "invalid_grant"
  | "invalid_request"
  | "access_denied"
  | "server_error"
  | "unexpected_response";
export type ExchangeResult =
  | { kind: "tokens"; data: AuthData }
  | { kind: "rejected"; reason: ExchangeRejection }
  | { kind: "unreachable" };
export type RevocationResult = { kind: "revoked" } | { kind: "unconfirmed" };

const TOKEN_VALUE = /^[\x21-\x7e]{1,16384}$/;
const MAX_LIFETIME_S = 365 * 24 * 3600;

/** One attempt: the body read shares the deadline; failures carry no response text. */
async function post<T>(
  url: string,
  body: URLSearchParams,
  deps: EndpointDeps,
  read: (response: Response) => Promise<T>,
): Promise<T | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000);
  try {
    const response = await deps.fetch(url, {
      method: "POST",
      body,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    return await read(response);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function exchangeAuthorizationCode(
  request: {
    hassUrl: string;
    clientId: string;
    code: string;
    codeVerifier: string;
  },
  deps: EndpointDeps,
): Promise<ExchangeResult> {
  const result = await post(
    `${request.hassUrl}/auth/token`,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: request.clientId,
      code: request.code,
      code_verifier: request.codeVerifier,
    }),
    deps,
    async (response): Promise<ExchangeResult> => {
      const body = await json(response);
      const rejected = (reason: ExchangeRejection) =>
        ({ kind: "rejected", reason }) as const;
      if (response.status === 400)
        return rejected(
          body &&
            typeof body === "object" &&
            "error" in body &&
            body.error === "invalid_grant"
            ? "invalid_grant"
            : "invalid_request",
        );
      if (response.status === 403) return rejected("access_denied");
      if (response.status !== 200) return rejected("server_error");
      if (!body || typeof body !== "object" || Array.isArray(body))
        return rejected("unexpected_response");
      const tokens = body as Record<string, unknown>;
      const { access_token, refresh_token, expires_in } = tokens;
      if (
        tokens.token_type !== "Bearer" ||
        typeof access_token !== "string" ||
        !TOKEN_VALUE.test(access_token) ||
        typeof refresh_token !== "string" ||
        !TOKEN_VALUE.test(refresh_token) ||
        typeof expires_in !== "number" ||
        !Number.isFinite(expires_in) ||
        expires_in <= 0 ||
        expires_in > MAX_LIFETIME_S
      )
        return rejected("unexpected_response");
      return {
        kind: "tokens",
        data: {
          hassUrl: request.hassUrl,
          clientId: request.clientId,
          access_token,
          refresh_token,
          expires_in,
          expires: (deps.now ?? Date.now)() + expires_in * 1000,
        },
      };
    },
  );
  return result ?? { kind: "unreachable" };
}

/** HA answers 200 for any token; only that answer confirms revocation. */
export async function revokeRefreshToken(
  request: { hassUrl: string; refreshToken: string },
  deps: EndpointDeps,
): Promise<RevocationResult> {
  const result = await post(
    `${request.hassUrl}/auth/revoke`,
    new URLSearchParams({ token: request.refreshToken }),
    deps,
    async (response): Promise<RevocationResult> =>
      response.status === 200 ? { kind: "revoked" } : { kind: "unconfirmed" },
  );
  return result ?? { kind: "unconfirmed" };
}
