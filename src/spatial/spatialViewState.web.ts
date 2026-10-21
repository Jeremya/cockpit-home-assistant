import { useSyncExternalStore } from "react";
import { useCockpit } from "../core/store";
import { housePlanFor } from "./plans";
import type {
  SpatialOwner,
  SpatialView,
  SpatialViewState,
} from "./spatialViewState";
import type { SceneFailure } from "../components/CockpitSceneView";
import { createSpatialViewSession } from "./spatialViewSession";
let pageSession: ReturnType<typeof createSpatialViewSession> | undefined;
function currentSession() {
  if (!pageSession) {
    const session = createSpatialViewSession(
      housePlanFor(useCockpit.getState()).identity,
    );
    useCockpit.subscribe(() =>
      session.scope(housePlanFor(useCockpit.getState()).identity),
    );
    pageSession = session;
  }
  return pageSession;
}
/** Two bounded UI entries survive Expo root remounts; no observations/persistence. */
export function useSpatialViewState(identity: string, owner: SpatialOwner) {
  const session = currentSession();
  const state: SpatialViewState = useSyncExternalStore(
    session.subscribe,
    () => session.getSnapshot()[owner],
    () => session.getSnapshot()[owner],
  );
  return {
    ...state,
    choose: (view: SpatialView) =>
      session.choose(identity, owner, state.attempt, view),
    fail: (failure: SceneFailure) =>
      session.fail(identity, owner, state.attempt, failure),
    retry: () => session.retry(identity, owner, state.attempt),
  };
}
