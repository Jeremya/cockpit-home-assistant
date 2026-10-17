import type {
  EntityRecord,
  HomeConfig,
  HomeSnapshot,
  SessionStatus,
} from "../core/types";
import type { ServiceCallResult } from "../session/types";
import {
  COMMAND_DEADLINES_MS,
  COMMAND_LATE_WINDOW_MS,
  COMMAND_MAX_RECORDS,
} from "../constants/config";
import { desiredState, satisfiesDesired } from "./predicates";
import { ObservationRevisions } from "./observations";
import { createCommandStore } from "./store";
import { refuse } from "./validation";
import type {
  CommandIntent,
  CommandRecord,
  CommandRefusal,
  UnconfirmedReason,
} from "./types";

interface Evidence {
  revision: number;
  assumed: boolean;
  reconciled: boolean;
}
interface Entry {
  record: CommandRecord;
  acknowledgement: "pending" | ServiceCallResult["kind"];
  latest: boolean;
  identityValid: boolean;
  lostConnection: boolean;
  match?: Evidence;
  outcomeRevision?: number;
}
interface TrackerOptions {
  now?: () => number;
  maxRecords?: number;
}
const terminal = (record: CommandRecord) =>
  ["confirmed", "failed", "superseded"].includes(record.status);
function actionLabel(intent: CommandIntent, name: string) {
  switch (intent.kind) {
    case "setLockState":
      return `${intent.state === "locked" ? "Lock" : intent.state === "unlocked" ? "Unlock" : "Open"} ${name}`;
    case "setClimateTarget":
      return `Set target for ${name}`;
    case "setHvacMode":
      return `Set HVAC mode for ${name}`;
    case "setFanOn":
    case "setSwitch":
      return `Turn ${intent.on ? "on" : "off"} ${name}`;
    case "setFanPercentage":
      return `Set speed for ${name}`;
    case "setFanPreset":
      return `Set preset for ${name}`;
  }
}

/** Owns observations/outcomes only: never a transport, service payload or retry. */
export class CommandTracker {
  private state = createCommandStore();
  readonly store = this.state.readonly;
  private observations = new ObservationRevisions();
  private entries = new Map<string, Entry>();
  private profileId?: string;
  private scopeId?: string;
  private snapshot?: HomeSnapshot;
  private status: SessionStatus = { kind: "idle" };
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private now: () => number;
  private maxRecords: number;
  constructor(options: TrackerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxRecords = Math.max(
      1,
      Math.floor(options.maxRecords ?? COMMAND_MAX_RECORDS),
    );
  }
  start(profileId: string, scopeId: string) {
    // Same-origin Retry can reconcile an old sent outcome with a fresh reading,
    // while its obsolete service callback remains bound to the old scope.
    this.end(profileId !== this.profileId);
    this.observations.reset();
    this.snapshot = undefined;
    this.profileId = profileId;
    this.scopeId = scopeId;
    this.status = { kind: "connecting" };
    this.publish();
  }
  /** Intentional disconnect retains qualified cached outcomes; Forget/profile switch clears them. */
  end(clear: boolean) {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.reconcile();
    if (clear) {
      this.entries.clear();
      this.observations.reset();
      this.snapshot = undefined;
      this.profileId = undefined;
    } else {
      for (const entry of this.entries.values()) {
        if (!terminal(entry.record)) {
          entry.lostConnection = true;
          entry.match = undefined;
        }
        this.unconfirm(entry, "connection_lost");
      }
    }
    this.scopeId = undefined;
    this.status = { kind: "idle" };
    this.publish();
  }
  begin(
    entity: EntityRecord,
    intent: CommandIntent,
    config: HomeConfig,
  ): { kind: "tracked"; commandId: string } | CommandRefusal {
    this.reconcile();
    const observation = this.observations.get(entity.key);
    if (
      !this.profileId ||
      !this.scopeId ||
      !this.snapshot ||
      this.status.kind !== "ready" ||
      observation?.entity.entityId !== entity.entityId
    ) {
      this.publish();
      this.schedule();
      return refuse("not_ready");
    }
    const canonical = this.observations.key(entity.key);
    if (this.entries.size >= this.maxRecords) {
      const evict = [...this.entries].find(
        ([, entry]) =>
          this.observations.key(entry.record.entityKey) === canonical ||
          this.evictable(entry),
      );
      if (!evict) {
        this.publish();
        this.schedule();
        return refuse("tracking_capacity");
      }
      this.entries.delete(evict[0]);
    }
    for (const entry of this.entries.values()) {
      if (
        this.observations.key(entry.record.entityKey) !== canonical ||
        !entry.latest
      )
        continue;
      entry.latest = false;
      if (!terminal(entry.record))
        this.update(entry, { status: "superseded", dismissed: true });
    }
    const issuedAt = this.now();
    const domain = entity.domain as keyof typeof COMMAND_DEADLINES_MS;
    const id = `${this.scopeId}:${++this.sequence}`;
    const record: CommandRecord = Object.freeze({
      id,
      profileId: this.profileId,
      scopeId: this.scopeId,
      sessionId: this.snapshot.sessionId,
      entityKey: entity.key,
      entityId: entity.entityId,
      label: actionLabel(intent, entity.name),
      issuedAt: new Date(issuedAt).toISOString(),
      deadline: new Date(issuedAt + COMMAND_DEADLINES_MS[domain]).toISOString(),
      baselineRevision: observation.revision,
      desired: desiredState(intent, entity, config),
      status: "sending",
      dismissed: false,
    });
    this.entries.set(id, {
      record,
      acknowledgement: "pending",
      latest: true,
      identityValid: true,
      lostConnection: false,
    });
    this.publish();
    this.schedule();
    return { kind: "tracked", commandId: id };
  }
  observe(snapshot: HomeSnapshot) {
    if (!this.scopeId) return;
    this.reconcile();
    if (!this.observations.observe(snapshot)) {
      this.publish();
      this.schedule();
      return;
    }
    this.snapshot = snapshot;
    for (const entry of this.entries.values()) {
      if (
        !entry.latest ||
        entry.record.status === "superseded" ||
        entry.record.status === "confirmed"
      )
        continue;
      const observation = this.observations.get(entry.record.entityKey);
      if (
        !observation ||
        observation.entity.entityId !== entry.record.entityId ||
        (snapshot.sessionId !== entry.record.sessionId &&
          entry.record.scopeId === this.scopeId)
      ) {
        entry.identityValid = false;
        entry.match = undefined;
        this.unconfirm(entry, "entity_changed");
        continue;
      }
      if (
        !entry.identityValid ||
        observation.revision <= entry.record.baselineRevision
      )
        continue;
      const satisfies = satisfiesDesired(
        entry.record.desired,
        observation.entity,
        snapshot.config,
      );
      // Reconciliation wording describes what HA now shows. A contradictory
      // later reading during sync invalidates that evidence. Open/opening is
      // intentionally a transient event, whose occurrence must be retained.
      const intent = entry.record.desired.intent;
      if (
        !satisfies &&
        entry.match?.reconciled &&
        !(intent.kind === "setLockState" && intent.state === "open")
      )
        entry.match = undefined;
      if (entry.record.status === "failed") {
        if (observation.revision > (entry.outcomeRevision ?? Infinity))
          this.update(entry, { dismissed: true });
        continue;
      }
      if (
        satisfies &&
        this.withinWindow(entry) &&
        (entry.record.status !== "unconfirmed" ||
          observation.revision > (entry.record.unconfirmedRevision ?? Infinity))
      ) {
        entry.match = {
          revision: observation.revision,
          assumed: observation.entity.attributes.assumed_state === true,
          reconciled:
            entry.lostConnection || entry.record.status === "unconfirmed",
        };
        this.confirm(entry);
      } else if (
        entry.record.status === "unconfirmed" &&
        observation.revision > (entry.record.unconfirmedRevision ?? Infinity)
      ) {
        this.update(entry, { dismissed: true });
      }
    }
    this.publish();
    this.schedule();
  }
  onStatus(status: SessionStatus) {
    if (!this.scopeId) return;
    this.reconcile();
    this.status = status;
    if (["reconnecting", "error", "idle"].includes(status.kind)) {
      for (const entry of this.entries.values()) {
        if (!entry.latest || terminal(entry.record)) continue;
        entry.lostConnection = true;
        entry.match = undefined;
        this.unconfirm(entry, "connection_lost");
      }
    } else if (status.kind === "ready") {
      // synchronize() publishes the new snapshot before emitting ready.
      for (const entry of this.entries.values()) this.confirm(entry);
    }
    this.publish();
    this.schedule();
  }
  acknowledge(id: string, scopeId: string, result: ServiceCallResult) {
    if (!this.scopeId || scopeId !== this.scopeId) return;
    this.reconcile();
    const entry = this.entries.get(id);
    if (
      !entry ||
      !entry.latest ||
      entry.record.scopeId !== scopeId ||
      terminal(entry.record) ||
      entry.acknowledgement !== "pending"
    ) {
      this.publish();
      this.schedule();
      return;
    }
    entry.acknowledgement = result.kind;
    if (result.kind === "rejected") {
      entry.outcomeRevision =
        this.observations.get(entry.record.entityKey)?.revision ??
        entry.record.baselineRevision;
      this.update(entry, {
        status: "failed",
        error: "Home Assistant reported an error.",
        unconfirmedReason: undefined,
      });
    } else if (result.kind === "unknown") {
      if (
        entry.match &&
        entry.match.revision <= (entry.record.unconfirmedRevision ?? Infinity)
      )
        entry.match = undefined;
      this.unconfirm(entry, result.reason);
    } else {
      if (entry.record.status === "sending")
        this.update(entry, { status: "accepted" });
      this.confirm(entry);
    }
    this.publish();
    this.schedule();
  }
  /** Reconcile absolute deadlines before foreground recovery; timers may have been suspended. */
  reconcileDeadlines() {
    this.reconcile();
    this.publish();
    this.schedule();
  }
  dismiss(id: string): boolean {
    this.reconcile();
    const entry = this.entries.get(id);
    if (
      !entry ||
      !["unconfirmed", "failed", "confirmed"].includes(entry.record.status)
    ) {
      this.publish();
      this.schedule();
      return false;
    }
    this.update(entry, { dismissed: true });
    this.publish();
    this.schedule();
    return true;
  }
  latest(key: string) {
    return [...this.entries.values()].findLast(
      (entry) =>
        entry.latest &&
        this.observations.key(entry.record.entityKey) ===
          this.observations.key(key),
    )?.record;
  }
  /** A newer continuous intent hides old target outcomes before its debounce. */
  supersede(key: string) {
    for (const entry of this.entries.values()) {
      if (
        !entry.latest ||
        this.observations.key(entry.record.entityKey) !==
          this.observations.key(key)
      )
        continue;
      entry.latest = false;
      this.update(entry, {
        dismissed: true,
        ...(!terminal(entry.record) ? { status: "superseded" as const } : {}),
      });
    }
    this.publish();
    this.schedule();
  }
  /** Undo registration if a synchronous subscriber invalidates dispatch. */
  cancelUnsent(id: string) {
    const entry = this.entries.get(id);
    if (!entry || entry.acknowledgement !== "pending") return;
    this.entries.delete(id);
    this.publish();
    this.schedule();
  }
  /** Kept independent of visibility/dismissal for C03's lock recovery guard. */
  hasFreshObservation(id: string): boolean {
    const entry = this.entries.get(id);
    const observed = entry && this.observations.get(entry.record.entityKey);
    return (
      !!entry &&
      entry.identityValid &&
      !!observed &&
      observed.entity.entityId === entry.record.entityId &&
      observed.revision > (entry.record.unconfirmedRevision ?? Infinity)
    );
  }
  private update(entry: Entry, patch: Partial<CommandRecord>) {
    if (
      Object.entries(patch).every(([key, value]) =>
        Object.is(entry.record[key as keyof CommandRecord], value),
      )
    )
      return;
    entry.record = Object.freeze({ ...entry.record, ...patch });
  }
  private unconfirm(entry: Entry, reason: UnconfirmedReason) {
    if (!entry.latest || !["sending", "accepted"].includes(entry.record.status))
      return;
    if (reason !== "deadline") entry.match = undefined;
    this.update(entry, {
      status: "unconfirmed",
      unconfirmedReason: reason,
      unconfirmedRevision:
        this.observations.get(entry.record.entityKey)?.revision ??
        entry.record.baselineRevision,
    });
  }
  private withinWindow(entry: Entry) {
    return (
      this.now() < Date.parse(entry.record.deadline) + COMMAND_LATE_WINDOW_MS
    );
  }
  private confirm(entry: Entry) {
    if (
      !entry.latest ||
      !entry.identityValid ||
      terminal(entry.record) ||
      !entry.match ||
      this.status.kind !== "ready" ||
      !this.withinWindow(entry)
    )
      return;
    if (
      entry.record.status === "sending" ||
      (entry.record.status === "unconfirmed" &&
        entry.acknowledgement === "pending" &&
        entry.match.revision <= (entry.record.unconfirmedRevision ?? Infinity))
    )
      return;
    this.update(entry, {
      status: "confirmed",
      error: undefined,
      unconfirmedReason: undefined,
      confirmation: Object.freeze({
        kind: entry.match.reconciled ? "reconciled" : "observed",
        assumed: entry.match.assumed,
      }),
    });
  }
  private reconcile() {
    const now = this.now();
    for (const entry of this.entries.values())
      if (now >= Date.parse(entry.record.deadline))
        this.unconfirm(entry, "deadline");
  }
  private evictable(entry: Entry) {
    return (
      terminal(entry.record) ||
      (entry.record.status === "unconfirmed" &&
        !this.withinWindow(entry) &&
        (entry.record.desired.intent.kind !== "setLockState" ||
          this.hasFreshObservation(entry.record.id)))
    );
  }
  private publish() {
    const records = [...this.entries.values()].map((entry) => entry.record);
    const current = this.store.getState();
    if (
      current.profileId === (this.profileId ?? null) &&
      current.scopeId === (this.scopeId ?? null) &&
      current.records.length === records.length &&
      current.records.every((record, index) => record === records[index])
    )
      return;
    this.state.writable.setState({
      profileId: this.profileId ?? null,
      scopeId: this.scopeId ?? null,
      records: Object.freeze(records),
    });
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.scopeId) return;
    const deadlines = [...this.entries.values()]
      .filter(
        (entry) =>
          entry.latest && ["sending", "accepted"].includes(entry.record.status),
      )
      .map((entry) => Date.parse(entry.record.deadline));
    if (deadlines.length)
      this.timer = setTimeout(
        () => this.reconcileDeadlines(),
        Math.max(0, Math.min(...deadlines) - this.now()),
      );
  }
}
