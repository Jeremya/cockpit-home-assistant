import type { ServiceCall } from "../session/types";
import type { CommandIntent } from "./types";

/** Called only after validation. Explicit projection prevents extra service data. */
export function toServiceCall(
  intent: CommandIntent,
  entityId: string,
): ServiceCall {
  switch (intent.kind) {
    case "setLockState":
      return {
        domain: "lock",
        service:
          intent.state === "locked"
            ? "lock"
            : intent.state === "unlocked"
              ? "unlock"
              : "open",
        entityId,
        ...(intent.code === undefined ? {} : { data: { code: intent.code } }),
      };
    case "setClimateTarget":
      return {
        domain: "climate",
        service: "set_temperature",
        entityId,
        data:
          intent.target.temperature !== undefined
            ? { temperature: intent.target.temperature }
            : {
                target_temp_low: intent.target.low,
                target_temp_high: intent.target.high,
              },
      };
    case "setHvacMode":
      return {
        domain: "climate",
        service: "set_hvac_mode",
        entityId,
        data: { hvac_mode: intent.mode },
      };
    case "setFanOn":
      return {
        domain: "fan",
        service: intent.on ? "turn_on" : "turn_off",
        entityId,
      };
    case "setFanPercentage":
      return {
        domain: "fan",
        service: "set_percentage",
        entityId,
        data: { percentage: intent.percentage },
      };
    case "setFanPreset":
      return {
        domain: "fan",
        service: "set_preset_mode",
        entityId,
        data: { preset_mode: intent.preset },
      };
    case "setSwitch":
      return {
        domain: "switch",
        service: intent.on ? "turn_on" : "turn_off",
        entityId,
      };
  }
}
