import rawPlan from "./current-plan.json";
import samplePlan from "./sample-plan.json";
import { parseHousePlan } from "./model";
import { useCockpit } from "../core/store";
import { defaultPlanChanged, planForProfile } from "./profilePlan";

export const sampleHouse = parseHousePlan(samplePlan)!;
export const installedHouse = parseHousePlan(rawPlan) ?? sampleHouse;
/** The bundled default a profile is seeded from; demo always uses the public sample. */
export function houseForMode(mode: "demo" | "homeAssistant" | null) {
  return mode === "demo" ? sampleHouse : installedHouse;
}
/** The one place screens get the active plan: the profile's own copy, else the bundled default. */
type PlanState = Pick<
  ReturnType<typeof useCockpit.getState>,
  "mode" | "profileId" | "preferences"
>;
/** Pure form of useHousePlan, for checks against the latest store state. */
export function housePlanFor({ mode, profileId, preferences }: PlanState) {
  const fallback = houseForMode(mode);
  const plan = planForProfile(preferences.spatial, fallback);
  return {
    plan,
    defaultChanged: defaultPlanChanged(preferences.spatial, fallback),
    /** The displayed plan's identity: a change resets floor and room selection. */
    identity: JSON.stringify([profileId, plan.id, plan.revision]),
  };
}
export function useHousePlan() {
  const mode = useCockpit((state) => state.mode);
  const preferences = useCockpit((state) => state.preferences);
  const profileId = useCockpit((state) => state.profileId);
  return housePlanFor({ mode, profileId, preferences });
}
