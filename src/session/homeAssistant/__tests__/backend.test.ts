import type { Connection } from "home-assistant-js-websocket";
import { HomeAssistantBackend } from "../HomeAssistantBackend";
import type { EntityStreamMessage } from "../entityStream";
import type { HomeSnapshot } from "../../../core/types";
const event = (id = "lock.front_door"): EntityStreamMessage => ({
  a: { [id]: { s: "locked", a: {}, lc: 100 } },
});
class FakeConnection {
  connected = true;
  haVersion = "2026.10.1";
  automatic = true;
  listeners = new Map<string, Set<() => void>>();
  subscriptions: {
    callback: (value: EntityStreamMessage) => void;
    active: boolean;
  }[] = [];
  hungRegistry = false;
  close = jest.fn(() => {
    this.connected = false;
  });
  reconnect = jest.fn();
  async ping() {}
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
  async subscribeEvents() {
    return async () => undefined;
  }
  async subscribeMessage(
    callback: (value: EntityStreamMessage) => void,
    _message: unknown,
    options: { resubscribe: boolean },
  ) {
    expect(options.resubscribe).toBe(false);
    const subscription = { callback, active: true };
    this.subscriptions.push(subscription);
    if (this.automatic) queueMicrotask(() => callback(event()));
    return async () => {
      subscription.active = false;
    };
  }
  async sendMessagePromise(message: { type: string }) {
    if (message.type === "get_config")
      return { unit_system: { temperature: "°F" } };
    if (this.hungRegistry && message.type === "config/entity_registry/list")
      return new Promise(() => undefined);
    return [];
  }
}
function make(
  fake: FakeConnection,
  options: { syncTimeout?: number; metadataTimeout?: number } = {},
) {
  return new HomeAssistantBackend(
    { url: "https://home.example", token: "secret", allowInsecureHttp: false },
    "one",
    { ...options, connect: async () => fake as unknown as Connection },
  );
}
test("resync creates a fresh server subscription, coalesces requests and waits for the initial event", async () => {
  const fake = new FakeConnection();
  const backend = make(fake);
  const snapshots: HomeSnapshot[] = [];
  backend.onSnapshot((snapshot) => snapshots.push(snapshot));
  try {
    await backend.start();
    fake.automatic = false;
    let done = false;
    const first = backend.resync();
    expect(backend.resync()).toBe(first);
    void first.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(fake.subscriptions).toHaveLength(2);
    fake.subscriptions[1]!.callback({ a: {} });
    await first;
    expect(snapshots.at(-1)?.entities).toEqual({});
    expect(snapshots.at(-1)?.syncEpoch).toBe(2);
    fake.subscriptions[0]!.callback(event("lock.ghost"));
    expect(snapshots.at(-1)?.entities).toEqual({});
  } finally {
    backend.stop();
  }
});
test("registry timeout degrades metadata without blocking the required state", async () => {
  const fake = new FakeConnection();
  fake.hungRegistry = true;
  const backend = make(fake, { metadataTimeout: 5, syncTimeout: 100 });
  let snapshot: HomeSnapshot | undefined;
  backend.onSnapshot((value) => {
    snapshot = value;
  });
  try {
    await backend.start();
    expect(backend.status.kind).toBe("ready");
    expect(snapshot?.metadata.entities.kind).toBe("stale");
    expect(snapshot?.entities["lock.front_door"]).toBeDefined();
  } finally {
    backend.stop();
  }
});
test("missing initial entity event times out even with a healthy transport", async () => {
  const fake = new FakeConnection();
  fake.automatic = false;
  const backend = make(fake, { syncTimeout: 10 });
  try {
    await expect(backend.start()).rejects.toMatchObject({
      code: "sync_timeout",
    });
    expect(backend.status.kind).toBe("error");
  } finally {
    backend.stop();
  }
});
test("stopping invalidates pending epochs and late callbacks", async () => {
  const fake = new FakeConnection();
  const backend = make(fake);
  let count = 0;
  backend.onSnapshot(() => count++);
  await backend.start();
  fake.automatic = false;
  const pending = backend.resync();
  backend.stop();
  await expect(pending).rejects.toThrow("cancelled");
  fake.subscriptions[1]!.callback(event("lock.ghost"));
  expect(count).toBe(1);
  expect(fake.close).toHaveBeenCalled();
});
