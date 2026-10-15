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
const stale = (): MetadataStatus => ({
  kind: "stale",
  lastLoadedAt: null,
  reason: "error",
});
export class HomeAssistantBackend extends BackendEvents implements HomeBackend {
  private connection?: Connection;
  private stopped = false;
  private epoch = 0;
  private sync?: Promise<void>;
  private cancelSync?: () => void;
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
    this.startPromise = this.open();
    return this.startPromise;
  }
  private async open(): Promise<void> {
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
      if (this.stopped) {
        connection.close();
        return;
      }
      this.connection = connection;
      const version = connection.haVersion.match(/^(\d+)\.(\d+)/);
      if (
        !version ||
        Number(version[1]) < 2026 ||
        (Number(version[1]) === 2026 && Number(version[2]) < 10)
      ) {
        throw {
          code: "ha_version_unsupported",
          haVersion: connection.haVersion,
        } satisfies SessionError;
      }
      connection.addEventListener("disconnected", this.onDisconnected);
      connection.addEventListener("ready", this.onReady);
      connection.addEventListener("reconnect-error", this.onReconnectError);
      await this.resync();
      for (const event of [
        "entity_registry_updated",
        "device_registry_updated",
        "area_registry_updated",
        "core_config_updated",
      ]) {
        // Registry event subscriptions are optional; start() is complete once the
        // required snapshot is usable. Always consume unsubscribe rejections on close.
        void connection
          .subscribeEvents(() => {
            if (!this.stopped) void this.resync().catch(() => undefined);
          }, event)
          .then((unsub) => {
            const cleanup = () => {
              void unsub().catch(() => undefined);
            };
            if (this.stopped) cleanup();
            else this.registrySubscriptions.push(cleanup);
          })
          .catch(() => undefined);
      }
    } catch (error) {
      if (this.stopped) return;
      this.fail(error);
      this.connection?.close();
      throw error;
    }
  }
  private onDisconnected = () => {
    this.epoch++;
    this.cancelSync?.();
    this.sync = undefined;
    if (!this.stopped)
      this.emitStatus({
        kind: "reconnecting",
        lastReadyAt: this.snapshot?.receivedAt ?? null,
      });
  };
  private onReady = () => {
    if (!this.stopped) void this.resync().catch(() => undefined);
  };
  private onReconnectError = (_connection: Connection, error?: unknown) => {
    if (error === ERR_INVALID_AUTH) {
      this.fail({ code: "auth_invalid" });
      this.connection?.close();
    }
  };
  private fail(error: unknown) {
    const typed =
      error === ERR_INVALID_AUTH
        ? { code: "auth_invalid" as const }
        : error && typeof error === "object" && "code" in error
          ? (error as SessionError)
          : { code: "unreachable" as const };
    this.emitStatus({
      kind: "error",
      error: typed,
      retrying: typed.code === "sync_timeout" || typed.code === "unreachable",
    });
  }
  stop(): void {
    this.stopped = true;
    this.epoch++;
    this.cancelSync?.();
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
    if (this.sync) return this.sync;
    const operation = this.synchronize();
    this.sync = operation;
    void operation
      .finally(() => {
        if (this.sync === operation) this.sync = undefined;
      })
      .catch(() => undefined);
    return operation;
  }
  private async synchronize(): Promise<void> {
    const connection = this.connection;
    if (!connection?.connected || this.stopped)
      throw { code: "unreachable" } satisfies SessionError;
    const epoch = ++this.epoch;
    const initial = !this.snapshot;
    const error: SessionError = {
      code: "sync_timeout",
      phase: initial ? "initial" : "resync",
    };
    const current = () => !this.stopped && epoch === this.epoch;
    this.emitStatus({ kind: "synchronizing" });
    let raw: Record<string, RawEntity> = {};
    let first = true;
    let committed = false;
    let received!: () => void;
    let unsubscribe: Unsubscribe | undefined;
    const initialEvent = new Promise<void>((resolve) => {
      received = resolve;
    });
    const cancelled = new Promise<never>((_, reject) => {
      this.cancelSync = () => reject(new Error("Synchronization cancelled"));
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
          connection.sendMessagePromise<T>({ type }),
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
            load<Area[]>(
              "areas",
              "config/area_registry/list",
              Object.values(this.areas),
            ),
            subscription,
            initialEvent,
          ]),
          cancelled,
        ]),
        this.options.syncTimeout ?? 15_000,
        error,
      );
      if (!current()) return;
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
        areas.value.map((area) => [area.id, area]),
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
      this.publish();
      this.emitStatus({
        kind: "ready",
        haVersion: connection.haVersion,
        readySince: new Date().toISOString(),
      });
    } catch (failure) {
      if (current()) {
        this.epoch++;
        this.fail(failure);
      }
      unsubscribe?.();
      throw failure;
    } finally {
      if (current()) this.cancelSync = undefined;
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
      syncEpoch: this.epoch,
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
    if (!this.connection?.connected || this.stopped) return false;
    try {
      await withDeadline(
        this.connection.ping(),
        timeoutMs,
        new Error("timeout"),
      );
      return !this.stopped;
    } catch {
      return false;
    }
  }
  recover(): void {
    if (!this.stopped) this.connection?.reconnect(true);
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
