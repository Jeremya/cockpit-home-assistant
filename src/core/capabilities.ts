import type { Capability, EntityRecord, HomeConfig } from "./types";
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
export function getCapability(
  entity: EntityRecord,
  config: HomeConfig,
): Capability | null {
  const a = entity.attributes;
  const rawFlags = finite(a.supported_features, 0);
  const flags =
    Number.isInteger(rawFlags) && rawFlags >= 0 && rawFlags <= 0x7fffffff
      ? rawFlags
      : 0;
  switch (entity.domain) {
    case "lock":
      return {
        kind: "lock",
        canOpen: (flags & 1) !== 0,
        codeFormat: typeof a.code_format === "string" ? a.code_format : null,
      };
    case "climate": {
      const single = (flags & 1) !== 0;
      const range = (flags & 2) !== 0;
      const step = finite(
        a.target_temp_step,
        config.temperatureUnit === "°F" ? 1 : 0.5,
      );
      return {
        kind: "climate",
        target:
          single && range
            ? "both"
            : single
              ? "single"
              : range
                ? "range"
                : "none",
        hvacModes: strings(a.hvac_modes),
        min: finite(a.min_temp, config.temperatureUnit === "°F" ? 45 : 7),
        max: finite(a.max_temp, config.temperatureUnit === "°F" ? 95 : 35),
        step: step > 0 ? step : 1,
        unit: config.temperatureUnit,
      };
    }
    case "fan": {
      const step = finite(a.percentage_step, 1);
      return {
        kind: "fan",
        onOff: (flags & 48) === 48,
        canTurnOn: (flags & 32) !== 0,
        canTurnOff: (flags & 16) !== 0,
        percentage: (flags & 1) !== 0 ? { step: step > 0 ? step : 1 } : null,
        presets: (flags & 8) !== 0 ? strings(a.preset_modes) : [],
      };
    }
    case "switch":
    case "sensor":
    case "binary_sensor":
    case "event":
    case "camera":
      return { kind: entity.domain };
    default:
      return null;
  }
}
