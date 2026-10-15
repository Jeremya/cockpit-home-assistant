import { HomeAssistantBackend } from "../homeAssistant/HomeAssistantBackend";
import { DemoBackend } from "../demo/DemoBackend";
import { SessionManager } from "../SessionManager";
import { BackendEvents } from "../types";
import { Credentials } from "../../services/credentials";
import { PreferencesStorage } from "../../preferences/storage";
import { useCockpit } from "../../core/store";
import type { ConnectionSettings, SessionError } from "../../core/types";

jest.mock("../homeAssistant/HomeAssistantBackend", () => ({
  HomeAssistantBackend: jest.fn(),
}));
jest.mock("../demo/DemoBackend", () => ({ DemoBackend: jest.fn() }));
class MemoryStorage {
  values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}
class ControlledBackend extends BackendEvents {
  constructor(private failure?: SessionError) {
    super();
  }
  async start() {
    if (this.failure) {
      this.emitStatus({ kind: "error", error: this.failure, retrying: false });
      throw this.failure;
    }
    this.ready();
  }
  ready() {
    this.emitStatus({ kind: "ready", haVersion: "2026.10.1", readySince: "" });
  }
  stop() {}
  async resync() {}
  ping = jest.fn(async () => false);
  recover = jest.fn();
  async setForeground() {}
}
const a: ConnectionSettings = {
  url: "https://a.example",
  token: "token-a",
  allowInsecureHttp: false,
};
const b: ConnectionSettings = {
  url: "https://b.example",
  token: "token-b",
  allowInsecureHttp: false,
};
let manager: SessionManager;
function setup(failures: (SessionError | undefined)[] = []) {
  const credentials = new Credentials(
    new MemoryStorage(),
    new MemoryStorage(),
    (() => {
      let n = 0;
      return () => `id${++n}`;
    })(),
  );
  const preferences = new PreferencesStorage(new MemoryStorage());
  const backends: ControlledBackend[] = [];
  jest.mocked(HomeAssistantBackend).mockImplementation(() => {
    const backend = new ControlledBackend(failures.shift());
    backends.push(backend);
    return backend as unknown as HomeAssistantBackend;
  });
  jest
    .mocked(DemoBackend)
    .mockImplementation(
      () => new ControlledBackend() as unknown as DemoBackend,
    );
  manager = new SessionManager(credentials, preferences);
  return { credentials, preferences, backends };
}
beforeEach(() => {
  jest.resetAllMocks();
  useCockpit.setState(useCockpit.getInitialState(), true);
});
afterEach(() => manager?.disconnect());

test.each<SessionError>([
  { code: "auth_invalid" },
  { code: "ha_version_unsupported", haVersion: "2025.1" },
])(
  "foreground preserves terminal errors and recovery actions: %j",
  async (error) => {
    setup([error]);
    await expect(manager.connect(a)).rejects.toEqual(error);
    const before = useCockpit.getState().status;
    await manager.setForeground(false);
    await manager.setForeground(true);
    expect(useCockpit.getState().status).toEqual(before);
  },
);
test("Forget removes saved A after an unsuccessful attempt to connect to B", async () => {
  const { credentials } = setup([undefined, { code: "auth_invalid" }]);
  await manager.connect(a);
  await expect(manager.connect(b)).rejects.toMatchObject({
    code: "auth_invalid",
  });
  await manager.forget();
  expect(await credentials.load()).toBeNull();
});
test("Retry targets the requested HA when preferences failed before backend construction", async () => {
  const { preferences } = setup();
  jest
    .spyOn(preferences, "load")
    .mockRejectedValueOnce(new Error("disk failure"));
  await expect(manager.connect(b)).rejects.toThrow("disk failure");
  await manager.retry();
  expect(HomeAssistantBackend).toHaveBeenCalledWith(
    b,
    expect.any(String),
    expect.any(Object),
  );
  expect(DemoBackend).not.toHaveBeenCalled();
});
test("a saved connection recovering after failed start is persisted without a misleading storage notice", async () => {
  const { credentials, backends } = setup([
    { code: "unreachable", likelyCauses: ["not_on_network"] },
  ]);
  await credentials.save(a);
  await manager.bootstrap();
  expect(useCockpit.getState().notices).toEqual([]);
  backends[0]!.ready();
  expect(await credentials.load()).toEqual(a);
  expect(useCockpit.getState().status.kind).toBe("ready");
});
test("a newly requested connection recovering after failed start saves the new credentials", async () => {
  const { credentials, backends } = setup([
    { code: "unreachable", likelyCauses: ["not_on_network"] },
  ]);
  await expect(manager.connect(b)).rejects.toMatchObject({
    code: "unreachable",
  });
  expect(await credentials.load()).toBeNull();
  backends[0]!.ready();
  expect(await credentials.load()).toEqual(b);
});
test("Retry never chooses demo without an explicit demo attempt", async () => {
  setup();
  await manager.retry();
  expect(DemoBackend).not.toHaveBeenCalled();
  expect(HomeAssistantBackend).not.toHaveBeenCalled();
});
