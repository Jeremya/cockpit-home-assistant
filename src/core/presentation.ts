import type { EntityRecord, HomeConfig } from "./types";
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
    return ["door", "window", "opening"].includes(String(a.device_class))
      ? entity.state === "on"
        ? "Open"
        : "Closed"
      : entity.state === "on"
        ? "Detected"
        : "Clear";
  if (entity.domain === "sensor")
    return `${entity.state}${a.unit_of_measurement ? ` ${String(a.unit_of_measurement)}` : ""}`;
  if (entity.domain === "fan" && entity.state === "on")
    return typeof a.percentage === "number" ? `On · ${a.percentage}%` : "On";
  return entity.state
    .replaceAll("_", " ")
    .replace(/^./, (value) => value.toUpperCase());
}
