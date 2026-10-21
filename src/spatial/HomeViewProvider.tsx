import {
  createContext,
  useContext,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { useCockpit } from "../core/store";
import { housePlanFor } from "./plans";
import {
  initialHomeView,
  reconcileHomeSelection,
  type HomeViewState,
} from "./homeSelection";

/** A single, bounded, page-memory UI session. Expo web Back can replace even
 * the root layout, so a layout useState alone cannot retain Home's intent.
 * This holds IDs/selection only; HA observations stay exclusively in useCockpit.
 */
export function createHomeViewSession() {
  const initial = housePlanFor(useCockpit.getState());
  let state = initialHomeView(initial.identity, initial.plan);
  const listeners = new Set<() => void>();
  const publish = (next: HomeViewState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const reconcile = (next: HomeViewState) => {
    const latest = useCockpit.getState();
    const { identity, plan } = housePlanFor(latest);
    return reconcileHomeSelection(
      next,
      plan,
      latest.snapshot,
      identity,
      latest.preferences.spatial.areaLinks,
    );
  };
  // Invalidate even while Home/layout is absent, including away-and-back profiles.
  const unsubscribe = useCockpit.subscribe(() => publish(reconcile(state)));
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setState: (next: HomeViewState) => {
      if (next.identity === housePlanFor(useCockpit.getState()).identity)
        publish(reconcile(next));
    },
    dispose: () => {
      unsubscribe();
      listeners.clear();
    },
  };
}
type HomeViewSession = ReturnType<typeof createHomeViewSession>;
// Lazily create the production instance; test providers own disposable sessions.
let pageSession: HomeViewSession | undefined;
const HomeViewContext = createContext<HomeViewSession | null>(null);
export function HomeViewProvider({
  children,
  session,
}: PropsWithChildren<{ session?: HomeViewSession }>) {
  const value = session ?? (pageSession ??= createHomeViewSession());
  return <HomeViewContext value={value}>{children}</HomeViewContext>;
}
export function useHomeView() {
  const session = useContext(HomeViewContext);
  if (!session)
    throw new Error("HomeViewProvider is required above the router");
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return { state, setState: session.setState };
}
