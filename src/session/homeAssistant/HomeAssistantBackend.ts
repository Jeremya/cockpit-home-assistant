import {
  createConnection,
  createLongLivedTokenAuth,
  ERR_INVALID_AUTH,
  type Connection,
} from "home-assistant-js-websocket";
import type {
  Area,
  ConnectionSettings,
  EntityRegistryEntry,
  HomeConfig,
  HomeSnapshot,
  IdentityMetadata,
  MetadataStatus,
  PhysicalDevice,
  SessionError,
  UnreachableCause,
} from "../../core/types";
import { emptyIdentity } from "../../preferences/types";
import {
  BackendEvents,
  type HomeBackend,
  type ServiceCall,
  type ServiceCallResult,
  type Unsubscribe,
} from "../types";
import {
  applyEntityStream,
  type EntityStreamMessage,
  type RawEntity,
} from "./entityStream";
import { mapSnapshot } from "./mapSnapshot";
import { validateSettings } from "./url";

export function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  failure: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(failure), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
interface BackendOptions {
  identities?: IdentityMetadata;
  connect?: (settings: ConnectionSettings) => Promise<Connection>;
  syncTimeout?: number;
  metadataTimeout?: number;
}
interface AreaRegistryEntry {
  area_id: string;
  name: string;
}
class SyncCancelled extends Error {
  constructor(readonly reason: "disconnected" | "stopped") {
    super("Synchronization cancelled");
  }
}
const stale = (): MetadataStatus => ({
  kind: "stale",
  lastLoadedAt: null,
  reason: "error",
});
export class HomeAssistantBackend extends BackendEvents implements HomeBackend {
  private connection?: Connection;
  private stopped = false;
  private terminal = false;
  private connecting = false;
  private foreground = true;
  private lifecycle = 0;
  private transportGeneration = 0;
  private activeEpoch = 0;
  private registryRevision = 0;
  private retryAttempt = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private epoch = 0;
  private sync?: Promise<void>;
  private cancelSync?: (reason: "disconnected" | "stopped") => void;
  private startPromise?: Promise<void>;
  private unsubscribe?: Unsubscribe;
  private registrySubscriptions: Unsubscribe[] = [];
  private raw: Record<string, RawEntity> = {};
  private registry: EntityRegistryEntry[] = [];
  private devices: Record<string, PhysicalDevice> = {};
  private areas: Record<string, Area> = {};
  private config?: HomeConfig;
  private identities: IdentityMetadata;
  private snapshot?: HomeSnapshot;
  private metadata: HomeSnapshot["metadata"] = {
    entities: stale(),
    devices: stale(),
    areas: stale(),
  };
  private settings: ConnectionSettings;
  constructor(
    settings: ConnectionSettings,
    private sessionId: string,
    private options: BackendOptions = {},
  ) {
    super();
    this.settings = validateSettings(settings);
    this.identities = options.identities ?? emptyIdentity();
  }
  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startHeartbeat();
    this.startPromise = this.open();
    return this.startPromise;
  }
  private assertVersion(connection: Connection) {
    const version = connection.haVersion.match(/^(\d+)\.(\d+)/);
    if (
      !version ||
      Number(version[1]) < 2026 ||
      (Number(version[1]) === 2026 && Number(version[2]) < 10)
    )
      throw {
        code: "ha_version_unsupported",
        haVersion: connection.haVersion,
      } satisfies SessionError;
  }
  private async open(): Promise<void> {
    if (this.stopped || this.terminal || this.connecting) return;
    this.connecting = true;
    this.emitStatus({ kind: "connecting" });
    try {
      this.emitStatus({ kind: "authenticating" });
      const connection = await (this.options.connect?.(this.settings) ??
        createConnection({
          auth: createLongLivedTokenAuth(
            this.settings.url,
            this.settings.token,
          ),
          connectTimeout: 10_000,
        }));
      this.connecting = false;
      if (this.stopped) {
        connection.close();
        return;
      }
      this.connection = connection;
      this.assertVersion(connection);
      connection.addEventListener("disconnected", this.onDisconnected);
      connection.addEventListener("ready", this.onReady);
      connection.addEventListener("reconnect-error", this.onReconnectError);
      // Watch before taking the first snapshot; events during a refresh mark it dirty.
      for (const event of [
        "entity_registry_updated",
        "device_registry_updated",
        "area_registry_updated",
        "core_config_updated",
      ]) {
        void connection
          .subscribeEvents(() => {
            if (this.stopped || this.terminal) return;
            this.registryRevision++;
            void this.resync().catch(() => undefined);
          }, event)
          .then((unsub) => {
            const cleanup = () => {
              void unsub().catch(() => undefined);
            };
            if (this.stopped || this.terminal) cleanup();
            else this.registrySubscriptions.push(cleanup);
          })
          .catch(() => undefined);
      }
      await this.resync();
    } catch (error) {
      this.connecting = false;
      if (this.stopped) return;
      if (error instanceof SyncCancelled) {
        // The existing client's reconnect loop owns transport recovery.
        return this.waitForReady();
      }
      if (this.status.kind !== "error") this.fail(error);
      throw error;
    }
  }
  private waitForReady(): Promise<void> {
    if (this.status.kind === "ready") return Promise.resolve();
    if (this.status.kind === "error") return Promise.reject(this.status.error);
    return new Promise((resolve, reject) => {
      const remove = this.onStatus((status) => {
        if (status.kind === "ready") {
          remove();
          resolve();
        } else if (status.kind === "error") {
          remove();
          reject(status.error);
        } else if (status.kind === "idle") {
          remove();
          reject(new SyncCancelled("stopped"));
        }
      });
    });
  }
  private clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }
  private scheduleRetry() {
    if (this.stopped || this.terminal || !this.foreground || this.retryTimer)
      return;
    const delay = Math.min(
      1000 * 2 ** Math.min(this.retryAttempt++, 5),
      30_000,
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.stopped || this.terminal || !this.foreground) return;
      if (!this.connection) void this.open().catch(() => undefined);
      else if (this.connection.connected)
        void this.resync().catch(() => undefined);
      // A disconnected Connection already has the official client's retry loop.
    }, delay);
  }
  private onDisconnected = () => {
    if (this.stopped || this.terminal) return;
    this.transportGeneration++;
    this.clearRetry();
    this.cancelSync?.("disconnected");
    this.sync = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.emitStatus({
      kind: "reconnecting",
      lastReadyAt: this.snapshot?.receivedAt ?? null,
    });
  };
  private onReady = () => {
    if (!this.stopped && !this.terminal)
      void this.resync().catch(() => undefined);
  };
  private onReconnectError = (_connection: Connection, error?: unknown) => {
    if (error === ERR_INVALID_AUTH) this.fail({ code: "auth_invalid" });
  };
  private unreachable(): SessionError {
    // Native WebSocket errors cannot reliably distinguish these causes.
    const likelyCauses: UnreachableCause[] = [
      "not_on_network",
      "local_network_permission",
      "server_stopped",
      "dns",
    ];
    likelyCauses.push(
      this.settings.url.startsWith("https:")
        ? "tls_certificate"
        : "cleartext_blocked",
    );
    return { code: "unreachable", likelyCauses };
  }
  private fail(error: unknown) {
    if (this.stopped || this.terminal) return;
    const typed =
      error === ERR_INVALID_AUTH
        ? { code: "auth_invalid" as const }
        : error &&
            typeof error === "object" &&
            "code" in error &&
            [
              "invalid_url",
              "auth_invalid",
              "ha_version_unsupported",
              "sync_timeout",
              "unreachable",
              "storage",
              "unknown",
            ].includes(String(error.code))
          ? (error as SessionError)
          : this.unreachable();
    const retrying =
      typed.code === "sync_timeout" || typed.code === "unreachable";
    this.terminal = !retrying;
    if (retrying) this.scheduleRetry();
    else {
      this.clearRetry();
      clearInterval(this.heartbeat);
      this.transportGeneration++;
      this.cancelSync?.("stopped");
      this.unsubscribe?.();
      this.connection?.close();
    }
    this.emitStatus({ kind: "error", error: typed, retrying });
  }
  stop(): void {
    this.stopped = true;
    this.lifecycle++;
    this.transportGeneration++;
    this.clearRetry();
    clearInterval(this.heartbeat);
    this.cancelSync?.("stopped");
    this.unsubscribe?.();
    this.registrySubscriptions.forEach((unsubscribe) => unsubscribe());
    this.connection?.removeEventListener("disconnected", this.onDisconnected);
    this.connection?.removeEventListener("ready", this.onReady);
    this.connection?.removeEventListener(
      "reconnect-error",
      this.onReconnectError,
    );
    this.connection?.close();
    this.emitStatus({ kind: "idle" });
  }
  resync(): Promise<void> {
    if (this.stopped || this.terminal)
      return Promise.reject(new SyncCancelled("stopped"));
    if (this.sync) return this.sync;
    this.clearRetry();
    const operation = this.refreshUntilCurrent().catch((error: unknown) => {
      if (!(error instanceof SyncCancelled)) this.fail(error);
      throw error;
    });
    this.sync = operation;
    void operation
      .finally(() => {
        if (this.sync === operation) this.sync = undefined;
      })
      .catch(() => undefined);
    return operation;
  }
  private async refreshUntilCurrent(): Promise<void> {
    let revision: number;
    do {
      revision = this.registryRevision;
      await this.synchronize();
    } while (revision !== this.registryRevision);
    if (this.stopped || this.terminal || !this.connection?.connected)
      throw new SyncCancelled("disconnected");
    this.retryAttempt = 0;
    this.clearRetry();
    this.emitStatus({
      kind: "ready",
      haVersion: this.connection.haVersion,
      readySince: new Date().toISOString(),
    });
  }
  private async synchronize(): Promise<void> {
    const connection = this.connection;
    if (!connection?.connected || this.stopped) throw this.unreachable();
    this.assertVersion(connection);
    const epoch = ++this.epoch;
    const initial = !this.snapshot;
    const error: SessionError = {
      code: "sync_timeout",
      phase: initial ? "initial" : "resync",
    };
    const transportGeneration = this.transportGeneration;
    let live = true;
    // Candidate epochs coexist with the last committed stream until successful swap.
    const current = () =>
      live &&
      !this.stopped &&
      !this.terminal &&
      transportGeneration === this.transportGeneration;
    this.emitStatus({ kind: "synchronizing" });
    let raw: Record<string, RawEntity> = {};
    let first = true;
    let committed = false;
    let received!: () => void;
    let unsubscribe: Unsubscribe | undefined;
    const initialEvent = new Promise<void>((resolve) => {
      received = resolve;
    });
    let cancel!: (reason: "disconnected" | "stopped") => void;
    const cancelled = new Promise<never>((_, reject) => {
      cancel = (reason) => reject(new SyncCancelled(reason));
      this.cancelSync = cancel;
    });
    const subscription = connection
      .subscribeMessage<EntityStreamMessage>(
        (event) => {
          if (!current()) return;
          try {
            raw = applyEntityStream(raw, event, first);
            if (first) {
              first = false;
              received();
            }
            if (committed) {
              this.raw = raw;
              this.publish();
            }
          } catch {
            this.fail({
              code: "unknown",
              detail: "Home Assistant sent an invalid entity update.",
            });
          }
        },
        { type: "subscribe_entities" },
        { resubscribe: false },
      )
      .then((unsub) => {
        unsubscribe = () => {
          live = false;
          void unsub().catch(() => undefined);
        };
        if (!current()) unsubscribe();
      });
    const metadataTimeout = this.options.metadataTimeout ?? 10_000;
    const load = async <T>(
      kind: keyof HomeSnapshot["metadata"],
      type: string,
      fallback: T,
    ): Promise<{ value: T; status: MetadataStatus }> => {
      try {
        const value = await withDeadline(
          Promise.race([connection.sendMessagePromise<T>({ type }), cancelled]),
          metadataTimeout,
          new Error("metadata_timeout"),
        );
        return {
          value,
          status: { kind: "fresh", loadedAt: new Date().toISOString() },
        };
      } catch (error) {
        const previous = this.metadata[kind];
        return {
          value: fallback,
          status: {
            kind: "stale",
            lastLoadedAt:
              previous.kind === "fresh"
                ? previous.loadedAt
                : previous.lastLoadedAt,
            reason:
              error instanceof Error && error.message === "metadata_timeout"
                ? "timeout"
                : "error",
          },
        };
      }
    };
    try {
      const results = await withDeadline(
        Promise.race([
          Promise.all([
            connection.sendMessagePromise<{
              unit_system: { temperature: string };
            }>({ type: "get_config" }),
            load("entities", "config/entity_registry/list", this.registry),
            load<Record<string, unknown>[]>(
              "devices",
              "config/device_registry/list",
              Object.values(this.devices).map((device) => ({
                id: device.id,
                name: device.name,
                manufacturer: device.manufacturer,
                model: device.model,
                area_id: device.areaId,
              })),
            ),
            load<AreaRegistryEntry[]>(
              "areas",
              "config/area_registry/list",
              Object.values(this.areas).map((area) => ({
                area_id: area.id,
                name: area.name,
              })),
            ),
            subscription,
            initialEvent,
          ]),
          cancelled,
        ]),
        this.options.syncTimeout ?? 15_000,
        error,
      );
      if (!current()) throw new SyncCancelled("disconnected");
      const [config, entities, devices, areas] = results;
      const unit = config.unit_system.temperature;
      if (unit !== "°C" && unit !== "°F")
        throw {
          code: "unknown",
          detail: "Unsupported Home Assistant temperature unit.",
        } satisfies SessionError;
      this.config = { temperatureUnit: unit, haVersion: connection.haVersion };
      this.registry = entities.value;
      this.areas = Object.fromEntries(
        areas.value.map((area) => [
          area.area_id,
          { id: area.area_id, name: area.name },
        ]),
      );
      this.devices = Object.fromEntries(
        devices.value.map((device) => {
          const id = String(device.id);
          return [
            id,
            {
              id,
              name: String(device.name_by_user ?? device.name ?? id),
              manufacturer:
                typeof device.manufacturer === "string"
                  ? device.manufacturer
                  : null,
              model: typeof device.model === "string" ? device.model : null,
              areaId:
                typeof device.area_id === "string" ? device.area_id : null,
              entityIds: this.registry
                .filter((entry) => entry.device_id === id)
                .map((entry) => entry.entity_id),
            },
          ];
        }),
      );
      this.metadata = {
        entities: entities.status,
        devices: devices.status,
        areas: areas.status,
      };
      this.raw = raw;
      committed = true;
      this.unsubscribe?.();
      this.unsubscribe = unsubscribe;
      this.activeEpoch = epoch;
      this.publish();
    } catch (failure) {
      live = false;
      cancel("stopped");
      unsubscribe?.();
      // The client may reject get_config before emitting disconnected. That
      // transport failure still cancels this candidate; it is never terminal.
      if (!this.stopped && transportGeneration !== this.transportGeneration)
        throw new SyncCancelled("disconnected");
      throw failure;
    } finally {
      if (this.cancelSync === cancel) this.cancelSync = undefined;
    }
  }
  private publish() {
    if (!this.config) return;
    const mapped = mapSnapshot(
      this.raw,
      this.registry,
      this.metadata.entities.kind === "fresh",
      this.identities,
      this.snapshot?.entities,
    );
    this.identities = mapped.identities;
    this.snapshot = {
      sessionId: this.sessionId,
      syncEpoch: this.activeEpoch,
      receivedAt: new Date().toISOString(),
      ...mapped,
      devices: this.devices,
      areas: this.areas,
      config: this.config,
      registryEntries: this.registry,
      metadata: this.metadata,
    };
    this.emitSnapshot(this.snapshot);
  }
  async ping(timeoutMs: number): Promise<boolean> {
    const connection = this.connection;
    const generation = this.transportGeneration;
    if (!connection?.connected || this.stopped || this.terminal) return false;
    try {
      await withDeadline(connection.ping(), timeoutMs, new Error("timeout"));
      return (
        !this.stopped &&
        connection.connected &&
        generation === this.transportGeneration
      );
    } catch {
      return false;
    }
  }
  recover(): void {
    if (this.stopped || this.terminal) return;
    this.clearRetry();
    if (!this.connection) {
      void this.open().catch(() => undefined);
      return;
    }
    this.emitStatus({
      kind: "reconnecting",
      lastReadyAt: this.snapshot?.receivedAt ?? null,
    });
    if (this.connection.connected) this.connection.reconnect(true);
  }
  private startHeartbeat() {
    clearInterval(this.heartbeat);
    if (!this.foreground || this.stopped || this.terminal) return;
    this.heartbeat = setInterval(() => {
      if (!this.connection?.connected) return;
      const lifecycle = this.lifecycle;
      void this.ping(10_000).then((alive) => {
        if (!alive && lifecycle === this.lifecycle && this.foreground)
          this.recover();
      });
    }, 30_000);
  }
  async setForeground(active: boolean): Promise<void> {
    if (active === this.foreground) return;
    this.foreground = active;
    const lifecycle = ++this.lifecycle;
    clearInterval(this.heartbeat);
    if (!active) {
      this.clearRetry();
      return;
    }
    if (this.stopped || this.terminal) return;
    this.emitStatus({ kind: "synchronizing" });
    try {
      const alive = await this.ping(5_000);
      if (lifecycle !== this.lifecycle || this.stopped || this.terminal) return;
      if (!alive) this.recover();
      else await this.resync();
    } finally {
      this.startHeartbeat();
    }
  }
  async callService(call: ServiceCall): Promise<ServiceCallResult> {
    if (
      this.stopped ||
      this.status.kind !== "ready" ||
      !this.connection?.connected
    )
      return { kind: "rejected", message: "Session is not ready." };
    try {
      await withDeadline(
        this.connection.sendMessagePromise({
          type: "call_service",
          domain: call.domain,
          service: call.service,
          target: { entity_id: call.entityId },
          service_data: call.data ?? {},
        }),
        10_000,
        new Error("timeout"),
      );
      return { kind: "accepted" };
    } catch (error) {
      if (error instanceof Error && error.message === "timeout")
        return { kind: "unknown", reason: "timeout" };
      if (!this.connection.connected)
        return { kind: "unknown", reason: "connection_lost" };
      return { kind: "rejected", message: "Home Assistant reported an error." };
    }
  }
  getCameraImageRequest(entityId: string) {
    return {
      uri: `${this.settings.url}/api/camera_proxy/${encodeURIComponent(entityId)}`,
      headers: { Authorization: `Bearer ${this.settings.token}` },
    };
  }
}
