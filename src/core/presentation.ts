import type { EntityRecord, HomeConfig } from "./types";
import { assessEntity } from "./policy";
export const kindLabel: Record<string, string> = {
  lock: "Lock",
  climate: "Thermostat",
  fan: "Ventilation",
  sensor: "Sensor",
  binary_sensor: "Sensor",
  camera: "Camera",
  event: "Activity",
  switch: "Switch",
};
function timestampValue(entity: EntityRecord): string | null {
  if (
    entity.domain === "sensor" &&
    ["timestamp", "date"].includes(String(entity.attributes.device_class))
  ) {
    if (["unknown", "unavailable"].includes(entity.state)) return null;
    // Date.parse alone accepts numeric strings and invents dates. Require the reported ISO shape.
    const valid =
      entity.attributes.device_class === "date"
        ? /^\d{4}-\d{2}-\d{2}$/.test(entity.state)
        : /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(entity.state);
    const time = valid ? Date.parse(entity.state) : NaN;
    return Number.isFinite(time) && time > 0
      ? new Date(
          entity.attributes.device_class === "date"
            ? entity.state + "T12:00:00"
            : time,
        ).toLocaleString(
          undefined,
          entity.attributes.device_class === "date"
            ? { year: "numeric", month: "short", day: "numeric" }
            : {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              },
        )
      : "Time not reported";
  }
  return null;
}
export function primaryValue(
  entity: EntityRecord,
  config: HomeConfig,
  now = Date.now(),
): string {
  const a = entity.attributes;
  if (entity.state === "unknown" || entity.state === "unavailable")
    return entity.state === "unknown" ? "Unknown" : "Unavailable";
  if (entity.domain === "event") {
    const time = Date.parse(entity.state);
    return Number.isFinite(time)
      ? `${String(a.event_type ?? "Event")} · ${Math.max(0, Math.floor((now - time) / 60_000))} min ago`
      : "No recent event";
  }
  if (entity.domain === "climate")
    return typeof a.current_temperature === "number"
      ? `${a.current_temperature.toLocaleString(undefined, { maximumFractionDigits: 1 })}${config.temperatureUnit}`
      : "Temperature unknown";
  if (entity.domain === "binary_sensor")
    return (
      assessEntity(entity, true).binaryLabel ?? (entity.state || "Unknown")
    );
  const timestamp = timestampValue(entity);
  if (timestamp !== null) return timestamp;
  if (entity.domain === "sensor")
    return `${entity.state}${a.unit_of_measurement ? ` ${String(a.unit_of_measurement)}` : ""}`;
  if (entity.domain === "fan" && entity.state === "on")
    return typeof a.percentage === "number" ? `On · ${a.percentage}%` : "On";
  return entity.state
    .replaceAll("_", " ")
    .replace(/^./, (value) => value.toUpperCase());
}
