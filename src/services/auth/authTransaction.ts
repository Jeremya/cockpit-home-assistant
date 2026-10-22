import {
  browserAuthCompatibility,
  type AppContext,
  type CompatibilityBlock,
} from "./compatibility";
import { internalDestination } from "./returnTo";

export const TRANSACTION_KEY = "maurice.auth.transaction.v1";
/** Home Assistant drops unused authorization codes after ten minutes. */
export const TRANSACTION_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 60_000;
export const CALLBACK_PATH = "/auth-callback";
export const clientIdFor = (appOrigin: string) => `${appOrigin}/`;
export const redirectUriFor = (appOrigin: string) =>
  `${appOrigin}${CALLBACK_PATH}`;

/** Web Storage subset; synchronous so reading and removing is one step. */
export interface TransactionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface TransactionDeps {
  storage: TransactionStorage;
  crypto: Pick<Crypto, "getRandomValues" | "subtle">;
  now: () => number;
  app: AppContext;
}
/** Survives the redirect in sessionStorage; never holds an access or refresh token. */
export interface AuthTransaction {
  version: 1;
  state: string;
  codeVerifier: string;
  hassUrl: string;
  clientId: string;
  redirectUri: string;
  allowInsecureHttp: boolean;
  returnTo: string;
  remember: boolean;
  createdAt: number;
  expiresAt: number;
}
const FIELDS = [
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
].join();
export type BeginResult =
  | { kind: "redirect"; authorizeUrl: string }
  | { kind: "blocked"; reason: CompatibilityBlock };
export type CallbackRejection =
  | "no_transaction"
  | "corrupt_transaction"
  | "wrong_redirect"
  | "malformed"
  | "state_mismatch"
  | "expired";
export type CallbackResult =
  | { kind: "verified"; code: string; transaction: AuthTransaction }
  | { kind: "rejected"; reason: CallbackRejection };

// 32 random bytes; also the S256 challenge length.
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-Za-z0-9._~-]{1,512}$/;
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const secret = (deps: Pick<TransactionDeps, "crypto">) =>
  base64url(deps.crypto.getRandomValues(new Uint8Array(32)));
function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function beginTransaction(
  input: {
    url: string;
    allowInsecureHttp: boolean;
    returnTo?: unknown;
    remember?: boolean;
  },
  deps: TransactionDeps,
): Promise<BeginResult> {
  const compatible = browserAuthCompatibility(deps.app, input);
  if (compatible.kind === "blocked") return compatible;
  const codeVerifier = secret(deps);
  const challenge = base64url(
    new Uint8Array(
      await deps.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(codeVerifier),
      ),
    ),
  );
  const createdAt = deps.now();
  const transaction: AuthTransaction = {
    version: 1,
    state: secret(deps),
    codeVerifier,
    hassUrl: compatible.hassUrl,
    clientId: clientIdFor(deps.app.origin),
    redirectUri: redirectUriFor(deps.app.origin),
    allowInsecureHttp: input.allowInsecureHttp,
    returnTo: internalDestination(input.returnTo, deps.app.origin),
    remember: input.remember === true,
    createdAt,
    expiresAt: createdAt + TRANSACTION_TTL_MS,
  };
  // One pending attempt per page: a newer sign-in invalidates older callbacks.
  deps.storage.setItem(TRANSACTION_KEY, JSON.stringify(transaction));
  const authorize = new URL("/auth/authorize", transaction.hassUrl);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: transaction.clientId,
    redirect_uri: transaction.redirectUri,
    state: transaction.state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { kind: "redirect", authorizeUrl: authorize.href };
}

function parseTransaction(raw: string, app: AppContext) {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const t = data as Record<string, unknown>;
  if (
    Object.keys(t).sort().join() !== FIELDS ||
    t.version !== 1 ||
    typeof t.state !== "string" ||
    !SECRET.test(t.state) ||
    typeof t.codeVerifier !== "string" ||
    !SECRET.test(t.codeVerifier) ||
    typeof t.hassUrl !== "string" ||
    typeof t.allowInsecureHttp !== "boolean" ||
    typeof t.remember !== "boolean" ||
    typeof t.createdAt !== "number" ||
    !Number.isFinite(t.createdAt) ||
    t.expiresAt !== t.createdAt + TRANSACTION_TTL_MS ||
    t.clientId !== clientIdFor(app.origin) ||
    t.redirectUri !== redirectUriFor(app.origin) ||
    internalDestination(t.returnTo, app.origin) !== t.returnTo
  )
    return;
  const compatible = browserAuthCompatibility(app, {
    url: t.hassUrl,
    allowInsecureHttp: t.allowInsecureHttp,
  });
  if (compatible.kind !== "compatible" || compatible.hassUrl !== t.hassUrl)
    return;
  return t as unknown as AuthTransaction;
}

/**
 * Every callback consumes the pending attempt, valid or not, before any code
 * exchange. Only a verified result may reach the token endpoint, and only the
 * instance chosen at sign-in, never one named by the callback.
 */
export function consumeCallback(
  callbackUrl: string,
  deps: Omit<TransactionDeps, "crypto">,
): CallbackResult {
  const reject = (reason: CallbackRejection): CallbackResult => ({
    kind: "rejected",
    reason,
  });
  const raw = deps.storage.getItem(TRANSACTION_KEY);
  deps.storage.removeItem(TRANSACTION_KEY);
  if (raw === null) return reject("no_transaction");
  const transaction = parseTransaction(raw, deps.app);
  if (!transaction) return reject("corrupt_transaction");
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return reject("wrong_redirect");
  }
  if (url.origin + url.pathname !== transaction.redirectUri)
    return reject("wrong_redirect");
  const codes = url.searchParams.getAll("code");
  const states = url.searchParams.getAll("state");
  if (
    codes.length !== 1 ||
    states.length !== 1 ||
    url.searchParams.has("error") ||
    !CODE.test(codes[0]!) ||
    !SECRET.test(states[0]!)
  )
    return reject("malformed");
  if (!sameSecret(states[0]!, transaction.state))
    return reject("state_mismatch");
  const now = deps.now();
  if (
    now > transaction.expiresAt ||
    now < transaction.createdAt - CLOCK_SKEW_MS
  )
    return reject("expired");
  return { kind: "verified", code: codes[0]!, transaction };
}
