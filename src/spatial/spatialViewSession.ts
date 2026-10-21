import type { SceneFailure } from "../components/CockpitSceneView";
import type {
  SpatialOwner,
  SpatialView,
  SpatialViewState,
} from "./spatialViewState";
const initial = (attempt = 0): SpatialViewState => ({
  view: "auto",
  failure: null,
  attempt,
});
/** Persistent for this page only, bounded to two routes and one current identity. */
export function createSpatialViewSession(identity: string) {
  let scope = identity;
  let sequence = 0;
  let state = { home: initial(), house: initial() };
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const update = (
    id: string,
    owner: SpatialOwner,
    change: (value: SpatialViewState) => SpatialViewState,
  ) => {
    if (id !== scope) return;
    const next = change(state[owner]);
    if (next === state[owner]) return;
    state = { ...state, [owner]: next };
    emit();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scope: (id: string) => {
      if (id !== scope) {
        scope = id;
        sequence++;
        state = { home: initial(sequence), house: initial(sequence) };
        emit();
      }
    },
    choose: (
      id: string,
      owner: SpatialOwner,
      attempt: number,
      view: SpatialView,
    ) =>
      update(id, owner, (value) =>
        value.attempt !== attempt || value.view === view
          ? value
          : { ...value, view },
      ),
    fail: (
      id: string,
      owner: SpatialOwner,
      attempt: number,
      failure: SceneFailure,
    ) =>
      update(id, owner, (value) =>
        value.attempt !== attempt || value.failure
          ? value
          : { ...value, failure },
      ),
    retry: (id: string, owner: SpatialOwner, attempt: number) =>
      update(id, owner, (value) =>
        value.attempt !== attempt
          ? value
          : {
              ...value,
              view: "3d",
              failure: null,
              attempt: ++sequence,
            },
      ),
  };
}
