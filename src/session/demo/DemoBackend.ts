import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { desiredIntent } from "../../commands/predicates";
import type { DesiredIntent } from "../../commands/types";
import { validateIntent } from "../../commands/validation";
import {
  BackendEvents,
  type HomeBackend,
  type ServiceCall,
  type ServiceCallResult,
} from "../types";
import { mapSnapshot } from "../homeAssistant/mapSnapshot";
import type { RawEntity } from "../homeAssistant/entityStream";
import { createDemoFixtures } from "./fixtures";
import { decodeDemoCall, demoEffect } from "./services";

export interface DemoClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export interface DemoScenario {
  readonly acknowledgement:
    "accepted" | "rejected" | "timeout" | "connection_lost";
  readonly acknowledgementAfterMs: number;
  /** null means no simulated effect, independently of acknowledgement. */
  readonly observationAfterMs: number | null;
}
export interface DemoOptions {
  clock?: DemoClock;
  /** Programmatic acceptance fixtures only. Receives a copied, code-free intent. */
  scenario?: (
    request: Readonly<{
      entityId: string;
      intent: DesiredIntent;
      sequence: number;
    }>,
  ) => DemoScenario;
  /** Override existing simulated states/capabilities, never identities. */
  initialState?: Readonly<
    Record<
      string,
      {
        state?: string;
        attributes?: Readonly<Record<string, unknown>>;
      }
    >
  >;
}
const defaultClock: DemoClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};
const normal: DemoScenario = {
  acknowledgement: "accepted",
  acknowledgementAfterMs: 120,
  observationAfterMs: 450,
};
const rejected: ServiceCallResult = {
  kind: "rejected",
  message: "This simulated service is unavailable or unsupported.",
};

/** Entirely offline. Acknowledgements and observed effects use separate timers. */
export class DemoBackend extends BackendEvents implements HomeBackend {
  private readonly clock: DemoClock;
  private readonly fixtures: ReturnType<typeof createDemoFixtures>;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly pending = new Set<(result: ServiceCallResult) => void>();
  private entities: Record<string, EntityRecord> = {};
  private running = false;
  private stopped = false;
  private foreground = true;
  private periodic?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private tick = 0;
  private sequence = 0;
  constructor(
    private sessionId: string,
    private options: DemoOptions = {},
  ) {
    super();
    this.clock = options.clock ?? defaultClock;
    this.fixtures = createDemoFixtures(this.clock.now());
    for (const [id, patch] of Object.entries(options.initialState ?? {})) {
      const entity = this.fixtures.raw[id];
      if (entity)
        this.fixtures.raw[id] = {
          ...entity,
          state: patch.state ?? entity.state,
          attributes: { ...entity.attributes, ...patch.attributes },
        };
    }
    this.options = { scenario: options.scenario };
  }
  async start() {
    if (this.running || this.stopped) return;
    this.running = true;
    await this.resync();
    this.schedulePeriodic();
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.running = false;
    for (const timer of this.timers) this.clock.clearTimeout(timer);
    this.timers.clear();
    this.periodic = undefined;
    for (const settle of this.pending)
      settle({ kind: "unknown", reason: "connection_lost" });
    this.pending.clear();
    this.emitStatus({ kind: "idle" });
  }
  async resync() {
    if (!this.running) return;
    this.emitStatus({ kind: "synchronizing" });
    this.epoch++;
    this.publish();
    if (this.running)
      this.emitStatus({
        kind: "ready",
        haVersion: "Demo",
        readySince: this.timestamp(),
      });
  }
  async ping() {
    return this.running;
  }
  recover() {
    void this.resync();
  }
  async setForeground(active: boolean) {
    this.foreground = active;
    if (this.periodic !== undefined) {
      this.clock.clearTimeout(this.periodic);
      this.timers.delete(this.periodic);
      this.periodic = undefined;
    }
    if (active && this.running) {
      await this.resync();
      this.schedulePeriodic();
    }
  }
  callService(call: ServiceCall): Promise<ServiceCallResult> {
    if (!this.running || !this.foreground || this.status.kind !== "ready")
      return Promise.resolve(rejected);
    const decoded = decodeDemoCall(call);
    const entity = decoded && this.entities[decoded.entityId];
    if (!decoded || !entity) return Promise.resolve(rejected);
    const validated = validateIntent(
      decoded.intent,
      entity,
      this.fixtures.metadata.config,
      true,
    );
    if (validated.kind === "refused") return Promise.resolve(rejected);
    // The facade normally filters no-ops. Copy explicitly, stripping lock codes.
    const intent = desiredIntent(
      validated.kind === "valid" ? validated.intent : decoded.intent,
    );
    const entityId = entity.entityId;
    let scenario: DemoScenario;
    try {
      scenario = {
        ...(this.options.scenario?.(
          Object.freeze({
            entityId,
            intent,
            sequence: ++this.sequence,
          }),
        ) ?? normal),
      };
      const delay = (ms: number) =>
        Number.isFinite(ms) && ms >= 0 && ms <= 600_000;
      if (
        !delay(scenario.acknowledgementAfterMs) ||
        (scenario.observationAfterMs !== null &&
          !delay(scenario.observationAfterMs)) ||
        !["accepted", "rejected", "timeout", "connection_lost"].includes(
          scenario.acknowledgement,
        )
      )
        return Promise.resolve(rejected);
    } catch {
      return Promise.resolve(rejected);
    }
    if (!this.running || !this.foreground || this.status.kind !== "ready")
      return Promise.resolve(rejected);
    return this.simulate(entityId, intent, scenario);
  }
  /** Timer closures are created in a scope that has never held a raw service or PIN. */
  private simulate(
    entityId: string,
    intent: DesiredIntent,
    scenario: DemoScenario,
  ): Promise<ServiceCallResult> {
    if (scenario.observationAfterMs !== null)
      this.schedule(
        () => this.observeEffect(entityId, intent),
        scenario.observationAfterMs,
      );
    return new Promise((resolve) => {
      const settle = (result: ServiceCallResult) => {
        this.pending.delete(settle);
        resolve(result);
      };
      this.pending.add(settle);
      this.schedule(
        () =>
          settle(
            scenario.acknowledgement === "accepted"
              ? { kind: "accepted" }
              : scenario.acknowledgement === "rejected"
                ? {
                    kind: "rejected",
                    message: "The simulated device rejected this request.",
                  }
                : { kind: "unknown", reason: scenario.acknowledgement },
          ),
        scenario.acknowledgementAfterMs,
      );
    });
  }
  getCameraImageRequest() {
    return { uri: "", headers: {} };
  }
  private timestamp() {
    return new Date(this.clock.now()).toISOString();
  }
  private schedule(callback: () => void, delay: number) {
    const timer = this.clock.setTimeout(() => {
      this.timers.delete(timer);
      if (this.running) callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }
  private schedulePeriodic() {
    if (!this.running || !this.foreground || this.periodic !== undefined)
      return;
    this.periodic = this.schedule(() => {
      this.periodic = undefined;
      this.tick++;
      this.patch("climate.downstairs", {
        attributes: { current_temperature: 72 + (this.tick % 3) * 0.2 },
      });
      this.publish();
      this.schedulePeriodic();
    }, 12_000);
  }
  private patch(
    entityId: string,
    effect: { state?: string; attributes?: Record<string, unknown> },
  ) {
    const previous = this.fixtures.raw[entityId]!;
    const state = effect.state ?? previous.state;
    const next: RawEntity = {
      ...previous,
      state,
      attributes: { ...previous.attributes, ...effect.attributes },
      last_changed:
        state === previous.state ? previous.last_changed : this.timestamp(),
      last_updated: this.timestamp(),
    };
    this.fixtures.raw[entityId] = next;
    return next;
  }
  private observeEffect(entityId: string, intent: DesiredIntent) {
    const next = this.patch(entityId, demoEffect(intent));
    // Open is transient. A newer lock effect must not be undone by this timer.
    if (intent.kind === "setLockState" && intent.state === "open")
      this.schedule(() => {
        if (this.fixtures.raw[entityId] !== next) return;
        this.patch(entityId, { state: "unlocked" });
        this.publish();
      }, 900);
    this.publish();
  }
  private publish() {
    if (!this.running) return;
    const now = this.timestamp();
    const { raw, metadata } = this.fixtures;
    const mapped = mapSnapshot(
      raw,
      metadata.registryEntries,
      true,
      undefined,
      this.entities,
    );
    this.entities = mapped.entities;
    const snapshot: HomeSnapshot = {
      ...metadata,
      ...mapped,
      sessionId: this.sessionId,
      syncEpoch: this.epoch,
      receivedAt: now,
      metadata: {
        entities: { kind: "fresh", loadedAt: now },
        devices: { kind: "fresh", loadedAt: now },
        areas: { kind: "fresh", loadedAt: now },
      },
    };
    this.emitSnapshot(snapshot);
  }
}
