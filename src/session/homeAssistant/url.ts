import type { ConnectionSettings } from "../../core/types";
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(
      "Enter a full Home Assistant URL, including https:// or http://.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new Error(
      "Use an HTTP(S) origin with no credentials, path, query or fragment.",
    );
  }
  return url.origin;
}
export function validateSettings(
  input: ConnectionSettings,
): ConnectionSettings {
  const url = normalizeUrl(input.url);
  if (url.startsWith("http:") && !input.allowInsecureHttp)
    throw new Error(
      "Confirm that you trust this local network before using HTTP.",
    );
  if (!input.token.trim())
    throw new Error("Enter a Home Assistant access token.");
  return { ...input, url, token: input.token.trim() };
}
export const profileIdFor = (origin: string) => `ha:${normalizeUrl(origin)}`;
