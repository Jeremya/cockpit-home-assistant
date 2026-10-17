import type { EntityRecord, EntityRegistryEntry, HomeSnapshot } from "../types";
import {
  fixtureEntity,
  fixtureSnapshot,
} from "../../spatial/__tests__/placementFixtures";

export function publicDeviceFixture(): HomeSnapshot {
  const definitions: [string, string, string, Record<string, unknown>][] = [
    [
      "last_feed_time",
      "Dernier repas",
      "2026-10-16T12:00:00Z",
      { device_class: "timestamp" },
    ],
    [
      "next_feed_time",
      "Prochain repas",
      "2026-10-16T22:00:00Z",
      { device_class: "timestamp" },
    ],
    [
      "today_feeding_quantity_weight",
      "Quantité",
      "40",
      { device_class: "weight", unit_of_measurement: "g" },
    ],
    [
      "last_feed_quantity_weight",
      "Last amount",
      "20",
      { device_class: "weight", unit_of_measurement: "g" },
    ],
    [
      "next_feed_quantity_weight",
      "Next amount",
      "20",
      { device_class: "weight", unit_of_measurement: "g" },
    ],
    ["online", "Network", "on", { device_class: "connectivity" }],
    ["battery_state", "Vendor battery", "low", {}],
  ];
  const members = definitions.map(
    ([role, name, state, attributes], i): EntityRecord =>
      fixtureEntity({
        key: `reading-${i}`,
        entityId: `${role === "online" ? "binary_sensor" : "sensor"}.public_${i}`,
        domain: role === "online" ? "binary_sensor" : "sensor",
        name,
        deviceId: "feeder",
        state,
        attributes,
      }),
  );
  const registryEntries = members.map((entity, i): EntityRegistryEntry => ({
    id: entity.key,
    entity_id: entity.entityId,
    device_id: entity.deviceId,
    area_id: null,
    name: null,
    hidden_by: null,
    disabled_by: null,
    entity_category: null,
    platform: "petlibro",
    translation_key: definitions[i]![0],
  }));
  return {
    ...fixtureSnapshot(members),
    registryEntries,
    devices: {
      feeder: {
        id: "feeder",
        name: "Public cat feeder",
        manufacturer: "PETLIBRO",
        model: "PLAF103",
        areaId: "kitchen",
        entityIds: members.map((e) => e.entityId),
      },
    },
  };
}
