import { getCapability } from "../core/capabilities";
import { desiredState, satisfiesDesired } from "./predicates";
import type { EntityRecord, HomeConfig } from "../core/types";
import type { CommandIntent, CommandRefusal, RefusalReason } from "./types";

const messages: Record<RefusalReason, string> = {
  not_ready: "Wait for the home to finish synchronizing.",
  background: "Return to the app before sending a command.",
  session_changed: "The connection changed. Review the device and try again.",
  entity_changed:
    "The entity identity changed. Review the device and try again.",
  entity_missing: "This entity is no longer in the current home.",
  unavailable: "The entity has no available observation. Nothing was sent.",
  disabled: "This entity is disabled in Home Assistant.",
  unsupported:
    "This action is not declared by the entity's current capabilities.",
  invalid_value:
    "The requested value is invalid or outside the supported limits.",
  invalid_capability:
    "Home Assistant supplied invalid control limits. Nothing was sent.",
  tracking_capacity:
    "Too many requests are pending or being tracked. Wait before sending another.",
  in_flight: "Wait for this device's pending request to finish.",
  fresh_observation_required:
    "Wait for a fresh lock observation before sending another action.",
  capability_changed:
    "The control's unit or capabilities changed. Review the device and try again.",
  dispatch_failed:
    "The request could not be started. Review the current connection.",
};
export function refuse(reason: RefusalReason): CommandRefusal {
  return { kind: "refused", reason, message: messages[reason] };
}
type ValidationResult =
  | CommandRefusal
  | { kind: "no-op"; message: string }
  | { kind: "valid"; intent: CommandIntent };
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const malformedNumber = (value: unknown) => value != null && !finite(value);
/** Quantize from the lower bound; never manufacture a value outside the grid. */
function quantize(value: number, min: number, max: number, step: number) {
  const last = Math.floor((max - min) / step + 1e-9);
  const index = Math.min(last, Math.max(0, Math.round((value - min) / step)));
  return Number((min + index * step).toFixed(10));
}

/** Pure, runtime-checked and based on the latest observation, never a dialog snapshot. */
export function validateIntent(
  input: unknown,
  entity: EntityRecord,
  config: HomeConfig,
  requireDispatch = false,
): ValidationResult {
  if (entity.disabledInHA) return refuse("disabled");
  if (["unavailable", "unknown", ""].includes(entity.state.trim()))
    return refuse("unavailable");
  if (!object(input)) return refuse("invalid_value");
  const cap = getCapability(entity, config);
  const a = entity.attributes;
  const valid = (intent: CommandIntent, message: string): ValidationResult =>
    !(
      requireDispatch &&
      (intent.kind === "setClimateTarget" || intent.kind === "setFanPercentage")
    ) && satisfiesDesired(desiredState(intent, entity, config), entity, config)
      ? { kind: "no-op", message }
      : { kind: "valid", intent };
  switch (input.kind) {
    case "setLockState": {
      if (cap?.kind !== "lock") return refuse("unsupported");
      const state = input.state;
      if (state !== "locked" && state !== "unlocked" && state !== "open")
        return refuse("invalid_value");
      if (state === "open" && !cap.canOpen) return refuse("unsupported");
      // code_format is a Python regex and can use HA's default code. HA validates it;
      // do not reinterpret it as JavaScript or retain the code in a result/store.
      if (
        input.code !== undefined &&
        (typeof input.code !== "string" || !input.code.trim())
      )
        return refuse("invalid_value");
      return valid(
        {
          kind: "setLockState",
          state,
          ...(input.code === undefined ? {} : { code: input.code as string }),
        },
        state === "locked"
          ? "Already locked."
          : state === "unlocked"
            ? "Already unlocked."
            : "Already open or opening.",
      );
    }
    case "setClimateTarget": {
      if (cap?.kind !== "climate" || cap.target === "none")
        return refuse("unsupported");
      if (
        [a.min_temp, a.max_temp, a.target_temp_step].some(malformedNumber) ||
        cap.min > cap.max ||
        cap.step <= 0 ||
        (finite(a.target_temp_step) && a.target_temp_step <= 0) ||
        !Number.isSafeInteger(Math.floor((cap.max - cap.min) / cap.step))
      )
        return refuse("invalid_capability");
      const target = input.target;
      if (!object(target)) return refuse("invalid_value");
      const single = Object.hasOwn(target, "temperature");
      if (
        single &&
        (Object.hasOwn(target, "low") || Object.hasOwn(target, "high"))
      )
        return refuse("invalid_value");
      if (
        (single && cap.target === "range") ||
        (!single && cap.target === "single")
      )
        return refuse("unsupported");
      // Both-shaped thermostats need an unambiguous active mode. In particular,
      // "auto" is not an alias for "heat_cool". Never send an implicit mode change.
      if (
        cap.target === "both" &&
        (single
          ? !["heat", "cool"].includes(entity.state)
          : entity.state !== "heat_cool")
      )
        return refuse("unsupported");
      const inRange = (value: unknown): value is number =>
        finite(value) && value >= cap.min && value <= cap.max;
      if (single) {
        if (!inRange(target.temperature)) return refuse("invalid_value");
        const temperature = quantize(
          target.temperature,
          cap.min,
          cap.max,
          cap.step,
        );
        return valid(
          { kind: "setClimateTarget", target: { temperature } },
          "Target temperature already set.",
        );
      }
      if (
        !inRange(target.low) ||
        !inRange(target.high) ||
        target.low > target.high
      )
        return refuse("invalid_value");
      const low = quantize(target.low, cap.min, cap.max, cap.step);
      const high = quantize(target.high, cap.min, cap.max, cap.step);
      return valid(
        { kind: "setClimateTarget", target: { low, high } },
        "Target temperature range already set.",
      );
    }
    case "setHvacMode":
      if (cap?.kind !== "climate") return refuse("unsupported");
      if (typeof input.mode !== "string" || !input.mode.trim())
        return refuse("invalid_value");
      if (!cap.hvacModes.includes(input.mode)) return refuse("unsupported");
      return valid(
        { kind: "setHvacMode", mode: input.mode },
        "HVAC mode already set.",
      );
    case "setFanOn":
      if (cap?.kind !== "fan") return refuse("unsupported");
      if (typeof input.on !== "boolean") return refuse("invalid_value");
      if (!(input.on ? cap.canTurnOn : cap.canTurnOff))
        return refuse("unsupported");
      return valid(
        { kind: "setFanOn", on: input.on },
        input.on ? "Already on." : "Already off.",
      );
    case "setFanPercentage": {
      if (cap?.kind !== "fan" || !cap.percentage) return refuse("unsupported");
      const step = cap.percentage.step;
      if (
        malformedNumber(a.percentage_step) ||
        (finite(a.percentage_step) && a.percentage_step <= 0) ||
        step > 100 ||
        !Number.isSafeInteger(Math.floor(100 / step))
      )
        return refuse("invalid_capability");
      if (
        !finite(input.percentage) ||
        input.percentage < 0 ||
        input.percentage > 100
      )
        return refuse("invalid_value");
      // HA expects integer percentages; thirds (100 / speed_count) must still
      // reach 100. Snap to a supported speed then round its percentage.
      const percentage = Math.round(
        Math.min(100, Math.round(input.percentage / step) * step),
      );
      return valid(
        { kind: "setFanPercentage", percentage },
        "Fan percentage already set.",
      );
    }
    case "setFanPreset":
      if (cap?.kind !== "fan") return refuse("unsupported");
      if (typeof input.preset !== "string" || !input.preset.trim())
        return refuse("invalid_value");
      if (!cap.presets.includes(input.preset)) return refuse("unsupported");
      return valid(
        { kind: "setFanPreset", preset: input.preset },
        "Fan preset already set.",
      );
    case "setSwitch":
      if (cap?.kind !== "switch") return refuse("unsupported");
      if (typeof input.on !== "boolean") return refuse("invalid_value");
      return valid(
        { kind: "setSwitch", on: input.on },
        input.on ? "Already on." : "Already off.",
      );
    default:
      return refuse("invalid_value");
  }
}
