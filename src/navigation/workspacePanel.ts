import { useSyncExternalStore } from "react";

/** Whether the web workspace currently shows details in a side panel. The
 * shell and the detail Stack's header read it; it holds no target or data. */
export type WorkspacePanel = { paneled: boolean; open: boolean };

let current: WorkspacePanel = { paneled: false, open: false };
const listeners = new Set<() => void>();

export function publishWorkspacePanel(next: WorkspacePanel) {
  if (next.paneled === current.paneled && next.open === current.open) return;
  current = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () => current;
export function useWorkspacePanel() {
  return useSyncExternalStore(subscribe, read, read);
}
