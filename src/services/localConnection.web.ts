import { normalizeUrl } from "../session/homeAssistant/url";
import type { LocalConnection } from "./localConnection";

export function canLoadLocalConnection() {
  return (
    __DEV__ &&
    typeof window !== "undefined" &&
    window.location.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
  );
}

export async function loadLocalConnection(): Promise<LocalConnection> {
  if (!canLoadLocalConnection()) {
    throw new Error(
      "Local connection loading is available in web development.",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("http://localhost:8083/local-connection", {
      method: "POST",
      headers: { "X-Maurice-Local-Connection": "1" },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Local connection unavailable");
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("url" in data) ||
      typeof data.url !== "string" ||
      !("token" in data) ||
      typeof data.token !== "string" ||
      !data.token ||
      data.token.length > 16_384 ||
      !/^[\x21-\x7e]+$/.test(data.token)
    ) {
      throw new Error("Invalid local connection");
    }
    return { url: normalizeUrl(data.url), token: data.token };
  } catch {
    throw new Error(
      "Could not load the local connection. Start node scripts/preview-devices.mjs --local-ha on port 8083, and check that .local/ha-token exists with permissions 600.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
