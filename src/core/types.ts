export type Unsubscribe = () => void;
export type UnreachableCause =
  | "not_on_network"
  | "local_network_permission"
  | "server_stopped"
  | "tls_certificate"
  | "cleartext_blocked"
  | "dns";
export type SessionError =
  | { code: "invalid_url"; detail: string }
  | { code: "auth_invalid" }
  | { code: "ha_version_unsupported"; haVersion: string }
  | { code: "sync_timeout"; phase: "initial" | "resync" }
  | { code: "unreachable"; likelyCauses: UnreachableCause[] }
  | { code: "storage" | "unknown"; detail?: string };
export type SessionStatus =
  | { kind: "idle" | "connecting" | "authenticating" | "synchronizing" }
  | { kind: "ready"; haVersion: string; readySince: string }
  | { kind: "reconnecting"; lastReadyAt: string | null }
  | { kind: "error"; error: SessionError; retrying: boolean };
export interface ConnectionSettings {
  url: string;
  token: string;
  allowInsecureHttp: boolean;
}
export interface EntityRecord {
  key: string;
  entityId: string;
  domain: string;
  state: string;
  attributes: Record<string, unknown>;
  lastChanged: string;
  lastUpdated: string;
  deviceId: string | null;
  areaId: string | null;
  entityCategory: "config" | "diagnostic" | null;
  hiddenInHA: boolean;
  disabledInHA: boolean;
  name: string;
}
export interface EntityRegistryEntry {
  id: string;
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  entity_category: "config" | "diagnostic" | null;
  hidden_by: string | null;
  disabled_by: string | null;
  name: string | null;
  original_name?: string;
}
export interface PhysicalDevice {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  areaId: string | null;
  entityIds: string[];
}
export interface Area {
  id: string;
  name: string;
}
export interface HomeConfig {
  temperatureUnit: "°C" | "°F";
  haVersion: string;
}
export type MetadataStatus =
  | { kind: "fresh"; loadedAt: string }
  | {
      kind: "stale";
      lastLoadedAt: string | null;
      reason: "error" | "timeout" | "forbidden";
    };
export interface IdentityMetadata {
  schemaVersion: 1;
  entityKeys: Record<string, string>;
  aliases: Record<string, string>;
}
export interface HomeSnapshot {
  sessionId: string;
  syncEpoch: number;
  receivedAt: string;
  entities: Record<string, EntityRecord>;
  devices: Record<string, PhysicalDevice>;
  areas: Record<string, Area>;
  registryEntries: EntityRegistryEntry[];
  config: HomeConfig;
  identities: IdentityMetadata;
  metadata: Record<"entities" | "devices" | "areas", MetadataStatus>;
}
export type Condition =
  | "normal"
  | "active"
  | "attention"
  | "alert"
  | "unavailable"
  | "unknown"
  | "stale";
export type Capability =
  | { kind: "lock"; canOpen: boolean; codeFormat: string | null }
  | {
      kind: "climate";
      target: "single" | "range" | "both" | "none";
      hvacModes: string[];
      min: number;
      max: number;
      step: number;
      unit: "°C" | "°F";
    }
  | {
      kind: "fan";
      onOff: boolean;
      percentage: { step: number } | null;
      presets: string[];
    }
  | { kind: "switch" | "sensor" | "binary_sensor" | "event" | "camera" };
