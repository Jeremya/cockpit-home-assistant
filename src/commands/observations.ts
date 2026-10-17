import type { EntityRecord, HomeSnapshot } from "../core/types";
import { resolveAlias } from "../preferences/types";

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = Object.keys(a);
  const right = b as Record<string, unknown>;
  return (
    left.length === Object.keys(b).length &&
    left.every(
      (key) =>
        Object.hasOwn(right, key) &&
        equal((a as Record<string, unknown>)[key], right[key]),
    )
  );
}
export interface Observation {
  readonly entity: EntityRecord;
  readonly revision: number;
}
/** Full authoritative snapshots, bounded by current entities. HA timestamps are
 * compared for equality only, never ordered against each other or the phone. */
export class ObservationRevisions {
  private counter = 0;
  private current = new Map<string, Observation>();
  private snapshot?: HomeSnapshot;
  reset() {
    this.current.clear();
    this.snapshot = undefined;
  }
  key(key: string) {
    return resolveAlias(key, this.snapshot?.identities.aliases ?? {});
  }
  get(key: string) {
    return this.current.get(this.key(key));
  }
  observe(snapshot: HomeSnapshot): boolean {
    if (
      this.snapshot?.sessionId === snapshot.sessionId &&
      snapshot.syncEpoch < this.snapshot.syncEpoch
    )
      return false;
    const aliases = snapshot.identities.aliases;
    const previous = new Map(
      [...this.current].map(([key, value]) => [
        resolveAlias(key, aliases),
        value,
      ]),
    );
    const freshEpoch =
      snapshot.sessionId !== this.snapshot?.sessionId ||
      snapshot.syncEpoch !== this.snapshot?.syncEpoch;
    const next = new Map<string, Observation>();
    const ambiguous = new Set<string>();
    for (const entity of Object.values(snapshot.entities)) {
      const key = resolveAlias(entity.key, aliases);
      if (next.has(key) || ambiguous.has(key)) {
        next.delete(key);
        ambiguous.add(key);
        continue;
      }
      const old = previous.get(key);
      const unchanged =
        !freshEpoch &&
        old &&
        old.entity.entityId === entity.entityId &&
        old.entity.state === entity.state &&
        old.entity.lastUpdated === entity.lastUpdated &&
        old.entity.lastChanged === entity.lastChanged &&
        old.entity.disabledInHA === entity.disabledInHA &&
        equal(old.entity.attributes, entity.attributes);
      next.set(key, {
        entity,
        revision: unchanged ? old.revision : ++this.counter,
      });
    }
    this.current = next;
    this.snapshot = snapshot;
    return true;
  }
}
