export const AUTH_CHANNEL = "maurice-auth";
/** Tab-to-tab events. They name a profile and never carry a token. */
export type AuthMessage =
  | { type: "signed-out"; profileId: string }
  /** The principal is a non-secret hash, so tabs of the same user can ignore it. */
  | { type: "principal-changed"; profileId: string; principal: string };
export interface AuthChannel {
  post(message: AuthMessage): void;
  subscribe(listener: (message: AuthMessage) => void): () => void;
}

function parse(data: unknown): AuthMessage | undefined {
  if (
    !data ||
    typeof data !== "object" ||
    !("profileId" in data) ||
    typeof data.profileId !== "string" ||
    !data.profileId.startsWith("ha:") ||
    !("type" in data)
  )
    return undefined;
  const keys = Object.keys(data).sort().join();
  if (data.type === "signed-out" && keys === "profileId,type")
    return { type: "signed-out", profileId: data.profileId };
  if (
    data.type === "principal-changed" &&
    keys === "principal,profileId,type" &&
    "principal" in data &&
    typeof data.principal === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(data.principal)
  )
    return {
      type: "principal-changed",
      profileId: data.profileId,
      principal: data.principal,
    };
  return undefined;
}

/** A BroadcastChannel does not deliver its own messages, only other tabs'. */
export function createAuthChannel(
  Channel: typeof BroadcastChannel | undefined,
): AuthChannel {
  const channel = Channel ? new Channel(AUTH_CHANNEL) : undefined;
  const listeners = new Set<(message: AuthMessage) => void>();
  if (channel)
    channel.onmessage = (event: MessageEvent) => {
      const message = parse(event.data);
      if (message) listeners.forEach((listener) => listener(message));
    };
  return {
    post: (message) => channel?.postMessage(parse(message)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
