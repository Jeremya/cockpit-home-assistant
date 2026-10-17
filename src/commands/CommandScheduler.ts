import { COMMAND_DEBOUNCE_MS, COMMAND_MAX_LANES } from "../constants/config";
import { refuse } from "./validation";
import type {
  CancellationReason,
  CommandRefusal,
  CommandTarget,
  ContinuousIntent,
  DeferredResult,
  DispatchResult,
  QueuedCommand,
} from "./types";

interface Pending {
  target: CommandTarget;
  intent: ContinuousIntent;
  readyAt: number;
  requireDispatch: boolean;
  send: (
    target: CommandTarget,
    intent: ContinuousIntent,
    requireDispatch: boolean,
  ) => DispatchResult;
  resolve: (result: DeferredResult) => void;
  timer?: ReturnType<typeof setTimeout>;
}
interface Lane {
  key: string;
  inFlight?: object;
  pending?: Pending;
}
export function isContinuous(intent: {
  kind: string;
}): intent is ContinuousIntent {
  return (
    intent.kind === "setClimateTarget" || intent.kind === "setFanPercentage"
  );
}
/** Explicit projection at the queue boundary: never retain arbitrary input/code. */
function copyIntent(intent: ContinuousIntent): ContinuousIntent {
  return intent.kind === "setFanPercentage"
    ? Object.freeze({ kind: intent.kind, percentage: intent.percentage })
    : Object.freeze({
        kind: intent.kind,
        target: Object.freeze(
          intent.target.temperature !== undefined
            ? { temperature: intent.target.temperature }
            : { low: intent.target.low, high: intent.target.high },
        ),
      });
}
/** Unsent work only. Sent outcomes and recovery remain owned by tracker/backend. */
export class CommandScheduler {
  private lanes = new Set<Lane>();
  constructor(private resolveKey: (key: string) => string = (key) => key) {}
  private lane(key: string) {
    const canonical = this.resolveKey(key);
    return [...this.lanes].find(
      (lane) => this.resolveKey(lane.key) === canonical,
    );
  }
  private obtain(key: string): Lane | CommandRefusal {
    const existing = this.lane(key);
    if (existing) return existing;
    if (this.lanes.size >= COMMAND_MAX_LANES)
      return refuse("tracking_capacity");
    const lane: Lane = { key };
    this.lanes.add(lane);
    return lane;
  }
  isInFlight(key: string) {
    return !!this.lane(key)?.inFlight;
  }
  requiresDispatch(key: string) {
    const lane = this.lane(key);
    return !!lane?.inFlight || !!lane?.pending?.requireDispatch;
  }
  execute(key: string, send: () => DispatchResult): DispatchResult {
    const lane = this.obtain(key);
    if ("kind" in lane) return lane;
    if (lane.inFlight) return refuse("in_flight");
    // Reserve before sending-record subscribers run; reentrant taps are busy too.
    const flight = {};
    lane.inFlight = flight;
    let result: DispatchResult;
    try {
      result = send();
    } catch {
      this.release(lane, flight);
      return refuse("dispatch_failed");
    }
    if (result.kind === "started")
      void result.result.then(
        () => this.release(lane, flight),
        () => this.release(lane, flight),
      );
    else this.release(lane, flight);
    return result;
  }
  enqueue(
    target: CommandTarget,
    intent: ContinuousIntent,
    requireDispatch: boolean,
    send: Pending["send"],
  ): QueuedCommand | CommandRefusal {
    const lane = this.obtain(target.entityKey);
    if ("kind" in lane) return lane;
    const inherited = lane.pending?.requireDispatch ?? false;
    this.cancelPending(lane, "superseded");
    let resolve!: Pending["resolve"];
    const completion = new Promise<DeferredResult>((done) => {
      resolve = done;
    });
    const pending: Pending = {
      target,
      intent: copyIntent(intent),
      readyAt: Date.now() + COMMAND_DEBOUNCE_MS,
      requireDispatch: requireDispatch || inherited || !!lane.inFlight,
      send,
      resolve,
    };
    lane.pending = pending;
    this.arm(lane, pending);
    return { kind: "queued", completion };
  }
  cancel(key: string, reason: CancellationReason) {
    const lane = this.lane(key);
    if (!lane) return;
    this.cancelPending(lane, reason);
    this.clean(lane);
  }
  cancelAll(reason: CancellationReason) {
    for (const lane of this.lanes) {
      this.cancelPending(lane, reason);
      this.clean(lane);
    }
  }
  /** Replacement invalidates old promise releases, including for the same key. */
  reset() {
    this.cancelAll("session_changed");
    this.lanes.clear();
  }
  private cancelPending(lane: Lane, reason: CancellationReason) {
    const pending = lane.pending;
    if (!pending) return;
    lane.pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve({ kind: "cancelled", reason });
  }
  private arm(lane: Lane, pending: Pending) {
    if (!this.lanes.has(lane) || lane.pending !== pending) return;
    clearTimeout(pending.timer);
    if (pending.readyAt > Date.now()) {
      pending.timer = setTimeout(
        () => this.arm(lane, pending),
        pending.readyAt - Date.now(),
      );
      return;
    }
    if (lane.inFlight) return; // The promise release wakes it; no polling timer.
    lane.pending = undefined;
    const result = this.execute(lane.key, () =>
      pending.send(pending.target, pending.intent, pending.requireDispatch),
    );
    pending.resolve(result);
    this.clean(lane);
  }
  private release(lane: Lane, flight: object) {
    if (!this.lanes.has(lane) || lane.inFlight !== flight) return;
    lane.inFlight = undefined;
    if (lane.pending) this.arm(lane, lane.pending);
    this.clean(lane);
  }
  private clean(lane: Lane) {
    if (!lane.inFlight && !lane.pending) this.lanes.delete(lane);
  }
}
