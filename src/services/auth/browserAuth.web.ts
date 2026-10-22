import { createBrowserSignIn, type BrowserSignInFlow } from "./signIn";

export const browserSignInAvailable = true;
let flow: BrowserSignInFlow | undefined;
// Bound on first use: nothing touches window while the bundle loads.
const current = () =>
  (flow ??= createBrowserSignIn({
    location: window.location,
    history: window.history,
    get isSecureContext() {
      return window.isSecureContext;
    },
    // A getter, so blocked site data throws where the flow can qualify it.
    get sessionStorage() {
      return window.sessionStorage;
    },
    crypto: window.crypto,
    fetch: (...args) => globalThis.fetch(...args),
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    sendBeacon: (url, body) => navigator.sendBeacon(url, body),
  }));
export const browserSignIn: BrowserSignInFlow = {
  compatibility: (input) => current().compatibility(input),
  begin: (input) => current().begin(input),
  complete: () => current().complete(),
};
