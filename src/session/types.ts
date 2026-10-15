import type { HomeSnapshot, SessionStatus, Unsubscribe } from "../core/types";
export type { Unsubscribe } from "../core/types";
export type ServiceCallResult =
  | { kind: "accepted" }
  | { kind: "rejected"; message: string }
  | { kind: "unknown"; reason: "timeout" | "connection_lost" };
export interface ServiceCall {
  domain: string;
  service: string;
  entityId: string;
  data?: Record<string, unknown>;
}
export interface HomeBackend {
  start(): Promise<void>;
  stop(): void;
  resync(): Promise<void>;
  ping(timeoutMs: number): Promise<boolean>;
  recover(): void;
  onSnapshot(listener: (snapshot: HomeSnapshot) => void): Unsubscribe;
  onStatus(listener: (status: SessionStatus) => void): Unsubscribe;
  callService(call: ServiceCall): Promise<ServiceCallResult>;
  getCameraImageRequest(entityId: string): {
    uri: string;
    headers: Record<string, string>;
  };
}
export class BackendEvents {
  private snapshots = new Set<(snapshot: HomeSnapshot) => void>();
  private statuses = new Set<(status: SessionStatus) => void>();
  status: SessionStatus = { kind: "idle" };
  onSnapshot = (listener: (snapshot: HomeSnapshot) => void) => {
    this.snapshots.add(listener);
    return () => {
      this.snapshots.delete(listener);
    };
  };
  onStatus = (listener: (status: SessionStatus) => void) => {
    this.statuses.add(listener);
    return () => {
      this.statuses.delete(listener);
    };
  };
  protected emitSnapshot(snapshot: HomeSnapshot) {
    this.snapshots.forEach((listener) => listener(snapshot));
  }
  protected emitStatus(status: SessionStatus) {
    this.status = status;
    this.statuses.forEach((listener) => listener(status));
  }
}
