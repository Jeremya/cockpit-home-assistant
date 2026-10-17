import type { Condition, EntityRecord } from "./types";

// Product default, not a manufacturer fault threshold. Only valid HA battery %.
export const LOW_BATTERY_PERCENT = 20;
export interface EntityAssessment {
  condition: Condition;
  /** An attention rule was applied to this reading, not to the whole device. */
  ruleApplied: boolean;
  explanation: string;
  binaryLabel?: string;
}
type BinaryRule = {
  on: [Condition, string];
  off: [Condition, string];
  ruleApplied: boolean;
};
// HA device-class semantics: https://www.home-assistant.io/integrations/binary_sensor/
const binaryRules: Record<string, BinaryRule> = {
  battery: {
    on: ["attention", "Low battery"],
    off: ["normal", "Battery not low"],
    ruleApplied: true,
  },
  problem: {
    on: ["attention", "Problem reported"],
    off: ["normal", "No problem reported"],
    ruleApplied: true,
  },
  connectivity: {
    on: ["normal", "Connected"],
    off: ["attention", "Disconnected"],
    ruleApplied: true,
  },
  door: {
    on: ["attention", "Open"],
    off: ["normal", "Closed"],
    ruleApplied: true,
  },
  window: {
    on: ["attention", "Open"],
    off: ["normal", "Closed"],
    ruleApplied: true,
  },
  opening: {
    on: ["attention", "Open"],
    off: ["normal", "Closed"],
    ruleApplied: true,
  },
  garage_door: {
    on: ["attention", "Open"],
    off: ["normal", "Closed"],
    ruleApplied: true,
  },
  lock: {
    on: ["attention", "Unlocked"],
    off: ["normal", "Locked"],
    ruleApplied: true,
  },
  smoke: {
    on: ["alert", "Smoke detected"],
    off: ["normal", "No smoke detected"],
    ruleApplied: true,
  },
  carbon_monoxide: {
    on: ["alert", "Carbon monoxide detected"],
    off: ["normal", "No carbon monoxide detected"],
    ruleApplied: true,
  },
  gas: {
    on: ["alert", "Gas detected"],
    off: ["normal", "No gas detected"],
    ruleApplied: true,
  },
  safety: {
    on: ["alert", "Unsafe reported"],
    off: ["normal", "Safe reported"],
    ruleApplied: true,
  },
  moisture: {
    on: ["attention", "Wet"],
    off: ["normal", "Dry"],
    ruleApplied: true,
  },
  tamper: {
    on: ["attention", "Tampering detected"],
    off: ["normal", "No tampering detected"],
    ruleApplied: true,
  },
  motion: {
    on: ["active", "Detected"],
    off: ["normal", "Clear"],
    ruleApplied: false,
  },
  occupancy: {
    on: ["active", "Detected"],
    off: ["normal", "Clear"],
    ruleApplied: false,
  },
  battery_charging: {
    on: ["active", "Charging"],
    off: ["normal", "Not charging"],
    ruleApplied: false,
  },
};
const readingOnly =
  "No attention rule for this reading. Its value alone does not establish device health.";
function assessment(
  condition: Condition,
  explanation: string,
  ruleApplied = false,
): EntityAssessment {
  return { condition, explanation, ruleApplied };
}
function numericState(state: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(state)) return null;
  const value = Number(state);
  return Number.isFinite(value) ? value : null;
}
/** Observation quality takes precedence; no age heuristic or vendor-name guessing. */
export function assessEntity(
  entity: EntityRecord,
  ready: boolean,
): EntityAssessment {
  if (!ready)
    return assessment(
      "stale",
      "Cached observation. Current status cannot be assessed until synchronization completes.",
    );
  if (entity.state === "unavailable")
    return assessment(
      "unavailable",
      "Home Assistant reports this entity unavailable. Its physical state is not known.",
    );
  if (entity.state === "unknown" || !entity.state.trim())
    return assessment(
      "unknown",
      "Home Assistant has no known value for this reading.",
    );
  if (entity.domain === "lock") {
    if (entity.state === "jammed")
      return assessment("alert", "Lock reports jammed.", true);
    if (["open", "unlocked"].includes(entity.state))
      return assessment("attention", "Lock reports open or unlocked.", true);
    if (["locking", "unlocking", "opening"].includes(entity.state))
      return assessment(
        "active",
        "Lock reports a transition; completion is not confirmed.",
        true,
      );
    return entity.state === "locked"
      ? assessment("normal", "Lock reports locked.", true)
      : assessment(
          "unknown",
          "This lock state has no verified interpretation.",
        );
  }
  if (entity.domain === "binary_sensor") {
    if (entity.state !== "on" && entity.state !== "off")
      return assessment(
        "unknown",
        "Unexpected binary state; its meaning is not assessed.",
      );
    const kind = entity.attributes.device_class;
    const rule =
      typeof kind === "string" && Object.hasOwn(binaryRules, kind)
        ? binaryRules[kind]
        : undefined;
    const [condition, binaryLabel] = rule?.[entity.state] ?? [
      entity.state === "on" ? "active" : "normal",
      entity.state === "on" ? "On" : "Off",
    ];
    return {
      condition,
      binaryLabel,
      ruleApplied: rule?.ruleApplied ?? false,
      explanation: rule?.ruleApplied
        ? `${binaryLabel}, as reported by Home Assistant.`
        : readingOnly,
    };
  }
  if (entity.domain === "sensor") {
    const value = numericState(entity.state);
    if (entity.attributes.device_class === "battery") {
      if (
        entity.attributes.unit_of_measurement !== "%" ||
        value === null ||
        value < 0 ||
        value > 100
      )
        return assessment(
          "unknown",
          "Battery meaning not assessed: expected a percentage from 0 to 100. A vendor-specific state needs verification.",
        );
      return assessment(
        value <= LOW_BATTERY_PERCENT ? "attention" : "normal",
        value <= LOW_BATTERY_PERCENT
          ? `Low battery reported (at or below ${LOW_BATTERY_PERCENT}%).`
          : "Battery percentage reported above the low-battery threshold.",
        true,
      );
    }
    // Textual vendor states are observations, not an unverified adapter.
    // Timestamps/dates are readings, not health rules.
    if (
      entity.attributes.device_class === "enum" ||
      (value === null &&
        !["timestamp", "date"].includes(String(entity.attributes.device_class)))
    )
      return assessment(
        "unknown",
        "Reported value has no verified attention interpretation. Check its meaning in Home Assistant or the device app.",
      );
  }
  if (
    ["switch", "fan"].includes(entity.domain) &&
    !["on", "off"].includes(entity.state)
  )
    return assessment("unknown", "This state has no verified interpretation.");
  return assessment(entity.state === "on" ? "active" : "normal", readingOnly);
}
export function getCondition(entity: EntityRecord, ready: boolean): Condition {
  return assessEntity(entity, ready).condition;
}
export function needsAttention(condition: Condition) {
  return ["attention", "alert", "unknown", "unavailable"].includes(condition);
}
