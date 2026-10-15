import type { SpatialPreferences } from "../preferences/types";
import type { HousePlan } from "./model";

/**
 * A profile owns its plan once seeded: bundled revisions never overwrite it.
 * Only an explicit reset replaces it, together with links and placements.
 */
const clone = (plan: HousePlan): HousePlan => JSON.parse(JSON.stringify(plan));

export function resetSpatial(defaultPlan: HousePlan): SpatialPreferences {
  return {
    plan: clone(defaultPlan),
    seededFrom: { planId: defaultPlan.id, revision: defaultPlan.revision },
    areaLinks: {},
    placements: {},
  };
}
/** Seeds an unseeded profile; returns the same object when nothing changes. */
export function seedSpatial(
  spatial: SpatialPreferences,
  defaultPlan: HousePlan,
): SpatialPreferences {
  if (spatial.plan) return spatial;
  return {
    ...spatial,
    ...resetSpatial(defaultPlan),
    areaLinks: spatial.areaLinks,
    placements: spatial.placements,
  };
}
export function planForProfile(
  spatial: SpatialPreferences,
  defaultPlan: HousePlan,
): HousePlan {
  return spatial.plan ?? defaultPlan;
}
/** True when the bundled default differs from the one this profile was seeded from. */
export function defaultPlanChanged(
  spatial: SpatialPreferences,
  defaultPlan: HousePlan,
): boolean {
  const seeded = spatial.seededFrom;
  return (
    !!seeded &&
    (seeded.planId !== defaultPlan.id ||
      seeded.revision !== defaultPlan.revision)
  );
}
