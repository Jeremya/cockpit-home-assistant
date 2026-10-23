import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAuthChannel } from "./authChannel";
import { createIndexedDbAuthStore } from "./authStore";
import { browserSignIn } from "./browserAuth";
import { GrantPrincipals } from "./principals";
import { revokeRefreshToken } from "./tokenEndpoint";
import type { WebAuth } from "./webAuth";

// Blocked site data can make the getter itself throw.
const indexedDb = (() => {
  try {
    return globalThis.indexedDB;
  } catch {
    return undefined;
  }
})();
export const webAuth: WebAuth | undefined = {
  ...(indexedDb ? { store: createIndexedDbAuthStore(indexedDb) } : {}),
  channel: createAuthChannel(
    typeof BroadcastChannel === "undefined" ? undefined : BroadcastChannel,
  ),
  principals: new GrantPrincipals(AsyncStorage),
  restore: (session) => browserSignIn.restore(session),
  revoke: (hassUrl, refreshToken) =>
    revokeRefreshToken(
      { hassUrl, refreshToken },
      { fetch: (...args) => globalThis.fetch(...args) },
    ),
};
