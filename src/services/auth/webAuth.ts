import type { BrowserSignIn } from "./authorization";
import type { AuthChannel } from "./authChannel";
import type { AuthStore, RememberedSession } from "./authStore";
import type { GrantPrincipals } from "./principals";
import type { RevocationResult } from "./tokenEndpoint";

/** What `SessionManager` needs on web only; native passes nothing. */
export interface WebAuth {
  /** Absent when this browser offers no IndexedDB: sign-ins stay in memory. */
  store?: AuthStore;
  channel: AuthChannel;
  principals: GrantPrincipals;
  restore(session: RememberedSession): BrowserSignIn | undefined;
  revoke(hassUrl: string, refreshToken: string): Promise<RevocationResult>;
}
