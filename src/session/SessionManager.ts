import type {
  ConnectionSettings,
  EntityRecord,
  HomeConfig,
  HomeSnapshot,
} from "../core/types";
import { useCockpit } from "../core/store";
import { Credentials } from "../services/credentials";
import { PreferencesStorage } from "../preferences/storage";
import {
  emptyPreferences,
  reconcilePreferences,
  resolveAlias,
  type ProfilePreferences,
} from "../preferences/types";
import { DemoBackend } from "./demo/DemoBackend";
import { HomeAssistantBackend } from "./homeAssistant/HomeAssistantBackend";
import { profileIdFor, validateSettings } from "./homeAssistant/url";
import { houseForMode } from "../spatial/plans";
import { resetSpatial, seedSpatial } from "../spatial/profilePlan";
import type { HomeBackend } from "./types";
import { createCommandFacade } from "../commands/facade";
import { CommandTracker } from "../commands/CommandTracker";
import { CommandScheduler, isContinuous } from "../commands/CommandScheduler";
import { refuse, validateIntent } from "../commands/validation";
import { toServiceCall } from "../commands/serviceCalls";
import type {
  CaptureResult,
  CommandIntent,
  CommandReference,
  CommandResult,
  CommandTarget,
  CommandRefusal,
  DispatchResult,
  CancellationReason,
} from "../commands/types";

interface EligibleCommand {
  kind: "eligible";
  target: CommandTarget;
  backend: HomeBackend;
  entity: EntityRecord;
  config: HomeConfig;
}
export class SessionManager {
  private backend?: HomeBackend;
  private generation = 0;
  private listeners: (() => void)[] = [];
  private foreground = true;
  private boot?: Promise<void>;
  private attempt?: ConnectionSettings | { demo: true };
  private savedSettings?: ConnectionSettings;
  private commandEligibility = 0;
  private commandReady = false;
  private commandSnapshot?: HomeSnapshot;
  private commandTracker = new CommandTracker();
  private commandScheduler = new CommandScheduler((key) =>
    resolveAlias(key, this.commandSnapshot?.identities.aliases ?? {}),
  );
  readonly commandStore = this.commandTracker.store;
  private commandTargets = new WeakMap<
    CommandTarget,
    {
      generation: number;
      backend: HomeBackend;
      eligibility: number;
      temperatureUnit: HomeConfig["temperatureUnit"];
    }
  >();
  readonly commands = createCommandFacade(
    (key) => this.captureCommandTarget(key),
    (reference, intent) => this.dispatchCommand(reference, intent),
  );
  constructor(
    private credentials: Credentials,
    private preferences: PreferencesStorage,
  ) {}
  private captureCommandTarget(key: string): CaptureResult {
    const { profileId, status } = useCockpit.getState();
    const snapshot = this.commandSnapshot;
    if (!this.foreground) return refuse("background");
    if (
      !this.commandReady ||
      !this.backend ||
      !profileId ||
      !snapshot ||
      status.kind !== "ready"
    )
      return refuse("not_ready");
    if (typeof key !== "string" || !key) return refuse("entity_missing");
    const entityKey = resolveAlias(key, snapshot.identities.aliases);
    const matches = Object.values(snapshot.entities).filter(
      (entity) => entity.key === entityKey,
    );
    if (matches.length !== 1) return refuse("entity_missing");
    const target = Object.freeze({
      profileId,
      entityKey,
      entityId: matches[0]!.entityId,
      sessionId: snapshot.sessionId,
    });
    this.commandTargets.set(target, {
      generation: this.generation,
      backend: this.backend,
      eligibility: this.commandEligibility,
      temperatureUnit: snapshot.config.temperatureUnit,
    });
    return { kind: "captured", target };
  }
  private resolveCommand(
    reference: CommandReference,
  ): EligibleCommand | CommandRefusal {
    const captured =
      typeof reference === "string"
        ? this.captureCommandTarget(reference)
        : { kind: "captured" as const, target: reference };
    if (captured.kind === "refused") return captured;
    const target = captured.target;
    const owner = target && this.commandTargets.get(target);
    const backend = this.backend;
    const state = useCockpit.getState();
    const snapshot = this.commandSnapshot;
    if (
      !owner ||
      owner.generation !== this.generation ||
      owner.backend !== backend ||
      target.profileId !== state.profileId
    )
      return refuse("session_changed");
    if (!this.foreground) return refuse("background");
    if (
      !this.commandReady ||
      !backend ||
      state.status.kind !== "ready" ||
      !snapshot
    )
      return refuse("not_ready");
    if (target.sessionId !== snapshot.sessionId)
      return refuse("session_changed");
    const key = resolveAlias(target.entityKey, snapshot.identities.aliases);
    const matches = Object.values(snapshot.entities).filter(
      (entity) => entity.key === key,
    );
    if (matches.length === 0) return refuse("entity_missing");
    const entity = matches[0]!;
    if (
      matches.length !== 1 ||
      entity.entityId !== target.entityId ||
      snapshot.entities[target.entityId] !== entity ||
      !entity.entityId.startsWith(`${entity.domain}.`)
    )
      return refuse("entity_changed");
    if (owner.eligibility !== this.commandEligibility)
      return refuse("session_changed");
    return {
      kind: "eligible",
      target,
      backend,
      entity,
      config: snapshot.config,
    };
  }
  private commandPolicy(
    eligible: EligibleCommand,
    intent: CommandIntent,
  ): CommandRefusal | undefined {
    this.commandTracker.reconcileDeadlines();
    const key = eligible.entity.key;
    if (!isContinuous(intent) && this.commandScheduler.isInFlight(key))
      return refuse("in_flight");
    if (intent.kind === "setLockState") {
      const latest = this.commandTracker.latest(key);
      if (latest?.status === "sending" || latest?.status === "accepted")
        return refuse("in_flight");
      if (
        latest?.status === "unconfirmed" &&
        !this.commandTracker.hasFreshObservation(latest.id)
      )
        return refuse("fresh_observation_required");
    }
    if (
      intent.kind === "setClimateTarget" &&
      this.commandTargets.get(eligible.target)?.temperatureUnit !==
        eligible.config.temperatureUnit
    )
      return refuse("capability_changed");
  }
  private dispatchCommand(
    reference: CommandReference,
    intent: CommandIntent,
  ): CommandResult {
    const initial = this.resolveCommand(reference);
    if (initial.kind === "refused") return initial;
    const policy = this.commandPolicy(initial, intent);
    if (policy) return policy;
    // Deadline reconciliation can synchronously notify a subscriber that leaves
    // ready; do not enqueue work after that transition already canceled it.
    const eligible = this.resolveCommand(initial.target);
    if (eligible.kind === "refused") return eligible;
    const validation = validateIntent(intent, eligible.entity, eligible.config);
    if (validation.kind === "refused") return validation;
    const key = eligible.entity.key;
    if (isContinuous(intent)) {
      const latest = this.commandTracker.latest(key);
      const previousContinuous =
        latest &&
        isContinuous(latest.desired.intent) &&
        ["accepted", "unconfirmed"].includes(latest.status);
      const requireDispatch =
        this.commandScheduler.requiresDispatch(key) || !!previousContinuous;
      if (validation.kind === "no-op" && !requireDispatch) {
        this.commandScheduler.cancel(key, "superseded");
        return validation;
      }
      const queued = this.commandScheduler.enqueue(
        eligible.target,
        intent,
        requireDispatch,
        (target, requested, force) =>
          this.sendCommand(target, requested, force),
      );
      if (queued.kind === "queued") this.commandTracker.supersede(key);
      return queued;
    }
    this.commandScheduler.cancel(key, "superseded");
    if (validation.kind === "no-op") return validation;
    return this.commandScheduler.execute(key, () =>
      this.sendCommand(eligible.target, intent),
    );
  }
  private sendCommand(
    target: CommandTarget,
    intent: CommandIntent,
    requireDispatch = false,
  ): DispatchResult {
    const eligible = this.resolveCommand(target);
    if (eligible.kind === "refused") return eligible;
    const { backend, entity, config } = eligible;
    if (
      intent.kind === "setClimateTarget" &&
      this.commandTargets.get(target)?.temperatureUnit !==
        config.temperatureUnit
    )
      return refuse("capability_changed");
    const validation = validateIntent(intent, entity, config, requireDispatch);
    if (validation.kind !== "valid") return validation;
    // Register before any backend call: even a synchronous fake observation
    // must see the dispatch baseline and its sending record.
    const tracked = this.commandTracker.begin(
      entity,
      validation.intent,
      config,
    );
    if (tracked.kind === "refused") return tracked;
    // A synchronous store subscriber can leave ready/background during begin().
    const recheck = this.resolveCommand(target);
    if (
      recheck.kind === "refused" ||
      recheck.entity !== entity ||
      recheck.config.temperatureUnit !== config.temperatureUnit
    ) {
      this.commandTracker.cancelUnsent(tracked.commandId);
      return recheck.kind === "refused"
        ? recheck
        : refuse("capability_changed");
    }
    // No await between the last eligibility check and backend dispatch. The
    // request/code is projected directly into the service call and never stored.
    const generation = this.generation;
    const scopeId = String(generation);
    const result = (async () => {
      try {
        const acknowledgement = await backend.callService(
          toServiceCall(validation.intent, target.entityId),
        );
        const current =
          generation === this.generation && backend === this.backend;
        if (current)
          this.commandTracker.acknowledge(
            tracked.commandId,
            scopeId,
            acknowledgement,
          );
        return current
          ? acknowledgement
          : { kind: "unknown" as const, reason: "connection_lost" as const };
      } catch {
        if (generation === this.generation && backend === this.backend)
          this.commandTracker.acknowledge(tracked.commandId, scopeId, {
            kind: "unknown",
            reason: "connection_lost",
          });
        return { kind: "unknown" as const, reason: "connection_lost" as const };
      }
    })();
    return { kind: "started", target, commandId: tracked.commandId, result };
  }
  private invalidateCommands(reason: CancellationReason) {
    this.commandEligibility++;
    this.commandScheduler.cancelAll(reason);
  }
  dismissCommand(id: string) {
    return this.commandTracker.dismiss(id);
  }
  bootstrap(): Promise<void> {
    this.boot ??= this.load();
    return this.boot;
  }
  private async load() {
    const generation = this.generation;
    try {
      this.savedSettings = (await this.credentials.load()) ?? undefined;
    } catch {
      useCockpit.setState({ initialized: true });
      this.notice(
        "Saved credentials could not be read. Review Settings to reconnect.",
      );
      return;
    }
    useCockpit.setState({ initialized: true });
    if (generation === this.generation && this.savedSettings)
      await this.connect(this.savedSettings).catch(() => undefined);
  }
  private teardown(clear = true, preserveCommandOutcomes = false) {
    this.generation++;
    this.commandReady = false;
    this.commandSnapshot = undefined;
    this.commandEligibility++;
    this.commandScheduler.reset();
    this.commandTracker.end(clear && !preserveCommandOutcomes);
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners = [];
    this.backend?.stop();
    this.backend = undefined;
    useCockpit.setState({
      status: { kind: "idle" },
      ...(clear
        ? {
            snapshot: null,
            profileId: null,
            mode: null,
            preferences: emptyPreferences(),
            preferencesLoadedFor: null,
          }
        : {}),
    });
  }
  async connect(input: ConnectionSettings | { demo: true }) {
    const settings = "demo" in input ? undefined : validateSettings(input);
    this.teardown(true, true);
    this.attempt = settings ?? { demo: true };
    const generation = this.generation;
    const profileId = settings ? profileIdFor(settings.url) : "demo";
    useCockpit.setState({
      status: { kind: "connecting" },
      mode: settings ? "homeAssistant" : "demo",
      profileId,
      notices: [],
    });
    let loaded: Awaited<ReturnType<PreferencesStorage["load"]>>;
    try {
      loaded = await this.preferences.load();
    } catch (error) {
      if (generation === this.generation)
        useCockpit.setState({
          status: {
            kind: "error",
            error: {
              code: "storage",
              detail: "Could not read local preferences.",
            },
            retrying: false,
          },
        });
      throw error;
    }
    const { file, notice } = loaded;
    if (generation !== this.generation) return;
    if (notice) this.notice(notice);
    const stored = file.profiles[profileId] ?? emptyPreferences();
    const spatial = seedSpatial(
      stored.spatial,
      houseForMode(settings ? "homeAssistant" : "demo"),
    );
    const prefs = { ...stored, spatial };
    // Persisted with the first snapshot, so a failed attempt never creates a profile;
    // retried on later snapshots until a write succeeds.
    let seedPending = spatial !== stored.spatial;
    let seedSaving = false;
    useCockpit.setState({
      preferences: prefs,
      preferencesLoadedFor: profileId,
    });
    const backend = settings
      ? new HomeAssistantBackend(settings, String(generation), {
          identities: prefs.identities,
        })
      : new DemoBackend(String(generation));
    this.backend = backend;
    this.commandTracker.start(profileId, String(generation));
    let saved = false;
    let saving: Promise<void> | undefined;
    const persist = (): Promise<void> => {
      if (!settings || saved || generation !== this.generation)
        return Promise.resolve();
      saving ??= this.credentials
        .save(settings)
        .then(() => {
          saved = true;
          this.savedSettings = settings;
        })
        .catch((error: unknown) => {
          if (generation === this.generation)
            this.notice("Connection could not be saved. Retry in Settings.");
          throw error;
        })
        .finally(() => {
          saving = undefined;
        });
      return saving;
    };
    this.listeners = [
      backend.onStatus((status) => {
        if (generation !== this.generation) return;
        this.commandReady = status.kind === "ready";
        if (status.kind !== "ready") this.invalidateCommands("not_ready");
        this.commandTracker.onStatus(status);
        useCockpit.setState({ status });
        // Initial offline failures can recover after start() has already rejected.
        if (status.kind === "ready") void persist().catch(() => undefined);
      }),
      backend.onSnapshot((snapshot) => {
        if (generation !== this.generation) return;
        this.commandSnapshot = snapshot;
        this.commandTracker.observe(snapshot);
        const previous = useCockpit.getState().preferences;
        const preferences = reconcilePreferences(previous, snapshot.identities);
        useCockpit.setState({ snapshot, preferences });
        const identitiesChanged =
          JSON.stringify(previous.identities) !==
          JSON.stringify(snapshot.identities);
        const retrySeed = seedPending && !seedSaving;
        if (!identitiesChanged && !retrySeed) return;
        if (retrySeed) seedSaving = true;
        void this.preferences
          .saveProfile(profileId, preferences)
          .then(() => {
            seedPending = false;
          })
          .catch(() => {
            if (generation === this.generation)
              this.notice(
                identitiesChanged
                  ? "Identity metadata could not be saved."
                  : "The floor plan could not be saved yet; it will be retried.",
              );
          })
          .finally(() => {
            if (retrySeed) seedSaving = false;
          });
      }),
    ];
    await backend.setForeground(this.foreground);
    await backend.start();
    await persist();
  }
  disconnect() {
    this.teardown(false);
  }
  async forget() {
    this.teardown();
    this.attempt = undefined;
    // Wait for queued saves before choosing the actual persisted profile to remove.
    const saved = await this.credentials.load();
    if (saved) await this.credentials.forget(saved.url);
    this.savedSettings = undefined;
  }
  async retry() {
    const target = this.attempt ?? this.savedSettings;
    if (target) return this.connect(target);
    return this.load();
  }
  async refresh() {
    if (this.backend) await this.backend.resync();
  }
  async setForeground(active: boolean) {
    if (active && !this.foreground) this.commandReady = false;
    if (!active && this.foreground) this.invalidateCommands("background");
    this.foreground = active;
    if (active) this.commandTracker.reconcileDeadlines();
    await this.backend?.setForeground(active);
  }
  /** Returns false without saving when the active profile's preferences are not loaded. */
  updatePreferences(
    update: (p: ProfilePreferences) => ProfilePreferences,
  ): boolean {
    const { profileId, preferences, preferencesLoadedFor } =
      useCockpit.getState();
    if (!profileId || preferencesLoadedFor !== profileId) return false;
    const next = update(preferences);
    useCockpit.setState({ preferences: next });
    void this.preferences
      .saveProfile(profileId, next)
      .catch(() => this.notice("Preferences could not be saved."));
    return true;
  }
  /** Replaces only the plan, area links and placements; other preferences are kept. */
  resetSpatial(): boolean {
    const { mode } = useCockpit.getState();
    if (!mode) return false;
    const spatial = resetSpatial(houseForMode(mode));
    return this.updatePreferences((p) => ({ ...p, spatial }));
  }
  notice(message: string) {
    useCockpit.setState((state) => ({
      notices: [...new Set([...state.notices, message])],
    }));
  }
}
