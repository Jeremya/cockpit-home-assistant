import type { KeyValueStorage } from "../storage";

/** Web only: which HA user the power grants of each profile belong to. */
export const PRINCIPALS_KEY = "maurice.grantPrincipals.v1";
const PRINCIPAL = /^[A-Za-z0-9_-]{43}$/;

/** `base64url(SHA-256(hassUrl + "\n" + userId))`; the raw user id is never stored. */
export async function principalFor(
  hassUrl: string,
  userId: string,
  crypto: Pick<Crypto, "subtle"> = globalThis.crypto,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${hassUrl}\n${userId}`),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest))
    binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type Principals = Record<string, string>;
/** An unreadable record is empty: every profile's principal becomes unknown. */
function parse(raw: string | null): Principals {
  try {
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      Object.keys(value).sort().join() === "principals,version" &&
      "version" in value &&
      value.version === 1 &&
      "principals" in value &&
      value.principals &&
      typeof value.principals === "object" &&
      !Array.isArray(value.principals) &&
      Object.values(value.principals).every(
        (principal) =>
          typeof principal === "string" && PRINCIPAL.test(principal),
      )
    )
      return { ...(value.principals as Principals) };
  } catch {
    // Same as missing.
  }
  return {};
}

/** Non-secret record beside the preferences file, whose schema is unchanged. */
export class GrantPrincipals {
  private queue: Promise<void> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}
  async get(profileId: string): Promise<string | undefined> {
    return parse(await this.storage.getItem(PRINCIPALS_KEY))[profileId];
  }
  set(profileId: string, principal: string): Promise<void> {
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        if (!PRINCIPAL.test(principal)) throw new Error("Invalid principal");
        const principals = parse(await this.storage.getItem(PRINCIPALS_KEY));
        principals[profileId] = principal;
        await this.storage.setItem(
          PRINCIPALS_KEY,
          JSON.stringify({ version: 1, principals }),
        );
      });
    this.queue = operation;
    return operation;
  }
}
