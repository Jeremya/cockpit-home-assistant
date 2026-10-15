import { getCapability } from "../capabilities";
import { getCondition } from "../policy";
import type { EntityRecord } from "../types";
const entity = (overrides: Partial<EntityRecord> = {}): EntityRecord => ({
  key: "one",
  entityId: "climate.home",
  domain: "climate",
  state: "heat",
  attributes: { supported_features: 3 },
  lastChanged: "",
  lastUpdated: "",
  deviceId: null,
  areaId: null,
  entityCategory: null,
  disabledInHA: false,
  hiddenInHA: false,
  name: "Home",
  ...overrides,
});
test("climate unit and fallback limits follow HA configuration", () => {
  expect(
    getCapability(entity(), { temperatureUnit: "°F", haVersion: "" }),
  ).toMatchObject({ unit: "°F", min: 45, target: "both" });
  expect(
    getCapability(entity(), { temperatureUnit: "°C", haVersion: "" }),
  ).toMatchObject({ unit: "°C", min: 7 });
});
test("unknown and unavailable locks never become a reassuring state", () => {
  expect(getCondition(entity({ domain: "lock", state: "unknown" }), true)).toBe(
    "unknown",
  );
  expect(
    getCondition(entity({ domain: "lock", state: "unavailable" }), true),
  ).toBe("unavailable");
  expect(getCondition(entity({ domain: "lock", state: "locked" }), false)).toBe(
    "stale",
  );
});
