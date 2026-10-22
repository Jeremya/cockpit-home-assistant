import { normalizeUrl } from "../../session/homeAssistant/url";

export interface AppContext {
  origin: string;
  /** window.isSecureContext: HTTPS or a loopback HTTP origin. */
  secureContext: boolean;
}
export type CompatibilityBlock =
  "invalid_url" | "http_not_trusted" | "mixed_content" | "insecure_app";
export type Compatibility =
  | { kind: "compatible"; hassUrl: string }
  | { kind: "blocked"; reason: CompatibilityBlock };

/**
 * Browser sign-in pairs that work without a proxy. Anything else gets help
 * text and the manual token form, never a workaround.
 */
export function browserAuthCompatibility(
  app: AppContext,
  ha: { url: string; allowInsecureHttp: boolean },
): Compatibility {
  let hassUrl: string;
  try {
    hassUrl = normalizeUrl(ha.url);
  } catch {
    return { kind: "blocked", reason: "invalid_url" };
  }
  // Web Crypto (PKCE) and any kept session require a secure context.
  if (!app.secureContext) return { kind: "blocked", reason: "insecure_app" };
  if (hassUrl.startsWith("http:")) {
    // Token fetches and ws:// from an HTTPS page are blocked mixed content.
    if (new URL(app.origin).protocol === "https:")
      return { kind: "blocked", reason: "mixed_content" };
    if (!ha.allowInsecureHttp)
      return { kind: "blocked", reason: "http_not_trusted" };
  }
  return { kind: "compatible", hassUrl };
}
