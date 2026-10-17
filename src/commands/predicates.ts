import type { EntityRecord, HomeConfig } from "../core/types";
import { getCapability } from "../core/capabilities";
import type { CommandIntent, DesiredIntent, DesiredState } from "./types";

export function desiredIntent(intent: CommandIntent): DesiredIntent {
  switch (intent.kind) {
    case "setLockState":
      return Object.freeze({ kind: intent.kind, state: intent.state });
    case "setClimateTarget":
      return Object.freeze({
        kind: intent.kind,
        target: Object.freeze(
          intent.target.temperature !== undefined
            ? { temperature: intent.target.temperature }
            : { low: intent.target.low, high: intent.target.high },
        ),
      });
    case "setHvacMode":
      return Object.freeze({ kind: intent.kind, mode: intent.mode });
    case "setFanOn":
      return Object.freeze({ kind: intent.kind, on: intent.on });
    case "setFanPercentage":
      return Object.freeze({
        kind: intent.kind,
        percentage: intent.percentage,
      });
    case "setFanPreset":
      return Object.freeze({ kind: intent.kind, preset: intent.preset });
    case "setSwitch":
      return Object.freeze({ kind: intent.kind, on: intent.on });
  }
}
export function desiredState(
  intent: CommandIntent,
  entity: EntityRecord,
  config: HomeConfig,
): DesiredState {
  const cap = getCapability(entity, config);
  return Object.freeze({
    intent: desiredIntent(intent),
    step:
      intent.kind === "setClimateTarget" && cap?.kind === "climate"
        ? cap.step
        : intent.kind === "setFanPercentage" && cap?.kind === "fan"
          ? (cap.percentage?.step ?? 1)
          : 1,
    ...(intent.kind === "setClimateTarget"
      ? { temperatureUnit: config.temperatureUnit }
      : {}),
  });
}
const close = (value: unknown, target: number, step: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value - target) <= step / 2 + 1e-9;
/** Shared by baseline no-op validation and post-dispatch observation tracking. */
export function satisfiesDesired(
  desired: DesiredState,
  entity: EntityRecord,
  config: HomeConfig,
): boolean {
  if (
    entity.disabledInHA ||
    ["", "unknown", "unavailable"].includes(entity.state.trim())
  )
    return false;
  const intent = desired.intent;
  const a = entity.attributes;
  switch (intent.kind) {
    case "setLockState":
      return (
        entity.domain === "lock" &&
        (entity.state === intent.state ||
          (intent.state === "open" && entity.state === "opening"))
      );
    case "setClimateTarget":
      if (
        entity.domain !== "climate" ||
        desired.temperatureUnit !== config.temperatureUnit
      )
        return false;
      return intent.target.temperature !== undefined
        ? close(a.temperature, intent.target.temperature, desired.step)
        : close(a.target_temp_low, intent.target.low, desired.step) &&
            close(a.target_temp_high, intent.target.high, desired.step);
    case "setHvacMode":
      return entity.domain === "climate" && entity.state === intent.mode;
    case "setFanOn":
      return (
        entity.domain === "fan" && entity.state === (intent.on ? "on" : "off")
      );
    case "setFanPercentage":
      return (
        entity.domain === "fan" &&
        close(a.percentage, intent.percentage, desired.step)
      );
    case "setFanPreset":
      return entity.domain === "fan" && a.preset_mode === intent.preset;
    case "setSwitch":
      return (
        entity.domain === "switch" &&
        entity.state === (intent.on ? "on" : "off")
      );
  }
}
