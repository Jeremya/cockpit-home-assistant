import type { EntityRecord, HomeConfig, HomeSnapshot } from "../../core/types";
import { emptyIdentity } from "../../preferences/types";

export const config: HomeConfig = {
  temperatureUnit: "°C",
  haVersion: "2026.10.1",
};
export const entity = (
  overrides: Partial<EntityRecord> = {},
): EntityRecord => ({
  key: "stable-lamp",
  entityId: "switch.lamp",
  domain: "switch",
  state: "off",
  attributes: {},
  lastChanged: "",
  lastUpdated: "",
  deviceId: null,
  areaId: null,
  entityCategory: null,
  hiddenInHA: false,
  disabledInHA: false,
  name: "Public lamp",
  ...overrides,
});
export const snapshot = (entities = [entity()]): HomeSnapshot => ({
  sessionId: "test-session",
  syncEpoch: 1,
  receivedAt: "",
  config,
  entities: Object.fromEntries(entities.map((e) => [e.entityId, e])),
  devices: {},
  areas: {},
  registryEntries: [],
  identities: emptyIdentity(),
  metadata: {
    entities: { kind: "fresh", loadedAt: "" },
    devices: { kind: "fresh", loadedAt: "" },
    areas: { kind: "fresh", loadedAt: "" },
  },
});
export const lock = (attributes: Record<string, unknown> = {}) =>
  entity({
    key: "door",
    entityId: "lock.door",
    domain: "lock",
    state: "locked",
    attributes: { supported_features: 1, ...attributes },
  });
export const climate = (attributes: Record<string, unknown> = {}) =>
  entity({
    key: "thermostat",
    entityId: "climate.home",
    domain: "climate",
    state: "heat",
    attributes: {
      supported_features: 3,
      hvac_modes: ["off", "heat", "cool", "auto", "heat_cool"],
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      temperature: 18,
      ...attributes,
    },
  });
export const fan = (attributes: Record<string, unknown> = {}) =>
  entity({
    key: "vent",
    entityId: "fan.vent",
    domain: "fan",
    state: "off",
    attributes: {
      supported_features: 57,
      percentage_step: 10,
      percentage: 0,
      preset_modes: ["sleep", "auto"],
      ...attributes,
    },
  });
