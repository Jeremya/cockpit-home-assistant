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
    const prefs = file.profiles[profileId] ?? emptyPreferences();
    useCockpit.setState({ preferences: prefs });
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
        if (
          JSON.stringify(previous.identities) !==
          JSON.stringify(snapshot.identities)
        )
          void this.preferences
            .saveProfile(profileId, preferences)
            .catch(() => {
              if (generation === this.generation)
                this.notice("Identity metadata could not be saved.");
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
  updatePreferences(update: (p: ProfilePreferences) => ProfilePreferences) {
    const { profileId, preferences } = useCockpit.getState();
    if (!profileId) return;
    const next = update(preferences);
    useCockpit.setState({ preferences: next });
    void this.preferences
      .saveProfile(profileId, next)
      .catch(() => this.notice("Preferences could not be saved."));
  }
  notice(message: string) {
    useCockpit.setState((state) => ({
      notices: [...new Set([...state.notices, message])],
    }));
  }
}
