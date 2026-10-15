import rawPlan from "./current-plan.json";
import samplePlan from "./sample-plan.json";
import { parseHousePlan } from "./model";

export const sampleHouse = parseHousePlan(samplePlan)!;
export const installedHouse = parseHousePlan(rawPlan) ?? sampleHouse;
export function houseForMode(mode: "demo" | "homeAssistant" | null) {
  return mode === "demo" ? sampleHouse : installedHouse;
}
