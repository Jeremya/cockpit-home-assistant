import type { BrowserSignInFlow } from "./signIn";

/** Native keeps the access token and SecureStore; there is no browser sign-in. */
export const browserSignInAvailable = false;
export const browserSignIn: BrowserSignInFlow = {
  compatibility: () => ({ kind: "blocked", reason: "unsupported" }),
  begin: async () => ({ kind: "blocked", reason: "unsupported" }),
  complete: async () => ({ kind: "failed", reason: "unsupported" }),
};
