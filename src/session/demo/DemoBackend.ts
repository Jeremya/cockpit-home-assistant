import type { HomeSnapshot } from "../../core/types";
import { emptyIdentity } from "../../preferences/types";
import {
  BackendEvents,
  type HomeBackend,
  type ServiceCallResult,
} from "../types";
import { mapSnapshot } from "../homeAssistant/mapSnapshot";
import type { RawEntity } from "../homeAssistant/entityStream";
export class DemoBackend extends BackendEvents implements HomeBackend {
  private timer?: ReturnType<typeof setInterval>;
  private epoch = 0;
  private tick = 0;
  constructor(private sessionId: string) {
    super();
  }
  async start() {
    this.emitStatus({ kind: "synchronizing" });
    this.publish();
    this.timer = setInterval(() => {
      this.tick++;
      this.publish();
    }, 12_000);
  }
  stop() {
    clearInterval(this.timer);
    this.emitStatus({ kind: "idle" });
  }
  async resync() {
    this.publish();
  }
  async ping() {
    return true;
  }
  recover() {
    this.publish();
  }
  async callService(): Promise<ServiceCallResult> {
    return {
      kind: "rejected",
      message: "Read-only foundation. Device controls arrive in Stage 2.",
    };
  }
  getCameraImageRequest() {
    return { uri: "", headers: {} };
  }
  private publish() {
    const now = new Date().toISOString();
    const definitions: [
      string,
      string,
      string,
      string,
      Record<string, unknown>,
    ][] = [
      [
        "lock.front_door",
        "Front door",
        "entry",
        "locked",
        { supported_features: 0 },
      ],
      [
        "lock.side_door",
        "Side door",
        "entry",
        this.tick % 4 < 2 ? "unlocked" : "locked",
        {},
      ],
      [
        "sensor.front_door_battery",
        "Door battery",
        "entry",
        "86",
        { unit_of_measurement: "%", device_class: "battery" },
      ],
      [
        "climate.downstairs",
        "Downstairs thermostat",
        "living",
        "heat_cool",
        {
          supported_features: 3,
          current_temperature: 72 + (this.tick % 3) * 0.2,
          target_temp_low: 69,
          target_temp_high: 74,
          hvac_modes: ["off", "heat", "cool", "heat_cool"],
          min_temp: 50,
          max_temp: 90,
          target_temp_step: 1,
        },
      ],
      [
        "fan.office_vent",
        "Office booster vent",
        "office",
        "on",
        { supported_features: 49, percentage: 60, percentage_step: 10 },
      ],
      [
        "sensor.fridge_temperature",
        "Fridge temperature",
        "kitchen",
        "37",
        { unit_of_measurement: "°F", device_class: "temperature" },
      ],
      [
        "sensor.freezer_temperature",
        "Freezer temperature",
        "kitchen",
        "-1",
        { unit_of_measurement: "°F", device_class: "temperature" },
      ],
      [
        "binary_sensor.fridge_door",
        "Fridge door",
        "kitchen",
        "off",
        { device_class: "door" },
      ],
      ["switch.fridge_power_cool", "Power cool", "kitchen", "off", {}],
      ["camera.front_door", "Front door camera", "entry", "idle", {}],
      [
        "event.front_door_motion",
        "Front door motion",
        "entry",
        new Date(Date.now() - 75_000).toISOString(),
        { event_type: "motion" },
      ],
    ];
    const raw: Record<string, RawEntity> = Object.fromEntries(
      definitions.map(([id, name, , state, attributes]) => [
        id,
        {
          entity_id: id,
          state,
          attributes: { ...attributes, friendly_name: name },
          last_changed: now,
          last_updated: now,
        },
      ]),
    );
    const entries = definitions.map(([id, name, area]) => ({
      id: `demo-${id}`,
      entity_id: id,
      device_id:
        id.includes("fridge") || id.includes("freezer")
          ? "demo-fridge"
          : id.includes("front_door")
            ? "demo-door"
            : `demo-${id}`,
      area_id: area,
      entity_category: null,
      hidden_by: null,
      disabled_by: null,
      name,
    }));
    const mapped = mapSnapshot(raw, entries, true, emptyIdentity());
    const snapshot: HomeSnapshot = {
      ...mapped,
      sessionId: this.sessionId,
      syncEpoch: ++this.epoch,
      receivedAt: now,
      registryEntries: entries,
      devices: {},
      areas: {
        entry: { id: "entry", name: "Entryway" },
        living: { id: "living", name: "Living room" },
        kitchen: { id: "kitchen", name: "Kitchen" },
        office: { id: "office", name: "Office" },
      },
      config: { temperatureUnit: "°F", haVersion: "Demo" },
      metadata: {
        entities: { kind: "fresh", loadedAt: now },
        devices: { kind: "fresh", loadedAt: now },
        areas: { kind: "fresh", loadedAt: now },
      },
    };
    this.emitSnapshot(snapshot);
    this.emitStatus({ kind: "ready", haVersion: "Demo", readySince: now });
  }
}
