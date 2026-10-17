import { createStore, type StoreApi } from "zustand/vanilla";
import { resolveAlias } from "../preferences/types";
import type { CommandRecord } from "./types";

export interface CommandState {
  readonly profileId: string | null;
  readonly scopeId: string | null;
  readonly records: readonly CommandRecord[];
}
export type CommandStore = Pick<
  StoreApi<CommandState>,
  "getState" | "getInitialState" | "subscribe"
>;
export function createCommandStore() {
  const writable = createStore<CommandState>(() => ({
    profileId: null,
    scopeId: null,
    records: Object.freeze([]),
  }));
  const readonly: CommandStore = Object.freeze({
    getState: writable.getState,
    getInitialState: writable.getInitialState,
    subscribe: writable.subscribe,
  });
  return { writable, readonly };
}
/** Does not fall back to an older action after the latest outcome is dismissed. */
export function latestCommand(
  state: CommandState,
  profileId: string,
  key: string,
  aliases: Record<string, string> = {},
): CommandRecord | undefined {
  if (state.profileId !== profileId) return undefined;
  const canonical = resolveAlias(key, aliases);
  return state.records.findLast(
    (record) =>
      record.profileId === profileId &&
      resolveAlias(record.entityKey, aliases) === canonical,
  );
}
export function visibleCommand(record: CommandRecord | undefined) {
  return record && !record.dismissed && record.status !== "superseded"
    ? record
    : undefined;
}
