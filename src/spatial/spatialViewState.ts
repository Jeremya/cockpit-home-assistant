import { useState } from "react";
import type { SceneFailure } from "../components/CockpitSceneView";
export type SpatialView = "auto" | "2d" | "3d";
export interface SpatialViewState {
  view: SpatialView;
  failure: SceneFailure | null;
  attempt: number;
}
export type SpatialOwner = "home" | "house";
export const initialSpatialView = (): SpatialViewState => ({
  view: "auto",
  failure: null,
  attempt: 0,
});
/** Native view ownership remains local to its existing screen scope. */
export function useSpatialViewState(_identity: string, _owner: SpatialOwner) {
  const [state, setState] = useState(initialSpatialView);
  return {
    ...state,
    choose: (view: SpatialView) => setState((value) => ({ ...value, view })),
    fail: (failure: SceneFailure) =>
      setState((value) => ({ ...value, failure })),
    retry: () =>
      setState((value) => ({
        ...value,
        view: "3d",
        failure: null,
        attempt: value.attempt + 1,
      })),
  };
}
