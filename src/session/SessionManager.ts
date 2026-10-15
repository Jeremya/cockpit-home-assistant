import type { ConnectionSettings } from "../core/types";
import { useCockpit } from "../core/store";
import { Credentials } from "../services/credentials";
import { PreferencesStorage } from "../preferences/storage";
import {
  emptyPreferences,
  reconcilePreferences,
  type ProfilePreferences,
} from "../preferences/types";
import { DemoBackend } from "./demo/DemoBackend";
import { HomeAssistantBackend } from "./homeAssistant/HomeAssistantBackend";
import { profileIdFor, validateSettings } from "./homeAssistant/url";
import { houseForMode } from "../spatial/plans";
import { resetSpatial, seedSpatial } from "../spatial/profilePlan";
import type { HomeBackend } from "./types";

export class SessionManager {
  private backend?: HomeBackend;
  private generation = 0;
  private listeners: (() => void)[] = [];
  private foreground = true;
  private boot?: Promise<void>;
  private attempt?: ConnectionSettings | { demo: true };
  private savedSettings?: ConnectionSettings;
  constructor(
    private credentials: Credentials,
    private preferences: PreferencesStorage,
  ) {}
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
  private teardown(clear = true) {
    this.generation++;
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
    this.teardown();
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
        useCockpit.setState({ status });
        // Initial offline failures can recover after start() has already rejected.
        if (status.kind === "ready") void persist().catch(() => undefined);
      }),
      backend.onSnapshot((snapshot) => {
        if (generation !== this.generation) return;
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
    this.foreground = active;
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
