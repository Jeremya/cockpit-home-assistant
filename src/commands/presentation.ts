import type { CommandRecord, DesiredIntent } from "./types";

function targetLabel(intent: DesiredIntent): string {
  switch (intent.kind) {
    case "setLockState":
      return intent.state === "locked"
        ? "Locked"
        : intent.state === "unlocked"
          ? "Unlocked"
          : "Open or opening";
    case "setSwitch":
    case "setFanOn":
      return intent.on ? "On" : "Off";
    case "setClimateTarget":
      return "the requested temperature target";
    case "setHvacMode":
      return "the requested HVAC mode";
    case "setFanPercentage":
      return "the requested fan percentage";
    case "setFanPreset":
      return "the requested fan preset";
  }
}
/** Outcome wording never substitutes for the latest observed device value. */
export function commandMessage(record: CommandRecord): string {
  const intent = record.desired.intent;
  switch (record.status) {
    case "sending":
      return "Sending request…";
    case "accepted":
      return intent.kind === "setLockState" && intent.state === "open"
        ? "Open requested — HA accepted"
        : "Home Assistant accepted the request; waiting for observation.";
    case "confirmed": {
      const qualifier = record.confirmation?.assumed
        ? " (state assumed by the integration)"
        : "";
      if (
        record.confirmation?.kind === "reconciled" &&
        intent.kind === "setLockState" &&
        intent.state === "open"
      )
        return `Home Assistant reported Open or opening${qualifier}.`;
      return record.confirmation?.kind === "reconciled"
        ? `Home Assistant now shows ${targetLabel(intent)}${qualifier}.`
        : `Confirmed${qualifier}.`;
    }
    case "failed":
      return "Home Assistant reported an error. A physical effect may still have occurred.";
    case "unconfirmed":
      return intent.kind === "setLockState" && intent.state !== "locked"
        ? "Request unconfirmed. Check the door; this action will not be retried automatically."
        : "Request unconfirmed. Check the device or its latest observation.";
    case "superseded":
      return "";
  }
}
