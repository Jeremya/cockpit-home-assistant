import {
  Auth,
  ERR_INVALID_AUTH,
  type AuthData,
} from "home-assistant-js-websocket";
import {
  revokeRefreshToken,
  type EndpointDeps,
  type RevocationResult,
} from "./tokenEndpoint";

/** Additive to `ConnectionSettings`: the same origin rules, no token string. */
export interface BrowserSignIn {
  url: string;
  allowInsecureHttp: boolean;
  authorization: BrowserAuthorization;
  /** The user asked this browser to remember the sign-in (C03). */
  remember?: boolean;
  /** Restored from this browser: the principal it was remembered under. */
  rememberedPrincipal?: string;
}

/** Official Auth with one refresh in flight; once closed it holds no token. */
class SessionAuth extends Auth {
  closed = false;
  private refreshing?: Promise<void>;
  override refreshAccessToken(): Promise<void> {
    if (this.closed) return Promise.reject(ERR_INVALID_AUTH);
    this.refreshing ??= super.refreshAccessToken().finally(() => {
      this.refreshing = undefined;
      if (this.closed) this.drop();
    });
    return this.refreshing;
  }
  drop() {
    this.data = { ...this.data, access_token: "", refresh_token: "" };
  }
}

/**
 * A browser sign-in held only in this page's memory. It is never serialized;
 * SessionManager and the backend share this object, not its tokens.
 */
export class BrowserAuthorization {
  readonly auth: Auth;
  readonly hassUrl: string;
  /** Held by the browser's auth store, so page unload must not revoke it. */
  remembered = false;
  private revocation?: Promise<RevocationResult>;
  constructor(
    data: AuthData,
    private deps: EndpointDeps,
  ) {
    this.auth = new SessionAuth(data);
    this.hassUrl = data.hassUrl;
  }
  get closed() {
    return (this.auth as SessionAuth).closed;
  }
  /** For the auth store only; undefined once local use has ended. */
  get refreshToken(): string | undefined {
    const auth = this.auth as SessionAuth;
    return (!auth.closed && auth.data.refresh_token) || undefined;
  }
  /** Ends local use, then returns the refresh token it held, at most once. */
  private end(): string | undefined {
    const auth = this.auth as SessionAuth;
    if (auth.closed) return undefined;
    const token = auth.data.refresh_token;
    auth.closed = true;
    auth.drop();
    return token || undefined;
  }
  /** Local use ends before the remote request; the result qualifies revocation. */
  close(): Promise<RevocationResult> {
    const token = this.end();
    this.revocation ??= token
      ? revokeRefreshToken(
          { hassUrl: this.hassUrl, refreshToken: token },
          this.deps,
        )
      : Promise.resolve({ kind: "unconfirmed" });
    return this.revocation;
  }
  /** Ends local use only, for a sign-in this browser still remembers. */
  release() {
    this.end();
    this.revocation ??= Promise.resolve({ kind: "unconfirmed" });
  }
  /** For pagehide: no awaiting is possible, so the caller sends a beacon. */
  closeForUnload(): { url: string; body: URLSearchParams } | undefined {
    if (this.remembered) return undefined;
    const token = this.end();
    if (!token) return undefined;
    this.revocation = Promise.resolve({ kind: "unconfirmed" });
    return {
      url: `${this.hassUrl}/auth/revoke`,
      body: new URLSearchParams({ token }),
    };
  }
}
