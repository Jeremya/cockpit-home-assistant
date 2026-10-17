import type { EntityRecord, HomeSnapshot } from "../../core/types";
import type { PlanPlacement } from "../../preferences/types";
import { emptyPreferences } from "../../preferences/types";
import { parseHousePlan } from "../model";
import { resetSpatial } from "../profilePlan";
import sample from "../sample-plan.json";

export const publicPlan = parseHousePlan(sample)!;
export const location: PlanPlacement = {
  floorId: "sample-floor-1",
  roomId: null,
  position: { x: 1, z: 1 },
};
export const fixtureEntity = (
  overrides: Partial<EntityRecord> = {},
): EntityRecord => ({
  key: "stable",
  entityId: "switch.lamp",
  domain: "switch",
  state: "off",
  attributes: {},
  lastChanged: "2026-10-15T00:00:00Z",
  lastUpdated: "2026-10-15T00:00:00Z",
  deviceId: "plug",
  areaId: "kitchen",
  entityCategory: null,
  hiddenInHA: false,
  disabledInHA: false,
  name: "Test lamp",
  ...overrides,
});
export const fixtureSnapshot = (
  entities: EntityRecord[] = [fixtureEntity()],
): HomeSnapshot => ({
  sessionId: "fixture",
  syncEpoch: 1,
  receivedAt: "2026-10-15T00:00:00Z",
  entities: Object.fromEntries(
    entities.map((entity) => [entity.entityId, entity]),
  ),
  devices: {},
  areas: { kitchen: { id: "kitchen", name: "Kitchen" } },
  registryEntries: [],
  config: { haVersion: "2026.10.1", temperatureUnit: "°C" },
  identities: { schemaVersion: 1, entityKeys: {}, aliases: {} },
  metadata: {
    entities: { kind: "fresh", loadedAt: "" },
    devices: { kind: "fresh", loadedAt: "" },
    areas: { kind: "fresh", loadedAt: "" },
  },
});
export function fixturePreferences(
  placements: Record<string, PlanPlacement> = {},
) {
  return {
    ...emptyPreferences(),
    spatial: { ...resetSpatial(publicPlan), placements },
  };
}
