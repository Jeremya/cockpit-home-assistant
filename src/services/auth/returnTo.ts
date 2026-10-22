/** First path segments a sign-in may return to; the callback itself never is one. */
export const INTERNAL_ROUTES = [
  "",
  "settings",
  "entities",
  "house",
  "house-links",
  "house-place",
  "device",
  "appliance",
  "diagnostics",
] as const;
const MAX_DESTINATION = 512;

/**
 * Same-origin path and query of a known route, or "/". The query is opaque so
 * future detail-panel parameters survive without this module knowing them.
 */
export function internalDestination(candidate: unknown, appOrigin: string) {
  if (
    typeof candidate !== "string" ||
    candidate.length > MAX_DESTINATION ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(candidate) ||
    /(^|\/)(\.|%2e){1,2}(\/|$|\?|#)/i.test(candidate)
  )
    return "/";
  let url: URL;
  try {
    url = new URL(candidate, appOrigin);
  } catch {
    return "/";
  }
  const segment = url.pathname.split("/")[1] ?? "";
  if (
    url.origin !== appOrigin ||
    !(INTERNAL_ROUTES as readonly string[]).includes(segment)
  )
    return "/";
  return url.pathname + url.search;
}
