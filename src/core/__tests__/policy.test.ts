import { assessEntity, getCondition, LOW_BATTERY_PERCENT } from "../policy";
import { primaryValue } from "../presentation";
import { attentionSummary } from "../selectors";
import { entityAppearance } from "../../components/EntityIcon";
import { colors } from "../../components/ui";
import { emptyPreferences } from "../../preferences/types";
import type { EntityRecord, HomeSnapshot } from "../types";

const config = { temperatureUnit: "°F" as const, haVersion: "Test" };
const entity = (overrides: Partial<EntityRecord> = {}): EntityRecord => ({
  key: "fixture-key",
  entityId: "binary_sensor.fixture",
  domain: "binary_sensor",
  name: "Public fixture",
  state: "off",
  attributes: {},
  lastChanged: "2000-01-01T00:00:00Z",
  lastUpdated: "2000-01-01T00:00:00Z",
  areaId: null,
  deviceId: "fixture-device",
  entityCategory: null,
  hiddenInHA: false,
  disabledInHA: false,
  ...overrides,
});
const binary = (kind: string, state: string) =>
  entity({
    state,
    attributes: { device_class: kind },
  });
const battery = (state: string, unit: unknown = "%") =>
  entity({
    domain: "sensor",
    state,
    attributes: { device_class: "battery", unit_of_measurement: unit },
  });
function snapshot(entities: EntityRecord[]): HomeSnapshot {
  return {
    sessionId: "test",
    syncEpoch: 1,
    receivedAt: "2026-10-15T00:00:00Z",
    entities: Object.fromEntries(entities.map((e) => [e.entityId, e])),
    devices: {},
    areas: {},
    registryEntries: [],
    config,
    identities: { schemaVersion: 1, entityKeys: {}, aliases: {} },
    metadata: {
      entities: { kind: "fresh", loadedAt: "" },
      devices: { kind: "fresh", loadedAt: "" },
      areas: { kind: "fresh", loadedAt: "" },
    },
  };
}

test.each([
  ["problem", "on", "attention", "Problem reported"],
  ["problem", "off", "normal", "No problem reported"],
  ["connectivity", "off", "attention", "Disconnected"],
  ["connectivity", "on", "normal", "Connected"],
  ["battery", "on", "attention", "Low battery"],
  ["battery", "off", "normal", "Battery not low"],
] as const)(
  "HA %s=%s has the correct polarity and label",
  (kind, state, condition, label) => {
    const value = binary(kind, state);
    expect(assessEntity(value, true)).toMatchObject({
      condition,
      ruleApplied: true,
    });
    expect(primaryValue(value, config)).toBe(label);
  },
);

test.each(["smoke", "carbon_monoxide", "gas", "safety"])(
  "%s is an alert only when reported on",
  (kind) => {
    expect(getCondition(binary(kind, "on"), true)).toBe("alert");
    expect(getCondition(binary(kind, "off"), true)).toBe("normal");
  },
);
test.each([
  "door",
  "window",
  "opening",
  "garage_door",
  "lock",
  "moisture",
  "tamper",
])("%s uses declared semantics without interpreting its name", (kind) => {
  expect(getCondition(binary(kind, "on"), true)).toBe("attention");
  expect(getCondition(binary(kind, "off"), true)).toBe("normal");
});
test.each(["motion", "occupancy", "battery_charging"])(
  "%s activity is not a household problem",
  (kind) => {
    expect(assessEntity(binary(kind, "on"), true)).toMatchObject({
      condition: "active",
      ruleApplied: false,
    });
  },
);

test.each([
  ["0", "attention"],
  ["19.9", "attention"],
  ["20", "attention"],
  ["20.1", "normal"],
  ["100", "normal"],
] as const)(
  "battery %s percent uses an explicit inclusive threshold",
  (state, condition) => {
    expect(LOW_BATTERY_PERCENT).toBe(20);
    expect(assessEntity(battery(state), true)).toMatchObject({
      condition,
      ruleApplied: true,
    });
  },
);
test.each([
  "",
  " ",
  "NaN",
  "Infinity",
  "-1",
  "101",
  "20%",
  "20garbage",
  "0x10",
  "low",
  "normal",
])(
  "battery %s does not get an invented percentage or healthy meaning",
  (state) => {
    expect(assessEntity(battery(state), true)).toMatchObject({
      condition: "unknown",
      ruleApplied: false,
    });
  },
);
test.each([undefined, null, "V", 100])(
  "battery with unit %s is not guessed to be a percentage",
  (unit) => {
    // Explicitly pass the attribute; undefined must not invoke the fixture default.
    const value = battery("15");
    value.attributes.unit_of_measurement = unit;
    expect(getCondition(value, true)).toBe("unknown");
  },
);
test("enum codes and vendor words need verification even with fresh registries", () => {
  for (const state of ["low", "normal", "online", "0", "1"]) {
    const value = entity({
      domain: "sensor",
      state,
      attributes: { device_class: "enum" },
    });
    expect(assessEntity(value, true)).toMatchObject({
      condition: "unknown",
      ruleApplied: false,
    });
    expect(primaryValue(value, config)).toBe(state);
  }
});
test("missing/new binary classes keep raw on/off labels and cannot certify health", () => {
  for (const attributes of [
    {},
    { device_class: "future_class" },
    { device_class: "constructor" },
  ]) {
    const value = entity({
      attributes,
      name: "Critical battery low",
      state: "off",
    });
    expect(primaryValue(value, config)).toBe("Off");
    expect(assessEntity(value, true).ruleApplied).toBe(false);
  }
  const malformed = binary("connectivity", "disconnected");
  expect(getCondition(malformed, true)).toBe("unknown");
  expect(primaryValue(malformed, config)).toBe("disconnected");
});
test("quality and availability take precedence over severity and old timestamps", () => {
  for (const state of ["unknown", "unavailable"]) {
    expect(getCondition(binary("problem", state), true)).toBe(state);
    expect(getCondition(binary("problem", state), false)).toBe("stale");
  }
  expect(getCondition(binary("problem", "on"), false)).toBe("stale");
  expect(getCondition(binary("problem", "off"), true)).toBe("normal"); // unchanged since 2000 is not automatically stale
  expect(getCondition(entity({ domain: "sensor", state: "0" }), true)).toBe(
    "normal",
  );
});
test("lock transitions and observed safety semantics stay intact", () => {
  for (const [state, condition] of Object.entries({
    locked: "normal",
    unlocked: "attention",
    open: "attention",
    jammed: "alert",
    locking: "active",
    unlocking: "active",
    opening: "active",
    other: "unknown",
  }))
    expect(getCondition(entity({ domain: "lock", state }), true)).toBe(
      condition,
    );
});
test("severity, uncertainty, unavailable and cached appearances remain distinct", () => {
  expect(entityAppearance(binary("smoke", "on"), true).tint).toBe(
    colors.danger,
  );
  expect(entityAppearance(binary("problem", "on"), true).tint).toBe(
    colors.warning,
  );
  expect(entityAppearance(binary("problem", "unknown"), true).tint).toBe(
    colors.warning,
  );
  expect(entityAppearance(binary("problem", "unavailable"), true).tint).toBe(
    colors.muted,
  );
  expect(entityAppearance(binary("problem", "on"), false).tint).toBe(
    colors.muted,
  );
});
test("partial physical devices retain uncertainty in global coverage; hide and disabled rules still apply", () => {
  const values = [
    binary("connectivity", "on"),
    entity({
      key: "missing",
      entityId: "sensor.missing",
      domain: "sensor",
      state: "unavailable",
    }),
    entity({
      key: "reading",
      entityId: "sensor.reading",
      domain: "sensor",
      state: "12",
      attributes: { device_class: "temperature" },
    }),
    entity({
      key: "hidden",
      entityId: "sensor.hidden",
      domain: "sensor",
      state: "unknown",
      hiddenInHA: true,
    }),
    entity({
      key: "disabled",
      entityId: "sensor.disabled",
      domain: "sensor",
      state: "unknown",
      disabledInHA: true,
    }),
  ]; // all have the same deviceId; a connected member does not certify the rest
  const prefs = emptyPreferences();
  const summary = attentionSummary(snapshot(values), prefs, true);
  expect(summary).toMatchObject({
    visibleCount: 3,
    assessedCount: 1,
    unassessedCount: 2,
  });
  expect(summary.items.map((item) => item.key)).toEqual(["missing"]);
  expect(attentionSummary(snapshot(values), prefs, false)).toMatchObject({
    assessedCount: 0,
    items: [],
  });
  prefs.visibility = { missing: "hidden", hidden: "shown", disabled: "shown" };
  expect(
    attentionSummary(snapshot(values), prefs, true).items.map(
      (item) => item.key,
    ),
  ).toEqual(["hidden"]);
  expect(attentionSummary(snapshot(values), emptyPreferences(), true)).toEqual(
    summary,
  );
});

test("reported alerts and problems precede unavailable and uninterpreted readings", () => {
  const values = [
    entity({
      key: "unknown",
      entityId: "sensor.unknown",
      domain: "sensor",
      state: "low",
      attributes: { device_class: "enum" },
    }),
    entity({
      key: "offline",
      entityId: "sensor.offline",
      state: "unavailable",
    }),
    {
      ...binary("problem", "on"),
      key: "problem",
      entityId: "binary_sensor.problem",
    },
    { ...binary("smoke", "on"), key: "alert", entityId: "binary_sensor.smoke" },
  ];
  expect(
    attentionSummary(snapshot(values), emptyPreferences(), true).items.map(
      (e) => e.key,
    ),
  ).toEqual(["alert", "problem", "offline", "unknown"]);
});
