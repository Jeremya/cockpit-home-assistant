import type {
  ConnectionSettings,
  EntityRecord,
  HomeConfig,
  HomeSnapshot,
  SessionError,
} from "../core/types";
import { useCockpit } from "../core/store";
import { Credentials } from "../services/credentials";
import { clearCameraCache } from "../services/cameraImage";
import { PreferencesStorage } from "../preferences/storage";
import {
  emptyPreferences,
  reconcilePreferences,
  resolveAlias,
  type ProfilePreferences,
  type SwitchEnrollment,
} from "../preferences/types";
import { DemoBackend } from "./demo/DemoBackend";
import { HomeAssistantBackend } from "./homeAssistant/HomeAssistantBackend";
import {
  profileIdFor,
  validateOrigin,
  validateSettings,
} from "./homeAssistant/url";
import type {
  BrowserAuthorization,
  BrowserSignIn,
} from "../services/auth/authorization";
import type { RevocationResult } from "../services/auth/tokenEndpoint";
import type { AuthMessage } from "../services/auth/authChannel";
import { principalFor } from "../services/auth/principals";
import type { WebAuth } from "../services/auth/webAuth";
import { houseForMode } from "../spatial/plans";
import { resetSpatial, seedSpatial } from "../spatial/profilePlan";
import type { HomeBackend } from "./types";
import { createCommandFacade } from "../commands/facade";
import { CommandTracker } from "../commands/CommandTracker";
import { CommandScheduler, isContinuous } from "../commands/CommandScheduler";
import { refuse, validateIntent } from "../commands/validation";
import { toServiceCall } from "../commands/serviceCalls";
import {
  switchBinding,
  sameSwitchBinding,
  switchControlRestriction,
  switchIdentityRestriction,
} from "../commands/switchControl";
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

type ConnectInput = ConnectionSettings | { demo: true } | BrowserSignIn;
const notices = {
  rememberFailed:
    "This browser could not remember the sign-in. You stay signed in on this page only.",
  rememberedEnded:
    "The sign-in this browser remembered is no longer valid. Sign in again.",
  rememberedDiscarded:
    "The sign-in this browser remembered could not be read and was removed. Sign in again.",
  rememberedUnreadable:
    "The sign-in this browser remembered could not be read. Sign in again.",
  signedOutElsewhere: "Signed out of Home Assistant in another tab.",
  signOutNotSaved:
    "This browser could not delete its remembered sign-in; Home Assistant was asked to revoke it.",
  resetUnknownUser:
    "Power permissions for this home were reset because the Home Assistant user who allowed them is unknown. Allow devices again if needed.",
  resetOtherUser:
    "Power permissions for this home were reset because a different Home Assistant user signed in.",
  resetElsewhere:
    "Power permissions for this home were reset in another tab because a different Home Assistant user signed in. Reconnect to use power control here.",
  principalNotSaved:
    "Power control is unavailable: this browser could not save which Home Assistant user may use it. Reconnect to try again.",
};
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
  private attempt?: ConnectInput;
  /** Page memory owns a browser sign-in, unless this browser remembers it. */
  private browser?: BrowserAuthorization;
  private browserProfile?: string;
  private browserListeners = new Set<() => void>();
  /** Web: grants are usable only once this session's HA user is bound to them. */
  private powerGate: "open" | "pending" | "blocked" = "open";
  private principal?: string;
  private savedSettings?: ConnectionSettings;
  private commandEligibility = 0;
  private commandReady = false;
  private commandSnapshot?: HomeSnapshot;
  private commandTracker = new CommandTracker();
  private pendingSwitchEnrollments = new Set<SwitchEnrollment>();
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
      switchBinding?: SwitchEnrollment;
    }
  >();
  readonly commands = createCommandFacade(
    (key) => this.captureCommandTarget(key),
    (reference, intent) => this.dispatchCommand(reference, intent),
  );
  constructor(
    private credentials: Credentials,
    private preferences: PreferencesStorage,
    private web?: WebAuth,
  ) {
    web?.channel.subscribe(this.onAuthMessage);
  }
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
      ...(useCockpit.getState().mode === "homeAssistant" &&
      !switchIdentityRestriction(matches[0]!, snapshot, "homeAssistant")
        ? { switchBinding: switchBinding(matches[0]!, snapshot, profileId) }
        : {}),
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
  private switchPolicy(
    eligible: EligibleCommand,
    intent: CommandIntent,
  ): CommandRefusal | undefined {
    if (intent.kind !== "setSwitch") return;
    if (this.powerGate !== "open") return refuse("not_authorized");
    const state = useCockpit.getState();
    const grant = state.preferences.switchEnrollments[eligible.entity.key];
    if (
      state.preferencesLoadedFor !== eligible.target.profileId ||
      (grant && this.pendingSwitchEnrollments.has(grant)) ||
      switchControlRestriction(
        eligible.entity,
        this.commandSnapshot!,
        state.mode,
        {
          profileId: eligible.target.profileId,
          preferences: state.preferences,
        },
      )
    )
      return refuse("not_authorized");
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
    const authorization = this.switchPolicy(eligible, intent);
    if (authorization) return authorization;
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
    const authorization = this.switchPolicy(eligible, intent);
    if (authorization) return authorization;
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
      recheck.config.temperatureUnit !== config.temperatureUnit ||
      this.switchPolicy(recheck, intent)
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
  /**
   * A camera entity's authenticated image request, validated against the live
   * session. Returns null unless the session is ready and the entity is an
   * available camera in the current snapshot. The raw bearer never leaves the
   * camera image service; screens consume only its sanitized output.
   */
  cameraImageRequest(
    entityId: string,
  ): { uri: string; headers: Record<string, string> } | null {
    const state = useCockpit.getState();
    if (!this.backend || !state.snapshot || state.status.kind !== "ready")
      return null;
    const entity = state.snapshot.entities[entityId];
    if (!entity || entity.domain !== "camera") return null;
    return this.backend.getCameraImageRequest(entityId);
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
    const restored = this.savedSettings
      ? undefined
      : await this.restoreRemembered();
    useCockpit.setState({ initialized: true });
    // A newer connection (such as a sign-in callback) wins over the restore.
    if (generation !== this.generation) {
      restored?.authorization.release();
      return;
    }
    const target = this.savedSettings ?? restored;
    if (target) await this.connect(target).catch(() => undefined);
  }
  private async restoreRemembered(): Promise<BrowserSignIn | undefined> {
    const store = this.web?.store;
    if (!store) return undefined;
    let latest: Awaited<ReturnType<typeof store.latest>>;
    try {
      latest = await store.latest();
    } catch {
      this.notice(notices.rememberedUnreadable);
      return undefined;
    }
    const restored = latest.session && this.web!.restore(latest.session);
    if (latest.session && !restored)
      void store.remove(latest.session.profileId).catch(() => undefined);
    if (latest.discarded || (latest.session && !restored))
      this.notice(notices.rememberedDiscarded);
    return restored;
  }
  private teardown(clear = true, preserveCommandOutcomes = false) {
    this.generation++;
    this.commandReady = false;
    this.commandSnapshot = undefined;
    this.commandEligibility++;
    this.pendingSwitchEnrollments.clear();
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
  async connect(input: ConnectInput) {
    const browser = "authorization" in input ? input : undefined;
    if (browser?.authorization.closed)
      throw new Error("This sign-in has ended. Sign in again.");
    const settings =
      "demo" in input || "authorization" in input
        ? undefined
        : validateSettings(input);
    const origin = browser ? validateOrigin(browser).url : settings?.url;
    const profileId = origin ? profileIdFor(origin) : "demo";
    const store = this.web?.store;
    const remember =
      browser?.remember && !browser.authorization.remembered
        ? // Read first: a sign-out anywhere after this point wins over the write.
          (store?.signOutSeq(profileId) ?? Promise.reject(new Error()))
        : undefined;
    remember?.catch(() => undefined);
    const replaced =
      this.browser !== browser?.authorization ? this.browser : undefined;
    this.browser = browser?.authorization;
    this.browserProfile = browser ? profileId : undefined;
    const bindUser = !!this.web && !!origin;
    this.powerGate = bindUser ? "pending" : "open";
    this.principal = undefined;
    this.teardown(true, true);
    // A replaced browser sign-in has no other owner: after its targets, revoke
    // it, unless this browser still remembers it.
    if (replaced?.remembered) replaced.release();
    else void replaced?.close();
    this.browserChanged();
    this.attempt = settings ?? browser ?? { demo: true };
    const generation = this.generation;
    useCockpit.setState({
      status: { kind: "connecting" },
      mode: origin ? "homeAssistant" : "demo",
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
      houseForMode(origin ? "homeAssistant" : "demo"),
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
    const connection = settings ?? browser;
    const backend = connection
      ? new HomeAssistantBackend(connection, String(generation), {
          identities: prefs.identities,
          ...(bindUser
            ? {
                verifyUser: true,
                onUser: (userId: string) =>
                  this.bindPrincipal(
                    generation,
                    profileId,
                    origin!,
                    userId,
                    browser,
                  ),
              }
            : {}),
        })
      : new DemoBackend(String(generation));
    this.backend = backend;
    this.commandTracker.start(profileId, String(generation));
    let saved = false;
    let saving: Promise<void> | undefined;
    let remembering = !!remember;
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
        // Terminal auth or version errors end the sign-in; no silent reuse.
        if (browser && status.kind === "error" && !status.retrying) {
          if (this.attempt === browser) this.attempt = undefined;
          if (this.browser === browser.authorization) {
            this.browser = undefined;
            this.browserProfile = undefined;
          }
          this.endSignIn(browser.authorization, profileId);
          this.browserChanged();
        }
        this.commandReady = status.kind === "ready";
        if (status.kind !== "ready") this.invalidateCommands("not_ready");
        this.commandTracker.onStatus(status);
        useCockpit.setState({ status });
        // Initial offline failures can recover after start() has already rejected.
        if (status.kind === "ready") void persist().catch(() => undefined);
        // Remembered only once the user is verified and a fresh snapshot arrived.
        if (status.kind === "ready" && remembering) {
          remembering = false;
          void this.rememberSignIn(browser!, profileId, remember!);
        }
      }),
      backend.onSnapshot((snapshot) => {
        if (generation !== this.generation) return;
        this.commandSnapshot = snapshot;
        this.commandTracker.observe(snapshot);
        const previous = useCockpit.getState().preferences;
        const preferences = reconcilePreferences(previous, snapshot.identities);
        const identitiesChanged =
          JSON.stringify(previous.identities) !==
          JSON.stringify(snapshot.identities);
        const retrySeed = seedPending && !seedSaving;
        if (identitiesChanged || retrySeed) {
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
        }
        // Persist before publishing so a subscriber's later permission
        // revocation cannot be overwritten by this snapshot's older copy.
        useCockpit.setState({ snapshot, preferences });
      }),
    ];
    await backend.setForeground(this.foreground);
    await backend.start();
    await persist();
  }
  disconnect() {
    this.teardown(false);
  }
  /** Whether the current or last attempt is a browser sign-in still held. */
  get browserSession(): "memory" | "remembered" | undefined {
    if (!this.browser) return undefined;
    return this.browser.remembered ? "remembered" : "memory";
  }
  /** For `useSyncExternalStore`: `browserSession` changed. */
  subscribeBrowser = (listener: () => void) => {
    this.browserListeners.add(listener);
    return () => {
      this.browserListeners.delete(listener);
    };
  };
  private browserChanged() {
    this.browserListeners.forEach((listener) => listener());
  }
  /**
   * Ends a browser sign-in: local use and targets first, then this browser's
   * record and the other tabs, then revocation.
   */
  async signOut(): Promise<RevocationResult | undefined> {
    const profileId = this.browserProfile;
    const authorization = this.endBrowser();
    if (profileId) await this.forgetRemembered(profileId);
    return authorization?.close();
  }
  /** Keeps this page signed in; it is revoked when the page closes. */
  async stopRemembering(): Promise<boolean> {
    const authorization = this.browser;
    const profileId = this.browserProfile;
    const store = this.web?.store;
    if (!authorization?.remembered || !profileId || !store) return false;
    authorization.remembered = false;
    this.browserChanged();
    try {
      await store.remove(profileId);
      return true;
    } catch {
      // The record may still hold this token: unload must not revoke it.
      if (!authorization.closed) authorization.remembered = true;
      this.browserChanged();
      return false;
    }
  }
  async forget() {
    const profileId = useCockpit.getState().profileId ?? this.browserProfile;
    const authorization = this.endBrowser();
    // Local use has ended: its camera frames go now, whatever fails below.
    if (profileId) clearCameraCache(profileId);
    if (profileId?.startsWith("ha:")) await this.forgetRemembered(profileId);
    await authorization?.close();
    // Wait for queued saves before choosing the actual persisted profile to remove.
    const saved = await this.credentials.load();
    if (saved) {
      // The persisted profile can differ from the active one.
      clearCameraCache(profileIdFor(saved.url));
      await this.credentials.forget(saved.url);
    }
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
    // Ordinary favorites/placement edits cannot grant or remove actuator rights.
    const next = {
      ...update(preferences),
      switchEnrollments: preferences.switchEnrollments,
    };
    // Queue before publishing: a synchronous subscriber's later edit must win.
    const saved = this.preferences.saveProfile(profileId, next);
    useCockpit.setState({ preferences: next });
    void saved.catch(() => this.notice("Preferences could not be saved."));
    return true;
  }
  /** Call only after explicit UI confirmation; this grants permission, sends no service. */
  async allowSwitch(target: CommandTarget): Promise<boolean> {
    if (this.powerGate !== "open") return false;
    // Another tab may have bound this home to another HA user meanwhile.
    if (this.web && useCockpit.getState().mode === "homeAssistant") {
      const generation = this.generation;
      const stored = await this.web.principals
        .get(target.profileId)
        .catch(() => undefined);
      if (generation !== this.generation || this.powerGate !== "open")
        return false;
      if (stored !== this.principal) {
        this.principalChangedElsewhere();
        return false;
      }
    }
    const eligible = this.resolveCommand(target);
    const state = useCockpit.getState();
    if (
      eligible.kind === "refused" ||
      state.mode !== "homeAssistant" ||
      state.preferencesLoadedFor !== target.profileId ||
      switchIdentityRestriction(
        eligible.entity,
        this.commandSnapshot!,
        state.mode,
      ) ||
      !["on", "off"].includes(eligible.entity.state)
    )
      return false;
    const grant = switchBinding(
      eligible.entity,
      this.commandSnapshot!,
      target.profileId,
    );
    if (
      !sameSwitchBinding(this.commandTargets.get(target)?.switchBinding, grant)
    )
      return false;
    this.pendingSwitchEnrollments.add(grant);
    this.invalidateCommands("session_changed");
    const next = {
      ...state.preferences,
      switchEnrollments: {
        ...state.preferences.switchEnrollments,
        [target.entityKey]: grant,
      },
    };
    const saved = this.preferences.saveProfile(target.profileId, next);
    useCockpit.setState({ preferences: next });
    let persisted = false;
    try {
      await saved;
      persisted = true;
    } catch {
      const current = useCockpit.getState();
      if (
        current.profileId === target.profileId &&
        current.preferences.switchEnrollments[target.entityKey] === grant
      )
        await this.revokeSwitch(target.profileId, target.entityKey);
      this.notice(
        "Power permission could not be saved. Control remains disabled; try allowing it again.",
      );
    } finally {
      this.pendingSwitchEnrollments.delete(grant);
      const current = useCockpit.getState();
      if (current.profileId === target.profileId)
        useCockpit.setState({
          preferences: {
            ...current.preferences,
            switchEnrollments: { ...current.preferences.switchEnrollments },
          },
        });
    }
    const current = useCockpit.getState();
    return (
      persisted &&
      current.profileId === target.profileId &&
      current.preferences.switchEnrollments[target.entityKey] === grant
    );
  }
  /** Revocation also works offline and invalidates prepared actions before publication. */
  revokeSwitch(profileId: string, entityKey: string): Promise<boolean> {
    return this.revokeSwitches(profileId, (key) => key !== entityKey);
  }
  private async revokeSwitches(
    profileId: string,
    keep: (entityKey: string) => boolean,
  ): Promise<boolean> {
    const state = useCockpit.getState();
    if (
      state.profileId !== profileId ||
      state.preferencesLoadedFor !== profileId
    )
      return false;
    const grants = Object.fromEntries(
      Object.entries(state.preferences.switchEnrollments).filter(([key]) =>
        keep(key),
      ),
    );
    this.invalidateCommands("session_changed");
    const next = { ...state.preferences, switchEnrollments: grants };
    const saved = this.preferences.saveProfile(profileId, next);
    useCockpit.setState({ preferences: next });
    try {
      await saved;
      return true;
    } catch {
      this.notice(
        "Power permission is disabled for this session, but could not be saved. Revoke it again before restarting.",
      );
      return false;
    }
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
  /** Ends this page's browser sign-in locally; the caller decides on revocation. */
  private endBrowser(message?: string) {
    const authorization = this.browser;
    this.browser = undefined;
    this.browserProfile = undefined;
    this.teardown();
    this.attempt = undefined;
    if (message) this.notice(message);
    this.browserChanged();
    return authorization;
  }
  /** Terminal error: revoke, and drop the record only if it still holds this token. */
  private endSignIn(authorization: BrowserAuthorization, profileId: string) {
    const token = authorization.refreshToken;
    const remembered = authorization.remembered;
    void authorization.close();
    if (!remembered || !token) return;
    void this.web?.store?.remove(profileId, token).catch(() => undefined);
    this.notice(notices.rememberedEnded);
  }
  private async forgetRemembered(profileId: string) {
    if (!this.web) return;
    try {
      await this.web.store?.signOut(profileId);
    } catch {
      this.notice(notices.signOutNotSaved);
    }
    this.web.channel.post({ type: "signed-out", profileId });
  }
  private async rememberSignIn(
    browser: BrowserSignIn,
    profileId: string,
    signOutSeq: Promise<number>,
  ) {
    const { authorization } = browser;
    const store = this.web?.store;
    const current = () =>
      this.browser === authorization && !authorization.closed;
    const failed = () => {
      authorization.remembered = false;
      if (current()) this.notice(notices.rememberFailed);
      this.browserChanged();
    };
    const principal = this.principal;
    let seq: number;
    try {
      seq = await signOutSeq;
    } catch {
      failed();
      return;
    }
    const refreshToken = authorization.refreshToken;
    const clientId = authorization.auth.data.clientId;
    if (!current() || !refreshToken) return;
    if (!store || !principal || !clientId) {
      failed();
      return;
    }
    // Before the write: a page closing meanwhile must not revoke what it keeps.
    authorization.remembered = true;
    let result: Awaited<ReturnType<typeof store.remember>>;
    try {
      result = await store.remember(
        {
          version: 1,
          profileId,
          hassUrl: authorization.hassUrl,
          clientId,
          allowInsecureHttp: browser.allowInsecureHttp,
          principal,
          refreshToken,
          rememberedAt: Date.now(),
        },
        seq,
      );
    } catch {
      failed();
      return;
    }
    if (result.kind === "signed_out") {
      authorization.remembered = false;
      if (current()) this.endBrowser(notices.signedOutElsewhere);
      void authorization.close();
      return;
    }
    if (result.replaced)
      void this.web!.revoke(
        result.replaced.hassUrl,
        result.replaced.refreshToken,
      ).catch(() => undefined);
    this.browserChanged();
  }
  /**
   * Web rule (M01 amendment): grants are usable only under the HA user they
   * were made with. Runs before the first synchronization; refusing throws.
   */
  private async bindPrincipal(
    generation: number,
    profileId: string,
    hassUrl: string,
    userId: string,
    browser?: BrowserSignIn,
  ): Promise<void> {
    const web = this.web!;
    let principal: string;
    try {
      principal = await principalFor(hassUrl, userId);
    } catch {
      if (generation === this.generation)
        this.blockPower(notices.principalNotSaved);
      return;
    }
    if (
      browser?.rememberedPrincipal &&
      browser.rememberedPrincipal !== principal
    )
      throw { code: "auth_invalid" } satisfies SessionError;
    if (generation !== this.generation) return;
    this.principal = principal;
    const stored = await web.principals.get(profileId).catch(() => undefined);
    if (generation !== this.generation) return;
    if (stored !== principal) {
      const reset =
        Object.keys(useCockpit.getState().preferences.switchEnrollments)
          .length > 0;
      // Targets and unsent work first, then the grants; the principal last,
      // so a crash in between can only lead to another, empty revocation.
      if (reset && !(await this.revokeSwitches(profileId, () => false))) {
        if (generation === this.generation) this.blockPower();
        return;
      }
      if (generation !== this.generation) return;
      if (reset)
        this.notice(stored ? notices.resetOtherUser : notices.resetUnknownUser);
      try {
        await web.principals.set(profileId, principal);
      } catch {
        if (generation === this.generation)
          this.blockPower(notices.principalNotSaved);
        return;
      }
      web.channel.post({ type: "principal-changed", profileId, principal });
      if (generation !== this.generation) return;
    }
    if (this.powerGate === "pending") this.powerGate = "open";
  }
  private blockPower(message?: string) {
    this.powerGate = "blocked";
    this.invalidateCommands("session_changed");
    if (message) this.notice(message);
  }
  private onAuthMessage = (message: AuthMessage) => {
    if (message.type === "signed-out") {
      if (this.browser && this.browserProfile === message.profileId)
        void this.endBrowser(notices.signedOutElsewhere)?.close();
      return;
    }
    // A pending session compares the stored principal itself.
    if (
      this.backend &&
      this.powerGate === "open" &&
      this.principal &&
      message.principal !== this.principal &&
      useCockpit.getState().profileId === message.profileId
    )
      this.principalChangedElsewhere();
  };
  private principalChangedElsewhere() {
    this.blockPower(notices.resetElsewhere);
    // That tab already revoked them on disk; this page must not write them back.
    const { preferences } = useCockpit.getState();
    useCockpit.setState({
      preferences: { ...preferences, switchEnrollments: {} },
    });
  }
}
