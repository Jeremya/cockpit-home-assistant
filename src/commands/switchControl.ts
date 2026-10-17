import { getCapability } from "../core/capabilities";
import type { EntityRecord, HomeSnapshot } from "../core/types";
import type { CommandRecord } from "./types";

/** Enable only after the installed-app and authorized physical HS103 check. */
export const KASA_SWITCH_CONTROL_ACCEPTED = false;

/** First-control scope, not a generic promise that every HA switch is safe. */
export function switchControlRestriction(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  mode: "demo" | "homeAssistant" | null,
  hardwareAccepted = KASA_SWITCH_CONTROL_ACCEPTED,
): string | null {
  if (getCapability(entity, snapshot.config)?.kind !== "switch")
    return "This entity does not declare a switch control.";
  if (entity.disabledInHA || entity.hiddenInHA || entity.entityCategory)
    return "This reading is not enabled for power control.";
  const device = entity.deviceId
    ? snapshot.devices[entity.deviceId]
    : undefined;
  const entry = snapshot.registryEntries.find(
    (item) =>
      item.id === entity.key &&
      item.entity_id === entity.entityId &&
      item.device_id === device?.id,
  );
  if (
    !device?.entityIds.includes(entity.entityId) ||
    !entry ||
    entry.disabled_by ||
    entry.hidden_by ||
    entry.entity_category
  )
    return "Device identity is not verified for power control.";
  if (mode === "demo")
    return entity.key === "demo-switch.living_lamp" && device.id === "demo-plug"
      ? null
      : "Power control is available for the demo lamp only.";
  if (
    mode !== "homeAssistant" ||
    device.manufacturer !== "TP-Link" ||
    !/^HS103(?:\(US\))?$/i.test(device.model ?? "") ||
    entry.platform !== "tplink"
  )
    return "Power control is not verified for this device.";
  if (
    snapshot.metadata.entities.kind !== "fresh" ||
    snapshot.metadata.devices.kind !== "fresh"
  )
    return "Refresh device metadata before using power control.";
  return hardwareAccepted
    ? null
    : "Kasa power control is pending physical validation.";
}

export const switchCommandBusy = (record?: CommandRecord) =>
  record?.status === "sending" || record?.status === "accepted";

/** No raw backend messages or claim that acknowledgement proves a physical effect. */
export function switchOutcomeText(
  record: CommandRecord,
  demo: boolean,
): string {
  const prefix = demo ? "Simulated request" : "Request";
  switch (record.status) {
    case "sending":
      return `${prefix} is being sent.`;
    case "accepted":
      return `${prefix} accepted. Waiting for the reported state.`;
    case "confirmed":
      return `${demo ? "Simulated state" : "Requested state"} observed ${record.confirmation?.kind === "reconciled" ? "later" : "after the request"}.${record.confirmation?.assumed ? " The report is assumed; check the device." : ""}${record.confirmation?.kind === "reconciled" ? " This does not establish what caused the change." : ""}`;
    case "failed":
      return demo
        ? "Simulated device rejected the request. The simulated state may still change."
        : "Home Assistant reported an error. The device may still have changed; check its state.";
    case "unconfirmed":
      return demo
        ? "Simulated result not confirmed. No automatic retry."
        : "Not confirmed. Check the device or Home Assistant before trying again. No automatic retry.";
    case "superseded":
      return "";
  }
}
