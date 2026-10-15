export interface RawEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}
interface CompressedState {
  s: string;
  a: Record<string, unknown>;
  lc: number;
  lu?: number;
  c?: unknown;
}
export interface EntityStreamMessage {
  a?: Record<string, CompressedState>;
  r?: string[];
  c?: Record<
    string,
    { "+"?: Partial<CompressedState>; "-"?: { a?: string[] } }
  >;
}
/** The first event of each explicit subscription starts from an empty collection. */
export function applyEntityStream(
  previous: Record<string, RawEntity>,
  event: EntityStreamMessage,
  initial = false,
): Record<string, RawEntity> {
  const next = initial ? {} : { ...previous };
  for (const [id, value] of Object.entries(event.a ?? {})) {
    next[id] = {
      entity_id: id,
      state: value.s,
      attributes: value.a ?? {},
      last_changed: new Date(value.lc * 1000).toISOString(),
      last_updated: new Date((value.lu ?? value.lc) * 1000).toISOString(),
    };
  }
  for (const id of event.r ?? []) delete next[id];
  for (const [id, diff] of Object.entries(event.c ?? {})) {
    const old = next[id];
    if (!old) continue;
    const plus = diff["+"] ?? {};
    const attributes =
      plus.a || diff["-"]?.a
        ? { ...old.attributes, ...plus.a }
        : old.attributes;
    for (const key of diff["-"]?.a ?? []) delete attributes[key];
    next[id] = {
      ...old,
      state: plus.s ?? old.state,
      attributes,
      last_changed:
        plus.lc === undefined
          ? old.last_changed
          : new Date(plus.lc * 1000).toISOString(),
      last_updated:
        plus.lu !== undefined
          ? new Date(plus.lu * 1000).toISOString()
          : plus.lc !== undefined
            ? new Date(plus.lc * 1000).toISOString()
            : old.last_updated,
    };
  }
  return next;
}
