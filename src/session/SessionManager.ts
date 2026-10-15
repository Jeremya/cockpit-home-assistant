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
  private heartbeat?: ReturnType<typeof setInterval>;
  private foreground = true;
  private boot?: Promise<void>;
  private settings?: ConnectionSettings;
  constructor(
    private credentials: Credentials,
    private preferences: PreferencesStorage,
  ) {}
  bootstrap(): Promise<void> {
    this.boot ??= this.load();
    return this.boot;
  }
  private async load() {
    try {
      const settings = await this.credentials.load();
      useCockpit.setState({ initialized: true });
      if (settings) await this.connect(settings);
    } catch {
      useCockpit.setState({ initialized: true });
      this.notice(
        "Saved connection could not be opened. Review Settings to reconnect.",
      );
    }
  }
  private teardown(clear = true) {
    this.generation++;
    clearInterval(this.heartbeat);
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
    this.settings = settings;
    const backend = settings
      ? new HomeAssistantBackend(settings, String(generation), {
          identities: prefs.identities,
        })
      : new DemoBackend(String(generation));
    this.backend = backend;
    this.listeners = [
      backend.onStatus((status) => {
        if (generation === this.generation) useCockpit.setState({ status });
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
    try {
      await backend.start();
      if (generation !== this.generation) return;
      if (settings) await this.credentials.save(settings);
      if (generation === this.generation) this.startHeartbeat();
    } catch (error) {
      if (
        generation === this.generation &&
        useCockpit.getState().status.kind !== "error"
      )
        useCockpit.setState({
          status: {
            kind: "error",
            error: { code: "storage", detail: "Could not save connection." },
            retrying: false,
          },
        });
      throw error;
    }
  }
  disconnect() {
    this.teardown(false);
  }
  async forget() {
    const origin = this.settings?.url;
    this.teardown();
    this.settings = undefined;
    if (origin) await this.credentials.forget(origin);
  }
  async retry() {
    if (this.settings) return this.connect(this.settings);
    return this.connect({ demo: true });
  }
  async refresh() {
    if (this.backend) await this.backend.resync();
  }
  private startHeartbeat() {
    clearInterval(this.heartbeat);
    if (!this.foreground || !this.backend) return;
    const backend = this.backend;
    const generation = this.generation;
    this.heartbeat = setInterval(() => {
      void backend.ping(10_000).then((alive) => {
        if (!alive && generation === this.generation && this.foreground)
          backend.recover();
      });
    }, 30_000);
  }
  async setForeground(active: boolean) {
    const changed = active !== this.foreground;
    this.foreground = active;
    if (!active) {
      clearInterval(this.heartbeat);
      return;
    }
    if (!changed || !this.backend) return;
    const backend = this.backend;
    const generation = this.generation;
    useCockpit.setState({ status: { kind: "synchronizing" } });
    if (!(await backend.ping(5_000))) {
      if (generation === this.generation) backend.recover();
      return;
    }
    if (generation !== this.generation) return;
    try {
      await backend.resync();
    } finally {
      if (generation === this.generation) this.startHeartbeat();
    }
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
