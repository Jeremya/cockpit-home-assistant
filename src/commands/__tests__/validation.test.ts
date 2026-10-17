import type { EntityRecord } from "../../core/types";
import { toServiceCall } from "../serviceCalls";
import { validateIntent } from "../validation";
import type { CommandIntent } from "../types";
import { climate, config, entity, fan, lock } from "./fixtures";

test.each<[string, EntityRecord, CommandIntent, object]>([
  [
    "lock",
    { ...lock(), state: "unlocked" },
    { kind: "setLockState", state: "locked" },
    { domain: "lock", service: "lock" },
  ],
  [
    "unlock with a transient code",
    lock(),
    { kind: "setLockState", state: "unlocked", code: "0017" },
    { domain: "lock", service: "unlock", data: { code: "0017" } },
  ],
  [
    "open",
    lock(),
    { kind: "setLockState", state: "open" },
    { domain: "lock", service: "open" },
  ],
  [
    "single target rounded to step",
    climate(),
    { kind: "setClimateTarget", target: { temperature: 20.26 } },
    {
      domain: "climate",
      service: "set_temperature",
      data: { temperature: 20.5 },
    },
  ],
  [
    "range",
    { ...climate(), state: "heat_cool" },
    { kind: "setClimateTarget", target: { low: 20, high: 23.2 } },
    {
      domain: "climate",
      service: "set_temperature",
      data: { target_temp_low: 20, target_temp_high: 23 },
    },
  ],
  [
    "HVAC mode",
    climate(),
    { kind: "setHvacMode", mode: "auto" },
    {
      domain: "climate",
      service: "set_hvac_mode",
      data: { hvac_mode: "auto" },
    },
  ],
  [
    "fan on",
    fan(),
    { kind: "setFanOn", on: true },
    { domain: "fan", service: "turn_on" },
  ],
  [
    "fan off",
    { ...fan(), state: "on" },
    { kind: "setFanOn", on: false },
    { domain: "fan", service: "turn_off" },
  ],
  [
    "fan percentage",
    fan(),
    { kind: "setFanPercentage", percentage: 46 },
    { domain: "fan", service: "set_percentage", data: { percentage: 50 } },
  ],
  [
    "fan preset",
    fan(),
    { kind: "setFanPreset", preset: "sleep" },
    {
      domain: "fan",
      service: "set_preset_mode",
      data: { preset_mode: "sleep" },
    },
  ],
  [
    "switch on",
    entity(),
    { kind: "setSwitch", on: true },
    { domain: "switch", service: "turn_on" },
  ],
  [
    "switch off",
    entity({ state: "on" }),
    { kind: "setSwitch", on: false },
    { domain: "switch", service: "turn_off" },
  ],
])(
  "%s validates and projects exactly the allowed service fields",
  (_, e, intent, expected) => {
    const result = validateIntent(intent, e, config);
    expect(result.kind).toBe("valid");
    if (result.kind === "valid")
      expect(toServiceCall(result.intent, e.entityId)).toEqual({
        ...expected,
        entityId: e.entityId,
      });
  },
);

test.each<[EntityRecord, unknown]>([
  [climate(), { kind: "setClimateTarget", target: { temperature: NaN } }],
  [climate(), { kind: "setClimateTarget", target: { temperature: Infinity } }],
  [climate(), { kind: "setClimateTarget", target: { temperature: "20" } }],
  [climate(), { kind: "setClimateTarget", target: { temperature: null } }],
  [climate(), { kind: "setClimateTarget", target: { temperature: 36 } }],
  [climate(), { kind: "setClimateTarget", target: { temperature: 6.9 } }],
  [
    climate(),
    {
      kind: "setClimateTarget",
      target: { temperature: 20, low: 18, high: 22 },
    },
  ],
  [climate(), { kind: "setClimateTarget", target: null }],
  [
    { ...climate(), state: "heat_cool" },
    { kind: "setClimateTarget", target: { low: 23, high: 20 } },
  ],
  [
    { ...climate(), state: "heat_cool" },
    { kind: "setClimateTarget", target: { low: 20 } },
  ],
  [fan(), { kind: "setFanPercentage", percentage: -1 }],
  [fan(), { kind: "setFanPercentage", percentage: 101 }],
  [fan(), { kind: "setFanPercentage", percentage: Infinity }],
  [fan(), { kind: "setFanPercentage", percentage: "30" }],
  [fan(), { kind: "setFanOn", on: 1 }],
  [entity(), { kind: "setSwitch", on: "false" }],
  [lock(), { kind: "setLockState", state: "toggle" }],
  [lock(), { kind: "setLockState", state: "unlocked", code: 17 }],
  [lock(), { kind: "setLockState", state: "unlocked", code: " " }],
  [entity(), { kind: "callService", service: "toggle" }],
  [entity(), null],
])("malformed/out-of-range request is refused %#", (e, input) => {
  expect(validateIntent(input, e, config)).toMatchObject({
    kind: "refused",
    reason: "invalid_value",
  });
});

test.each<[EntityRecord, CommandIntent]>([
  [lock({ supported_features: 0 }), { kind: "setLockState", state: "open" }],
  [lock({ supported_features: -1 }), { kind: "setLockState", state: "open" }],
  [entity({ domain: "sensor" }), { kind: "setSwitch", on: true }],
  [
    climate({ supported_features: 0 }),
    { kind: "setClimateTarget", target: { temperature: 20 } },
  ],
  [
    climate({ supported_features: 2 }),
    { kind: "setClimateTarget", target: { temperature: 20 } },
  ],
  [
    climate({ supported_features: 1 }),
    { kind: "setClimateTarget", target: { low: 20, high: 22 } },
  ],
  [
    { ...climate(), state: "auto" },
    { kind: "setClimateTarget", target: { low: 20, high: 22 } },
  ],
  [
    { ...climate(), state: "heat_cool" },
    { kind: "setClimateTarget", target: { temperature: 20 } },
  ],
  [climate(), { kind: "setHvacMode", mode: "emergency" }],
  [fan({ supported_features: 8 }), { kind: "setFanOn", on: true }],
  [fan({ supported_features: 16 }), { kind: "setFanOn", on: true }],
  [fan({ supported_features: 32 }), { kind: "setFanOn", on: false }],
  [
    fan({ supported_features: 8 }),
    { kind: "setFanPercentage", percentage: 50 },
  ],
  [fan({ supported_features: 1 }), { kind: "setFanPreset", preset: "sleep" }],
  [fan(), { kind: "setFanPreset", preset: "unsupported" }],
])("unsupported current capability/mode is refused %#", (e, input) => {
  expect(validateIntent(input, e, config)).toMatchObject({
    kind: "refused",
    reason: "unsupported",
  });
});

test.each([NaN, Infinity, "0.5", 0, -0.5])(
  "invalid explicit climate step %p fails closed",
  (step) => {
    expect(
      validateIntent(
        { kind: "setClimateTarget", target: { temperature: 20 } },
        climate({ target_temp_step: step }),
        config,
      ),
    ).toMatchObject({ kind: "refused", reason: "invalid_capability" });
  },
);
test.each([
  { min_temp: 40, max_temp: 35 },
  { min_temp: "7" },
  { max_temp: Infinity },
])("invalid climate limits fail closed: %p", (attributes) => {
  expect(
    validateIntent(
      { kind: "setClimateTarget", target: { temperature: 20 } },
      climate(attributes),
      config,
    ),
  ).toMatchObject({ kind: "refused", reason: "invalid_capability" });
});
test.each([0, -1, 101, NaN, "10"])(
  "invalid explicit fan step %p fails closed",
  (step) => {
    expect(
      validateIntent(
        { kind: "setFanPercentage", percentage: 50 },
        fan({ percentage_step: step }),
        config,
      ),
    ).toMatchObject({ kind: "refused", reason: "invalid_capability" });
  },
);

test.each<[EntityRecord, CommandIntent]>([
  [lock(), { kind: "setLockState", state: "locked" }],
  [
    { ...lock(), state: "unlocked" },
    { kind: "setLockState", state: "unlocked" },
  ],
  [
    { ...lock(), state: "opening" },
    { kind: "setLockState", state: "open" },
  ],
  [
    climate({ temperature: 20.2 }),
    { kind: "setClimateTarget", target: { temperature: 20 } },
  ],
  [
    {
      ...climate({ target_temp_low: 20, target_temp_high: 22 }),
      state: "heat_cool",
    },
    { kind: "setClimateTarget", target: { low: 20, high: 22 } },
  ],
  [climate(), { kind: "setHvacMode", mode: "heat" }],
  [fan(), { kind: "setFanOn", on: false }],
  [fan({ percentage: 50 }), { kind: "setFanPercentage", percentage: 50 }],
  [fan({ preset_mode: "sleep" }), { kind: "setFanPreset", preset: "sleep" }],
  [entity(), { kind: "setSwitch", on: false }],
])("already-satisfied request is an explicit no-op %#", (e, intent) => {
  expect(validateIntent(intent, e, config)).toMatchObject({ kind: "no-op" });
});

test("Fahrenheit, lower-bound grid, rounded max, and fractional fan speeds are deterministic", () => {
  const intent = { kind: "setClimateTarget", target: { temperature: 72.14 } };
  const result = validateIntent(
    intent,
    climate({ min_temp: 45.2, max_temp: 95, target_temp_step: 1 }),
    { ...config, temperatureUnit: "°F" },
  );
  expect(result).toEqual({
    kind: "valid",
    intent: { ...intent, target: { temperature: 72.2 } },
  });
  expect(
    validateIntent(
      { ...intent, target: { temperature: 95 } },
      climate({ min_temp: 45.2, max_temp: 95, target_temp_step: 1 }),
      { ...config, temperatureUnit: "°F" },
    ),
  ).toMatchObject({ intent: { target: { temperature: 94.2 } } });
  for (const [value, expected] of [
    [30, 33],
    [70, 67],
    [100, 100],
  ]) {
    expect(
      validateIntent(
        { kind: "setFanPercentage", percentage: value },
        fan({ percentage_step: 100 / 3 }),
        config,
      ),
    ).toMatchObject({ intent: { percentage: expected } });
  }
});
test("missing step/limits use declared-unit defaults and null observations are never zero", () => {
  const result = validateIntent(
    { kind: "setClimateTarget", target: { temperature: 20 } },
    climate({
      min_temp: undefined,
      max_temp: undefined,
      target_temp_step: undefined,
      temperature: null,
    }),
    config,
  );
  expect(result).toMatchObject({
    kind: "valid",
    intent: { target: { temperature: 20 } },
  });
  expect(
    validateIntent(
      { kind: "setFanPercentage", percentage: 0 },
      fan({ percentage: null }),
      config,
    ),
  ).toMatchObject({ kind: "valid" });
});
test("preset-only and one-direction fans expose only their declared actions", () => {
  expect(
    validateIntent(
      { kind: "setFanPreset", preset: "auto" },
      fan({ supported_features: 8 }),
      config,
    ).kind,
  ).toBe("valid");
  expect(
    validateIntent(
      { kind: "setFanOn", on: true },
      fan({ supported_features: 32 }),
      config,
    ).kind,
  ).toBe("valid");
});
test.each(["unavailable", "unknown", " "])(
  "no-op never bypasses availability: %p",
  (state) => {
    expect(
      validateIntent(
        { kind: "setSwitch", on: false },
        entity({ state }),
        config,
      ),
    ).toMatchObject({ kind: "refused", reason: "unavailable" });
  },
);
test("disabled entities and extraneous service fields cannot bypass the boundary", () => {
  expect(
    validateIntent(
      { kind: "setSwitch", on: true },
      entity({ disabledInHA: true }),
      config,
    ),
  ).toMatchObject({ kind: "refused", reason: "disabled" });
  const result = validateIntent(
    {
      kind: "setSwitch",
      on: true,
      entityId: "switch.other",
      service: "toggle",
      data: { code: "secret" },
    },
    entity(),
    config,
  );
  expect(result).toEqual({
    kind: "valid",
    intent: { kind: "setSwitch", on: true },
  });
});
