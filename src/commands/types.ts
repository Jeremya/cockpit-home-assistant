import type { ServiceCallResult } from "../session/types";

export type ClimateTarget =
  | { temperature: number; low?: never; high?: never }
  | { low: number; high: number; temperature?: never };

/** An ephemeral request. Lock codes must never enter a store or command record. */
export type CommandIntent =
  | {
      kind: "setLockState";
      state: "locked" | "unlocked" | "open";
      code?: string;
    }
  | { kind: "setClimateTarget"; target: ClimateTarget }
  | { kind: "setHvacMode"; mode: string }
  | { kind: "setFanOn"; on: boolean }
  | { kind: "setFanPercentage"; percentage: number }
  | { kind: "setFanPreset"; preset: string }
  | { kind: "setSwitch"; on: boolean };

/** Only the manager can issue a usable target; copied/foreign objects are refused. */
export interface CommandTarget {
  readonly profileId: string;
  readonly entityKey: string;
  readonly entityId: string;
  readonly sessionId: string;
}
export type CommandReference = string | CommandTarget;
export type RefusalReason =
  | "not_ready"
  | "background"
  | "session_changed"
  | "entity_changed"
  | "entity_missing"
  | "unavailable"
  | "disabled"
  | "unsupported"
  | "invalid_value"
  | "invalid_capability"
  | "tracking_capacity"
  | "in_flight"
  | "fresh_observation_required"
  | "capability_changed"
  | "not_authorized"
  | "dispatch_failed";
export interface CommandRefusal {
  kind: "refused";
  reason: RefusalReason;
  message: string;
}
export type CaptureResult =
  { kind: "captured"; target: CommandTarget } | CommandRefusal;
export type DispatchResult =
  | CommandRefusal
  | { kind: "no-op"; message: string }
  | {
      kind: "started";
      target: CommandTarget;
      commandId: string;
      /** HA acknowledgement only; this does not confirm a physical effect. */
      result: Promise<ServiceCallResult>;
    };
export type CancellationReason =
  "superseded" | "not_ready" | "background" | "session_changed";
export type DeferredResult =
  DispatchResult | { kind: "cancelled"; reason: CancellationReason };
export interface QueuedCommand {
  kind: "queued";
  /** Resolves once to a dispatch decision or cancellation; no service is implied. */
  completion: Promise<DeferredResult>;
}
export type CommandResult = DispatchResult | QueuedCommand;
/** Only these two code-free forms may be retained while unsent. */
export type ContinuousIntent = Extract<
  CommandIntent,
  { kind: "setClimateTarget" | "setFanPercentage" }
>;

export interface CommandFacade {
  /** Capture before showing a dialog; pass its target back after confirmation. */
  capture(key: string): CaptureResult;
  setLockState(
    reference: CommandReference,
    state: "locked" | "unlocked" | "open",
    code?: string,
  ): CommandResult;
  setClimateTarget(
    reference: CommandReference,
    target: ClimateTarget,
  ): CommandResult;
  setHvacMode(reference: CommandReference, mode: string): CommandResult;
  setFanOn(reference: CommandReference, on: boolean): CommandResult;
  setFanPercentage(
    reference: CommandReference,
    percentage: number,
  ): CommandResult;
  setFanPreset(reference: CommandReference, preset: string): CommandResult;
  setSwitch(reference: CommandReference, on: boolean): CommandResult;
}

/** Explicit, code-free projection; never store/spread CommandIntent itself. */
export type DesiredIntent =
  | {
      readonly kind: "setLockState";
      readonly state: "locked" | "unlocked" | "open";
    }
  | {
      readonly kind: "setClimateTarget";
      readonly target: Readonly<ClimateTarget>;
    }
  | { readonly kind: "setHvacMode"; readonly mode: string }
  | { readonly kind: "setFanOn"; readonly on: boolean }
  | { readonly kind: "setFanPercentage"; readonly percentage: number }
  | { readonly kind: "setFanPreset"; readonly preset: string }
  | { readonly kind: "setSwitch"; readonly on: boolean };
export interface DesiredState {
  readonly intent: DesiredIntent;
  /** Captured at dispatch, so a later capability cannot loosen the predicate. */
  readonly step: number;
  readonly temperatureUnit?: "°C" | "°F";
}
export type CommandStatus =
  | "sending"
  | "accepted"
  | "confirmed"
  | "failed"
  | "unconfirmed"
  | "superseded";
export type UnconfirmedReason =
  "timeout" | "connection_lost" | "deadline" | "entity_changed";
export interface CommandRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly profileId: string;
  readonly scopeId: string;
  readonly entityKey: string;
  readonly entityId: string;
  readonly label: string;
  readonly issuedAt: string;
  readonly deadline: string;
  readonly baselineRevision: number;
  readonly desired: DesiredState;
  readonly status: CommandStatus;
  readonly dismissed: boolean;
  readonly error?: string;
  readonly unconfirmedReason?: UnconfirmedReason;
  readonly unconfirmedRevision?: number;
  readonly confirmation?: {
    readonly kind: "observed" | "reconciled";
    readonly assumed: boolean;
  };
}
