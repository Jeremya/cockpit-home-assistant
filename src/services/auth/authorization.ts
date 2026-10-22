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
  /** For pagehide: no awaiting is possible, so the caller sends a beacon. */
  closeForUnload(): { url: string; body: URLSearchParams } | undefined {
    const token = this.end();
    if (!token) return undefined;
    this.revocation = Promise.resolve({ kind: "unconfirmed" });
    return {
      url: `${this.hassUrl}/auth/revoke`,
      body: new URLSearchParams({ token }),
    };
  }
}
