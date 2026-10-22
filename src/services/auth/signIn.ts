import {
  beginTransaction,
  CALLBACK_PATH,
  consumeCallback,
  type BeginResult,
  type CallbackRejection,
  type TransactionStorage,
} from "./authTransaction";
import { BrowserAuthorization, type BrowserSignIn } from "./authorization";
import { browserAuthCompatibility, type Compatibility } from "./compatibility";
import {
  exchangeAuthorizationCode,
  type ExchangeRejection,
} from "./tokenEndpoint";

/** The parts of `window` a browser sign-in touches. */
export interface BrowserEnvironment {
  location: { href: string; origin: string; assign(url: string): void };
  history: {
    state: unknown;
    replaceState(state: unknown, title: string, url: string): void;
  };
  isSecureContext: boolean;
  sessionStorage: TransactionStorage;
  crypto: Pick<Crypto, "getRandomValues" | "subtle">;
  fetch: typeof fetch;
  addEventListener(
    type: "pagehide",
    listener: (event: { persisted: boolean }) => void,
  ): void;
  sendBeacon(url: string, body: URLSearchParams): boolean;
}
export type SignInFailure =
  | CallbackRejection
  | ExchangeRejection
  | "unreachable"
  | "storage_unavailable"
  | "unsupported";
export type SignInResult =
  | { kind: "signed_in"; signIn: BrowserSignIn; returnTo: string }
  | { kind: "failed"; reason: SignInFailure };

export function createBrowserSignIn(env: BrowserEnvironment) {
  const app = () => ({
    origin: env.location.origin,
    secureContext: env.isSecureContext,
  });
  // Memory sign-ins die with the page; revoke them rather than leave them valid.
  const live = new Set<BrowserAuthorization>();
  let unloadWatched = false;
  const revokeOnUnload = (authorization: BrowserAuthorization) => {
    live.add(authorization);
    if (unloadWatched) return;
    unloadWatched = true;
    env.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      for (const item of live) {
        const beacon = item.closeForUnload();
        if (beacon) env.sendBeacon(beacon.url, beacon.body);
      }
      live.clear();
    });
  };
  const failed = (reason: SignInFailure): SignInResult => ({
    kind: "failed",
    reason,
  });
  return {
    compatibility(input: {
      url: string;
      allowInsecureHttp: boolean;
    }): Compatibility {
      return browserAuthCompatibility(app(), input);
    },
    async begin(input: {
      url: string;
      allowInsecureHttp: boolean;
      returnTo?: string;
    }): Promise<BeginResult> {
      const started = await beginTransaction(input, {
        storage: env.sessionStorage,
        crypto: env.crypto,
        now: Date.now,
        app: app(),
      });
      if (started.kind === "redirect")
        env.location.assign(started.authorizeUrl);
      return started;
    },
    async complete(): Promise<SignInResult> {
      const href = env.location.href;
      // Before anything can fail or wait: no code or state stays in history.
      env.history.replaceState(env.history.state, "", CALLBACK_PATH);
      let verified;
      try {
        verified = consumeCallback(href, {
          storage: env.sessionStorage,
          now: Date.now,
          app: app(),
        });
      } catch {
        return failed("storage_unavailable");
      }
      if (verified.kind === "rejected") return failed(verified.reason);
      const { transaction } = verified;
      const exchanged = await exchangeAuthorizationCode(
        {
          hassUrl: transaction.hassUrl,
          clientId: transaction.clientId,
          code: verified.code,
          codeVerifier: transaction.codeVerifier,
        },
        { fetch: env.fetch },
      );
      if (exchanged.kind === "unreachable") return failed("unreachable");
      if (exchanged.kind === "rejected") return failed(exchanged.reason);
      const authorization = new BrowserAuthorization(exchanged.data, {
        fetch: env.fetch,
      });
      revokeOnUnload(authorization);
      return {
        kind: "signed_in",
        signIn: {
          url: transaction.hassUrl,
          allowInsecureHttp: transaction.allowInsecureHttp,
          authorization,
        },
        returnTo: transaction.returnTo,
      };
    },
  };
}
export type BrowserSignInFlow = ReturnType<typeof createBrowserSignIn>;
