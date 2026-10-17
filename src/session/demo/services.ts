import type { CommandIntent, DesiredIntent } from "../../commands/types";
import type { ServiceCall } from "../types";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const keys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Reflect.ownKeys(value).every(
    (key) => typeof key === "string" && allowed.includes(key),
  );

/** Closed descriptor decoder. No service forwarding, raw JSON execution or logging. */
export function decodeDemoCall(
  input: ServiceCall,
): { entityId: string; intent: CommandIntent } | undefined {
  if (
    !record(input) ||
    !keys(input, ["domain", "service", "entityId", "data"]) ||
    typeof input.domain !== "string" ||
    typeof input.service !== "string" ||
    typeof input.entityId !== "string" ||
    !input.entityId.startsWith(`${input.domain}.`)
  )
    return;
  const data = input.data === undefined ? {} : input.data;
  if (!record(data)) return;
  const allowed = (...fields: string[]) => keys(data, fields);
  let intent: CommandIntent;
  switch (`${input.domain}.${input.service}`) {
    case "lock.lock":
    case "lock.unlock":
    case "lock.open":
      if (
        !allowed("code") ||
        (data.code !== undefined &&
          (typeof data.code !== "string" || !data.code.trim()))
      )
        return;
      // Validate the optional code, then immediately discard it.
      intent = {
        kind: "setLockState",
        state:
          input.service === "lock"
            ? "locked"
            : input.service === "unlock"
              ? "unlocked"
              : "open",
      };
      break;
    case "climate.set_temperature":
      if (allowed("temperature") && Object.hasOwn(data, "temperature"))
        intent = {
          kind: "setClimateTarget",
          target: { temperature: data.temperature as number },
        };
      else if (
        allowed("target_temp_low", "target_temp_high") &&
        Object.hasOwn(data, "target_temp_low") &&
        Object.hasOwn(data, "target_temp_high")
      )
        intent = {
          kind: "setClimateTarget",
          target: {
            low: data.target_temp_low as number,
            high: data.target_temp_high as number,
          },
        };
      else return;
      break;
    case "climate.set_hvac_mode":
      if (!allowed("hvac_mode")) return;
      intent = { kind: "setHvacMode", mode: data.hvac_mode as string };
      break;
    case "fan.turn_on":
    case "fan.turn_off":
      if (!allowed()) return;
      intent = { kind: "setFanOn", on: input.service === "turn_on" };
      break;
    case "fan.set_percentage":
      if (!allowed("percentage")) return;
      intent = {
        kind: "setFanPercentage",
        percentage: data.percentage as number,
      };
      break;
    case "fan.set_preset_mode":
      if (!allowed("preset_mode")) return;
      intent = { kind: "setFanPreset", preset: data.preset_mode as string };
      break;
    case "switch.turn_on":
    case "switch.turn_off":
      if (!allowed()) return;
      intent = { kind: "setSwitch", on: input.service === "turn_on" };
      break;
    default:
      return;
  }
  return { entityId: input.entityId, intent };
}

/** Only fields needed for the simulated effect; never includes credentials. */
export function demoEffect(intent: DesiredIntent): {
  state?: string;
  attributes?: Record<string, unknown>;
} {
  switch (intent.kind) {
    case "setLockState":
      return { state: intent.state === "open" ? "opening" : intent.state };
    case "setClimateTarget":
      return {
        attributes:
          intent.target.temperature !== undefined
            ? { temperature: intent.target.temperature }
            : {
                target_temp_low: intent.target.low,
                target_temp_high: intent.target.high,
              },
      };
    case "setHvacMode":
      return { state: intent.mode };
    case "setFanOn":
    case "setSwitch":
      return { state: intent.on ? "on" : "off" };
    case "setFanPercentage":
      return {
        state: intent.percentage === 0 ? "off" : "on",
        attributes: { percentage: intent.percentage },
      };
    case "setFanPreset":
      return { attributes: { preset_mode: intent.preset } };
  }
}
