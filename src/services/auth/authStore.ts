import { profileIdFor, validateOrigin } from "../../session/homeAssistant/url";

/**
 * One remembered browser sign-in per profile. Only the refresh token is kept:
 * HA does not rotate it, so refreshing never writes here.
 */
export interface RememberedSession {
  version: 1;
  profileId: string;
  hassUrl: string;
  clientId: string;
  allowInsecureHttp: boolean;
  principal: string;
  refreshToken: string;
  rememberedAt: number;
}
const FIELDS = [
  "allowInsecureHttp",
  "clientId",
  "hassUrl",
  "principal",
  "profileId",
  "refreshToken",
  "rememberedAt",
  "version",
].join();
const TOKEN_VALUE = /^[\x21-\x7e]{1,16384}$/;

/** A validated copy, or undefined for anything else; never echoes the input. */
export function parseRememberedSession(
  value: unknown,
): RememberedSession | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== FIELDS || v.version !== 1)
    return undefined;
  try {
    if (
      typeof v.hassUrl !== "string" ||
      typeof v.allowInsecureHttp !== "boolean" ||
      validateOrigin({
        url: v.hassUrl,
        allowInsecureHttp: v.allowInsecureHttp,
      }).url !== v.hassUrl ||
      v.profileId !== profileIdFor(v.hassUrl) ||
      typeof v.clientId !== "string" ||
      `${new URL(v.clientId).origin}/` !== v.clientId ||
      typeof v.principal !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(v.principal) ||
      typeof v.refreshToken !== "string" ||
      !TOKEN_VALUE.test(v.refreshToken) ||
      !Number.isSafeInteger(v.rememberedAt) ||
      (v.rememberedAt as number) <= 0
    )
      return undefined;
  } catch {
    return undefined;
  }
  return {
    version: 1,
    profileId: v.profileId,
    hassUrl: v.hassUrl,
    clientId: v.clientId,
    allowInsecureHttp: v.allowInsecureHttp,
    principal: v.principal,
    refreshToken: v.refreshToken,
    rememberedAt: v.rememberedAt as number,
  };
}

export type RememberResult =
  | { kind: "saved"; replaced?: { hassUrl: string; refreshToken: string } }
  | { kind: "signed_out" };
/**
 * Browser storage readable by any script of this origin: not SecureStore.
 * Every method runs as one storage transaction, in call order.
 */
export interface AuthStore {
  /** The most recent valid record; invalid ones are deleted and reported. */
  latest(): Promise<{ session?: RememberedSession; discarded: boolean }>;
  /** Read when a sign-in starts, then checked again by `remember`. */
  signOutSeq(profileId: string): Promise<number>;
  /** Writes unless the profile was signed out since `seq`. */
  remember(session: RememberedSession, seq: number): Promise<RememberResult>;
  /** Increments the profile's sequence and deletes its record together. */
  signOut(profileId: string): Promise<number>;
  /** With a token, deletes the record only if it still holds that token. */
  remove(profileId: string, refreshToken?: string): Promise<void>;
}

export const AUTH_DATABASE = "maurice-auth";
const SESSIONS = "sessions";
const SIGN_OUTS = "signOuts";
const sequence = (value: unknown) =>
  value &&
  typeof value === "object" &&
  "seq" in value &&
  Number.isSafeInteger(value.seq) &&
  (value.seq as number) >= 0
    ? (value.seq as number)
    : 0;

/** IndexedDB `maurice-auth` v1: `sessions` and `signOuts`, keyed by profile id. */
export function createIndexedDbAuthStore(
  factory: IDBFactory,
  timeoutMs = 5_000,
): AuthStore {
  let database: Promise<IDBDatabase> | undefined;
  const open = () =>
    (database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(AUTH_DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [SESSIONS, SIGN_OUTS])
          if (!db.objectStoreNames.contains(name))
            db.createObjectStore(name, { keyPath: "profileId" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(new Error("Auth storage unavailable"));
      request.onblocked = () => reject(new Error("Auth storage blocked"));
    }).catch((error: unknown) => {
      database = undefined;
      throw error;
    }));
  /** Requests are issued from callbacks so the transaction never idles. */
  const run = <T>(
    mode: IDBTransactionMode,
    body: (
      sessions: IDBObjectStore,
      signOuts: IDBObjectStore,
      done: (value: T) => void,
    ) => void,
  ): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const transaction = db.transaction([SESSIONS, SIGN_OUTS], mode);
          let result: T;
          transaction.oncomplete = () => resolve(result);
          // Quota and other failures: messages never include record values.
          transaction.onabort = transaction.onerror = () =>
            reject(new Error("Auth storage failed"));
          body(
            transaction.objectStore(SESSIONS),
            transaction.objectStore(SIGN_OUTS),
            (value) => {
              result = value;
            },
          );
        }),
    );
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Auth storage timed out")),
        timeoutMs,
      );
    });
    return Promise.race([operation, deadline]).finally(() =>
      clearTimeout(timer),
    );
  };
  return {
    latest: () =>
      run("readwrite", (sessions, _, done) => {
        let latest: RememberedSession | undefined;
        let discarded = false;
        const cursor = sessions.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) {
            done({ session: latest, discarded });
            return;
          }
          const parsed = parseRememberedSession(current.value);
          if (!parsed || parsed.profileId !== current.key) {
            current.delete();
            discarded = true;
          } else if (!latest || parsed.rememberedAt > latest.rememberedAt)
            latest = parsed;
          current.continue();
        };
      }),
    signOutSeq: (profileId) =>
      run("readonly", (_, signOuts, done) => {
        const request = signOuts.get(profileId);
        request.onsuccess = () => done(sequence(request.result));
      }),
    remember: (session, seq) => {
      const parsed = parseRememberedSession(session);
      if (!parsed) return Promise.reject(new Error("Invalid session"));
      return run<RememberResult>("readwrite", (sessions, signOuts, done) => {
        const current = signOuts.get(parsed.profileId);
        current.onsuccess = () => {
          if (sequence(current.result) !== seq) {
            done({ kind: "signed_out" });
            return;
          }
          const previous = sessions.get(parsed.profileId);
          previous.onsuccess = () => {
            const old = parseRememberedSession(previous.result);
            sessions.put(parsed);
            done(
              old && old.refreshToken !== parsed.refreshToken
                ? {
                    kind: "saved",
                    replaced: {
                      hassUrl: old.hassUrl,
                      refreshToken: old.refreshToken,
                    },
                  }
                : { kind: "saved" },
            );
          };
        };
      });
    },
    signOut: (profileId) =>
      run("readwrite", (sessions, signOuts, done) => {
        const current = signOuts.get(profileId);
        current.onsuccess = () => {
          const next = sequence(current.result) + 1;
          signOuts.put({ profileId, seq: next });
          sessions.delete(profileId);
          done(next);
        };
      }),
    remove: (profileId, refreshToken) =>
      run("readwrite", (sessions, _, done) => {
        done(undefined);
        if (refreshToken === undefined) {
          sessions.delete(profileId);
          return;
        }
        const current = sessions.get(profileId);
        current.onsuccess = () => {
          if (
            parseRememberedSession(current.result)?.refreshToken ===
            refreshToken
          )
            sessions.delete(profileId);
        };
      }),
  };
}
