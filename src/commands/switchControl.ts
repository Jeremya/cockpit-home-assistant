import { getCapability } from "../core/capabilities";
import type { EntityRecord, HomeSnapshot } from "../core/types";
import type { CommandRecord } from "./types";
import type {
  ProfilePreferences,
  SwitchEnrollment,
} from "../preferences/types";
import { isVisible } from "../core/selectors";

/** Verified identity/capability scope, independent of user authorization. */
export function switchIdentityRestriction(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  mode: "demo" | "homeAssistant" | null,
): string | null {
  if (getCapability(entity, snapshot.config)?.kind !== "switch")
    return "This entity does not declare a switch control.";
  if (entity.disabledInHA || entity.hiddenInHA || entity.entityCategory)
    return "This reading is not enabled for power control.";
  const device = entity.deviceId
    ? snapshot.devices[entity.deviceId]
    : undefined;
  const entries = snapshot.registryEntries.filter(
    (item) =>
      item.id === entity.key &&
      item.entity_id === entity.entityId &&
      item.device_id === device?.id,
  );
  const entry = entries[0];
  if (
    !device?.entityIds.includes(entity.entityId) ||
    device.id !== entity.deviceId ||
    !entry ||
    entries.length !== 1 ||
    snapshot.registryEntries.filter((item) => item.id === entity.key).length !==
      1 ||
    snapshot.entities[entity.entityId] !== entity ||
    Object.values(snapshot.entities).filter((e) => e.key === entity.key)
      .length !== 1 ||
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
  return null;
}

export function switchBinding(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  profileId: string,
): SwitchEnrollment {
  const device = snapshot.devices[entity.deviceId!]!;
  return {
    profileId,
    entityKey: entity.key,
    deviceId: device.id,
    platform: "tplink",
    manufacturer: "TP-Link",
    model: device.model!,
    capability: "switch",
  };
}
export function sameSwitchBinding(
  a: SwitchEnrollment | undefined,
  b: SwitchEnrollment,
): boolean {
  return (
    !!a &&
    a.profileId === b.profileId &&
    a.entityKey === b.entityKey &&
    a.deviceId === b.deviceId &&
    a.platform === b.platform &&
    a.manufacturer === b.manufacturer &&
    a.model === b.model &&
    a.capability === b.capability
  );
}
export interface SwitchAuthorization {
  profileId: string;
  preferences: ProfilePreferences;
}
/** The same rule is used by UI and by the manager immediately before dispatch. */
export function switchControlRestriction(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  mode: "demo" | "homeAssistant" | null,
  authorization?: SwitchAuthorization,
): string | null {
  const identity = switchIdentityRestriction(entity, snapshot, mode);
  if (identity || mode === "demo") return identity;
  return authorization &&
    sameSwitchBinding(
      Object.hasOwn(authorization.preferences.switchEnrollments, entity.key)
        ? authorization.preferences.switchEnrollments[entity.key]
        : undefined,
      switchBinding(entity, snapshot, authorization.profileId),
    )
    ? null
    : "Allow power control for this device in this home first.";
}
/** Ambiguous primary actuators stay in the individual readings list. */
export function primarySwitch(
  deviceId: string | null,
  snapshot: HomeSnapshot,
  preferences: ProfilePreferences,
  mode: "demo" | "homeAssistant" | null,
): EntityRecord | null {
  const main = Object.values(snapshot.entities).filter(
    (e) =>
      deviceId &&
      e.deviceId === deviceId &&
      e.domain === "switch" &&
      !e.entityCategory &&
      !e.disabledInHA &&
      !e.hiddenInHA,
  );
  const entity = main.length === 1 ? main[0]! : null;
  if (!entity || !isVisible(entity, preferences)) return null;
  // Keep the primary path visible when metadata is temporarily stale; controls
  // still explain and enforce that restriction. Never choose an unverified model.
  const device = snapshot.devices[deviceId!];
  if (mode === "demo")
    return entity.key === "demo-switch.living_lamp" && deviceId === "demo-plug"
      ? entity
      : null;
  return mode === "homeAssistant" &&
    device?.manufacturer === "TP-Link" &&
    /^HS103(?:\(US\))?$/i.test(device.model ?? "")
    ? entity
    : null;
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
