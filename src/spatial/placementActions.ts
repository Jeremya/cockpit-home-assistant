import { useCockpit } from "../core/store";
import { isVisible } from "../core/selectors";
import type { PlanPlacement } from "../preferences/types";
import { session } from "../services/runtime";
import { housePlanFor } from "./plans";
import type { HousePlan } from "./model";
import {
  placementEntity,
  placementGeometryIssue,
  placementIssueLabel,
  withoutPlacement,
} from "./placements";

function context(
  identity: string,
):
  | { error: string }
  | { state: ReturnType<typeof useCockpit.getState>; plan: HousePlan } {
  const state = useCockpit.getState();
  const current = housePlanFor(state);
  if (current.identity !== identity)
    return {
      error: "The profile or plan changed. Open placement again.",
    } as const;
  if (!state.profileId || state.preferencesLoadedFor !== state.profileId)
    return {
      error: "Preferences for this profile are not loaded yet.",
    } as const;
  return { state, plan: current.plan };
}
/** Local preferences only. A network outage does not prevent a deliberate edit. */
export function savePlacement(
  identity: string,
  key: string,
  placement: PlanPlacement,
): string | null {
  const current = context(identity);
  if ("error" in current) return current.error;
  const entity = placementEntity(
    current.state.snapshot,
    current.state.preferences,
    key,
  );
  if (!entity || !isVisible(entity, current.state.preferences))
    return "This entity is no longer available for placement. Choose another.";
  const issue = placementGeometryIssue(current.plan, placement);
  if (issue) return placementIssueLabel[issue];
  const saved = session.updatePreferences((p) => ({
    ...p,
    spatial: {
      ...p.spatial,
      placements: {
        ...withoutPlacement(p, key),
        [entity.key]: {
          floorId: placement.floorId,
          roomId: placement.roomId,
          position: { x: placement.position.x, z: placement.position.z },
        },
      },
    },
  }));
  return saved ? null : "Preferences for this profile are not loaded yet.";
}
export function removePlacement(identity: string, key: string): string | null {
  const current = context(identity);
  if ("error" in current) return current.error;
  const saved = session.updatePreferences((p) => ({
    ...p,
    spatial: { ...p.spatial, placements: withoutPlacement(p, key) },
  }));
  return saved ? null : "Preferences for this profile are not loaded yet.";
}
