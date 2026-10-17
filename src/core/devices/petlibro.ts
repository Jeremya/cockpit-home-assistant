import type { EntityRecord, HomeSnapshot, PhysicalDevice } from "../types";

/** PETLIBRO integration 1.2.32 + actual registry translation keys, verified 2026-10-16.
 * Presentation only: battery/power semantics remain governed by U04, not guessed here.
 */
export function petlibroReadings(
  device: PhysicalDevice | null,
  members: EntityRecord[],
  snapshot: HomeSnapshot,
) {
  if (
    device?.manufacturer?.toUpperCase() !== "PETLIBRO" ||
    device.model !== "PLAF103"
  )
    return null;
  const definitions = [
    ["last_feed_time", "Last reported feed", "timestamp"],
    ["next_feed_time", "Next announced feed", "timestamp"],
    ["today_feeding_quantity_weight", "Reported today", "weight"],
    ["online", "Connectivity", "connectivity"],
    ["last_feed_quantity_weight", "Last reported quantity", "weight"],
    ["next_feed_quantity_weight", "Next announced quantity", "weight"],
  ] as const;
  const rows = definitions.map(([role, label, kind]) => {
    const candidates = members.filter((entity) => {
      const entry = snapshot.registryEntries.find(
        (entry) =>
          entry.id === entity.key &&
          entry.entity_id === entity.entityId &&
          entry.device_id === device.id,
      );
      return (
        entry?.platform === "petlibro" &&
        entry.translation_key === role &&
        entity.domain ===
          (kind === "connectivity" ? "binary_sensor" : "sensor") &&
        entity.attributes.device_class === kind
      );
    });
    return {
      role,
      label,
      kind,
      entity: candidates.length === 1 ? candidates[0]! : null,
    };
  });
  // Missing/ambiguous role metadata must not imply that names or entity suffixes identify a role.
  return rows.some((row) => row.entity) ? rows : null;
}
