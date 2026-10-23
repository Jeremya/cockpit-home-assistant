import {
  parseRememberedSession,
  type AuthStore,
  type RememberedSession,
} from "../authStore";

/**
 * The IndexedDB store's contract in memory: one transaction per call, run in
 * call order, values copied in and out. `hold()` pauses every later call.
 */
export function memoryAuthStore() {
  const sessions = new Map<string, unknown>();
  const seqs = new Map<string, number>();
  const failing = new Set<keyof AuthStore>();
  const calls: string[] = [];
  let queue: Promise<void> = Promise.resolve();
  let gate: Promise<void> | undefined;
  const run = <T>(name: keyof AuthStore, body: () => T): Promise<T> => {
    calls.push(name);
    const operation = queue.then(async () => {
      if (gate) await gate;
      if (failing.has(name)) throw new Error("Auth storage failed");
      return body();
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
  const store: AuthStore = {
    latest: () =>
      run("latest", () => {
        let session: RememberedSession | undefined;
        let discarded = false;
        for (const [key, value] of [...sessions]) {
          const parsed = parseRememberedSession(value);
          if (!parsed || parsed.profileId !== key) {
            sessions.delete(key);
            discarded = true;
          } else if (!session || parsed.rememberedAt > session.rememberedAt)
            session = parsed;
        }
        return { session, discarded };
      }),
    signOutSeq: (profileId) =>
      run("signOutSeq", () => seqs.get(profileId) ?? 0),
    remember: (value, seq) =>
      run("remember", () => {
        const parsed = parseRememberedSession(structuredClone(value));
        if (!parsed) throw new Error("Invalid session");
        if ((seqs.get(parsed.profileId) ?? 0) !== seq)
          return { kind: "signed_out" as const };
        const old = parseRememberedSession(sessions.get(parsed.profileId));
        sessions.set(parsed.profileId, parsed);
        return old && old.refreshToken !== parsed.refreshToken
          ? {
              kind: "saved" as const,
              replaced: {
                hassUrl: old.hassUrl,
                refreshToken: old.refreshToken,
              },
            }
          : { kind: "saved" as const };
      }),
    signOut: (profileId) =>
      run("signOut", () => {
        const next = (seqs.get(profileId) ?? 0) + 1;
        seqs.set(profileId, next);
        sessions.delete(profileId);
        return next;
      }),
    remove: (profileId, refreshToken) =>
      run("remove", () => {
        if (
          refreshToken === undefined ||
          parseRememberedSession(sessions.get(profileId))?.refreshToken ===
            refreshToken
        )
          sessions.delete(profileId);
      }),
  };
  return {
    store,
    sessions,
    seqs,
    failing,
    calls,
    hold() {
      let release!: () => void;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}
