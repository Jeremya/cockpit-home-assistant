import {
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
  type Connection,
} from "home-assistant-js-websocket";
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
  registryEvents: (() => void)[] = [];
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
  async subscribeEvents(listener: () => void) {
    this.registryEvents.push(listener);
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

test("disconnecting during the first snapshot keeps library reconnection alive", async () => {
  const fake = new FakeConnection();
  fake.automatic = false;
  const backend = make(fake);
  const starting = backend.start();
  const completion = starting.catch(() => undefined);
  await Promise.resolve();
  fake.connected = false;
  fake.fire("disconnected");
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  try {
    expect(fake.close).not.toHaveBeenCalled();
    fake.connected = true;
    fake.fire("ready");
    fake.subscriptions.at(-1)!.callback(event());
    await completion;
    expect(backend.status.kind).toBe("ready");
  } finally {
    backend.stop();
  }
});

test("resync timeout retains the active subscription and schedules real recovery", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  const fake = new FakeConnection();
  const backend = make(fake, { syncTimeout: 20 });
  const snapshots: HomeSnapshot[] = [];
  backend.onSnapshot((snapshot) => snapshots.push(snapshot));
  try {
    await backend.start();
    fake.automatic = false;
    const refresh = backend.resync();
    const failed = expect(refresh).rejects.toMatchObject({
      code: "sync_timeout",
    });
    await jest.advanceTimersByTimeAsync(20);
    await failed;
    fake.subscriptions[0]!.callback({
      c: { "lock.front_door": { "+": { s: "unlocked", lc: 120 } } },
    });
    expect(snapshots.at(-1)?.entities["lock.front_door"]?.state).toBe(
      "unlocked",
    );
    await jest.advanceTimersByTimeAsync(1000);
    expect(fake.subscriptions).toHaveLength(3);
    fake.subscriptions[2]!.callback(event());
    await jest.advanceTimersByTimeAsync(0);
    expect(backend.status.kind).toBe("ready");
  } finally {
    backend.stop();
    jest.useRealTimers();
  }
});

test("registry events arriving during a refresh cause a follow-up reload", async () => {
  const fake = new FakeConnection();
  const backend = make(fake);
  try {
    await backend.start();
    fake.automatic = false;
    const refresh = backend.resync();
    fake.registryEvents[0]!();
    fake.subscriptions[1]!.callback(event());
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(fake.subscriptions).toHaveLength(3);
    fake.subscriptions[2]!.callback(event());
    await refresh;
  } finally {
    backend.stop();
  }
});
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
test("startup offline really retries, backs off, and recovers without manual Retry", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  const fake = new FakeConnection();
  const connect = jest
    .fn()
    .mockRejectedValueOnce(ERR_CANNOT_CONNECT)
    .mockRejectedValueOnce(ERR_CANNOT_CONNECT)
    .mockResolvedValue(fake);
  const backend = new HomeAssistantBackend(
    { url: "https://home.example", token: "secret", allowInsecureHttp: false },
    "one",
    { connect },
  );
  try {
    await expect(backend.start()).rejects.toBe(ERR_CANNOT_CONNECT);
    expect(backend.status).toMatchObject({
      kind: "error",
      retrying: true,
      error: {
        code: "unreachable",
        likelyCauses: expect.arrayContaining([
          "not_on_network",
          "tls_certificate",
        ]),
      },
    });
    await jest.advanceTimersByTimeAsync(999);
    expect(connect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1999);
    expect(connect).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(backend.status.kind).toBe("ready");
    expect(fake.reconnect).not.toHaveBeenCalled();
  } finally {
    backend.stop();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  }
});
test.each(["auth", "version"])(
  "terminal %s errors survive foreground without automatic retries",
  async (failure) => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    const fake = new FakeConnection();
    fake.haVersion = "2025.1";
    const connect =
      failure === "auth"
        ? jest.fn().mockRejectedValue(ERR_INVALID_AUTH)
        : jest.fn().mockResolvedValue(fake);
    const backend = new HomeAssistantBackend(
      {
        url: "https://home.example",
        token: "secret",
        allowInsecureHttp: false,
      },
      "one",
      { connect },
    );
    try {
      await backend.start().catch(() => undefined);
      const status = backend.status;
      await backend.setForeground(false);
      await backend.setForeground(true);
      await jest.advanceTimersByTimeAsync(90_000);
      expect(backend.status).toEqual(status);
      expect(backend.status).toMatchObject({ kind: "error", retrying: false });
      expect(connect).toHaveBeenCalledTimes(1);
      expect(fake.reconnect).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      backend.stop();
      jest.useRealTimers();
    }
  },
);
test("foreground ping failure always restarts heartbeat monitoring", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  const fake = new FakeConnection();
  const backend = make(fake);
  try {
    await backend.start();
    const ping = jest
      .spyOn(fake, "ping")
      .mockRejectedValue(new Error("dead socket"));
    await backend.setForeground(false);
    await backend.setForeground(true);
    expect(fake.reconnect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(ping).toHaveBeenCalledTimes(2);
    expect(fake.reconnect).toHaveBeenCalledTimes(2);
  } finally {
    backend.stop();
    jest.useRealTimers();
  }
});
test("stop cancels scheduled connection creation retries", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  const connect = jest.fn().mockRejectedValue(ERR_CANNOT_CONNECT);
  const backend = new HomeAssistantBackend(
    { url: "https://home.example", token: "secret", allowInsecureHttp: false },
    "one",
    { connect },
  );
  await backend.start().catch(() => undefined);
  backend.stop();
  await jest.advanceTimersByTimeAsync(90_000);
  expect(connect).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
test("a connection completing after stop is closed without publishing a snapshot", async () => {
  const fake = new FakeConnection();
  let resolve!: (connection: Connection) => void;
  const backend = new HomeAssistantBackend(
    { url: "https://home.example", token: "secret", allowInsecureHttp: false },
    "late",
    {
      connect: () =>
        new Promise<Connection>((done) => {
          resolve = done;
        }),
    },
  );
  const snapshot = jest.fn();
  backend.onSnapshot(snapshot);
  const starting = backend.start();
  backend.stop();
  resolve(fake as unknown as Connection);
  await starting;
  expect(fake.close).toHaveBeenCalledTimes(1);
  expect(snapshot).not.toHaveBeenCalled();
  expect(backend.status.kind).toBe("idle");
});
test("backgrounding during a foreground ping invalidates its eventual failure", async () => {
  const fake = new FakeConnection();
  const backend = make(fake);
  let reject!: (error: Error) => void;
  try {
    await backend.start();
    await backend.setForeground(false);
    jest.spyOn(fake, "ping").mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const foreground = backend.setForeground(true);
    await backend.setForeground(false);
    reject(new Error("late failure"));
    await foreground;
    expect(fake.reconnect).not.toHaveBeenCalled();
  } finally {
    backend.stop();
  }
});
test("disconnected transports use the library loop without starting a competing connection", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  const fake = new FakeConnection();
  const backend = make(fake);
  try {
    await backend.start();
    fake.connected = false;
    fake.fire("disconnected");
    await jest.advanceTimersByTimeAsync(90_000);
    expect(fake.reconnect).not.toHaveBeenCalled();
    expect(fake.close).not.toHaveBeenCalled();
    fake.connected = true;
    fake.fire("ready");
    await jest.advanceTimersByTimeAsync(0);
    expect(backend.status.kind).toBe("ready");
    expect(fake.subscriptions).toHaveLength(2);
  } finally {
    backend.stop();
    jest.useRealTimers();
  }
});
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
