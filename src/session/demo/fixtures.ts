import type { HomeSnapshot } from "../../core/types";
import type { RawEntity } from "../homeAssistant/entityStream";

/** Fixed public identities; no household addresses or credentials. */
export function createDemoFixtures(nowMs: number) {
  const now = new Date(nowMs).toISOString();
  const definitions: [
    string,
    string,
    string,
    string,
    Record<string, unknown>,
  ][] = [
    [
      "lock.front_door",
      "Front door",
      "entry",
      "locked",
      { supported_features: 0 },
    ],
    [
      "lock.side_door",
      "Side door",
      "entry",
      "unlocked",
      { supported_features: 1 },
    ],
    [
      "sensor.front_door_battery",
      "Door battery",
      "entry",
      "86",
      { unit_of_measurement: "%", device_class: "battery" },
    ],
    [
      "climate.downstairs",
      "Downstairs thermostat",
      "living",
      "heat_cool",
      {
        supported_features: 3,
        current_temperature: 72,
        target_temp_low: 69,
        target_temp_high: 74,
        hvac_modes: ["off", "heat", "cool", "heat_cool"],
        min_temp: 50,
        max_temp: 90,
        target_temp_step: 1,
      },
    ],
    [
      "fan.office_vent",
      "Office booster vent",
      "office",
      "on",
      {
        supported_features: 57,
        percentage: 60,
        percentage_step: 10,
        preset_modes: ["normal", "sleep"],
        preset_mode: "normal",
      },
    ],
    [
      "sensor.fridge_temperature",
      "Fridge temperature",
      "kitchen",
      "37",
      { unit_of_measurement: "°F", device_class: "temperature" },
    ],
    [
      "sensor.freezer_temperature",
      "Freezer temperature",
      "kitchen",
      "-1",
      { unit_of_measurement: "°F", device_class: "temperature" },
    ],
    [
      "binary_sensor.fridge_door",
      "Fridge door",
      "kitchen",
      "off",
      { device_class: "door" },
    ],
    ["switch.fridge_power_cool", "Power cool", "kitchen", "off", {}],
    ["camera.front_door", "Front door camera", "entry", "idle", {}],
    [
      "event.front_door_motion",
      "Front door motion",
      "entry",
      new Date(nowMs - 75_000).toISOString(),
      { event_type: "motion" },
    ],
    ["switch.living_lamp", "Living room lamp", "living", "off", {}],
    [
      "sensor.feeder_last",
      "Last distribution",
      "kitchen",
      new Date(nowMs - 30 * 60_000).toISOString(),
      { device_class: "timestamp" },
    ],
    [
      "sensor.feeder_next",
      "Next distribution",
      "kitchen",
      new Date(nowMs + 3 * 60 * 60_000).toISOString(),
      { device_class: "timestamp" },
    ],
    [
      "sensor.feeder_today",
      "Reported food today",
      "kitchen",
      "40",
      { device_class: "weight", unit_of_measurement: "g" },
    ],
    [
      "sensor.feeder_last_quantity",
      "Last quantity",
      "kitchen",
      "20",
      { device_class: "weight", unit_of_measurement: "g" },
    ],
    [
      "sensor.feeder_next_quantity",
      "Next quantity",
      "kitchen",
      "20",
      { device_class: "weight", unit_of_measurement: "g" },
    ],
    [
      "binary_sensor.feeder_online",
      "Feeder connectivity",
      "kitchen",
      "on",
      { device_class: "connectivity" },
    ],
    [
      "sensor.feeder_battery",
      "Feeder battery",
      "kitchen",
      "86",
      { device_class: "battery", unit_of_measurement: "%" },
    ],
  ];
  const feederRoles: Record<string, string> = {
    "sensor.feeder_last": "last_feed_time",
    "sensor.feeder_next": "next_feed_time",
    "sensor.feeder_today": "today_feeding_quantity_weight",
    "sensor.feeder_last_quantity": "last_feed_quantity_weight",
    "sensor.feeder_next_quantity": "next_feed_quantity_weight",
    "binary_sensor.feeder_online": "online",
    "sensor.feeder_battery": "electric_quantity",
  };
  const raw: Record<string, RawEntity> = Object.fromEntries(
    definitions.map(([id, name, , state, attributes]) => [
      id,
      {
        entity_id: id,
        state,
        attributes: { ...attributes, friendly_name: name },
        last_changed: now,
        last_updated: now,
      },
    ]),
  );
  const entries = definitions.map(([id, name, area]) => ({
    id: `demo-${id}`,
    entity_id: id,
    device_id: feederRoles[id]
      ? "demo-feeder"
      : id === "switch.living_lamp"
        ? "demo-plug"
        : id.includes("fridge") || id.includes("freezer")
          ? "demo-fridge"
          : id.includes("front_door")
            ? "demo-door"
            : `demo-${id}`,
    area_id: area,
    entity_category: null,
    hidden_by: null,
    disabled_by: null,
    name,
    ...(feederRoles[id]
      ? { platform: "petlibro", translation_key: feederRoles[id] }
      : {}),
  }));
  const metadata: Pick<
    HomeSnapshot,
    "devices" | "areas" | "registryEntries" | "config"
  > = {
    registryEntries: entries,
    devices: Object.fromEntries(
      [
        ["demo-door", "Front door", null, null, "entry"],
        ["demo-lock.side_door", "Side door", null, null, "entry"],
        [
          "demo-climate.downstairs",
          "Downstairs thermostat",
          null,
          null,
          "living",
        ],
        ["demo-fan.office_vent", "Office booster vent", null, null, "office"],
        ["demo-fridge", "Kitchen fridge", null, null, "kitchen"],
        ["demo-plug", "Living room lamp", "TP-Link", "HS103", "living"],
        ["demo-feeder", "Cat feeder", "PETLIBRO", "PLAF103", "kitchen"],
      ].map(([id, name, manufacturer, model, areaId]) => [
        id!,
        {
          id: id!,
          name: name!,
          manufacturer: manufacturer ?? null,
          model: model ?? null,
          areaId: areaId!,
          entityIds: entries
            .filter((entry) => entry.device_id === id)
            .map((entry) => entry.entity_id),
        },
      ]),
    ),
    areas: {
      entry: { id: "entry", name: "Entryway" },
      living: { id: "living", name: "Living room" },
      kitchen: { id: "kitchen", name: "Kitchen" },
      office: { id: "office", name: "Office" },
    },
    config: { temperatureUnit: "°F", haVersion: "Demo" },
  };
  return { raw, metadata };
}
