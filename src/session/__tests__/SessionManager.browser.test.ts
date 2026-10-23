import { HomeAssistantBackend } from "../homeAssistant/HomeAssistantBackend";
import { DemoBackend } from "../demo/DemoBackend";
import { SessionManager } from "../SessionManager";
import { BackendEvents } from "../types";
import type { ServiceCall, ServiceCallResult } from "../types";
import { Credentials } from "../../services/credentials";
import { PreferencesStorage } from "../../preferences/storage";
import { useCockpit } from "../../core/store";
import type {
  ConnectionSettings,
  HomeSnapshot,
  SessionError,
} from "../../core/types";
import {
  entity,
  snapshot as basicSnapshot,
} from "../../commands/__tests__/fixtures";
import { profileIdFor } from "../homeAssistant/url";
import sample from "../../spatial/sample-plan.json";
import { parseHousePlan } from "../../spatial/model";
import {
  BrowserAuthorization,
  type BrowserSignIn,
} from "../../services/auth/authorization";
import { createAuthChannel } from "../../services/auth/authChannel";
import type { RememberedSession } from "../../services/auth/authStore";
import {
  GrantPrincipals,
  PRINCIPALS_KEY,
  principalFor,
} from "../../services/auth/principals";
import type { WebAuth } from "../../services/auth/webAuth";
import { memoryAuthStore } from "../../services/auth/__tests__/memoryAuthStore";

jest.mock("../homeAssistant/HomeAssistantBackend", () => ({
  HomeAssistantBackend: jest.fn(),
}));
jest.mock("../demo/DemoBackend", () => ({ DemoBackend: jest.fn() }));
const mockHouse = parseHousePlan(sample)!;
jest.mock("../../spatial/plans", () => ({ houseForMode: () => mockHouse }));

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
/** BroadcastChannel delivery: every other instance with the same name. */
class FakeChannel {
  static open: FakeChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.open)
      if (other !== this && other.name === this.name)
        other.onmessage?.({ data: structuredClone(data) });
  }
}
const Channel = FakeChannel as unknown as typeof BroadcastChannel;

const url = "https://a.example";
const profile = profileIdFor(url);
const clientId = "https://maurice.example/";
const token: ConnectionSettings = {
  url,
  token: "token-a",
  allowInsecureHttp: false,
};
type Hook = {
  onUser?: (userId: string) => Promise<void>;
  verifyUser?: boolean;
};
/** Reports `userId` to the session hook before its first snapshot, like HA. */
class UserBackend extends BackendEvents {
  constructor(
    readonly input: unknown,
    readonly options: Hook,
    readonly userId: string,
    private failure?: SessionError,
  ) {
    super();
  }
  async start() {
    this.emitStatus({ kind: "authenticating" });
    if (this.failure) {
      const retrying = this.failure.code === "unreachable";
      this.emitStatus({ kind: "error", error: this.failure, retrying });
      throw this.failure;
    }
    try {
      await this.options.onUser?.(this.userId);
    } catch (error) {
      this.emitStatus({
        kind: "error",
        error: error as SessionError,
        retrying: false,
      });
      throw error;
    }
    this.ready();
  }
  /** The backend's own retry: the user check runs again before the first sync. */
  async recover() {
    await this.options.onUser?.(this.userId);
    this.ready();
  }
  ready() {
    this.emitSnapshot(snapshot());
    this.emitStatus({ kind: "ready", haVersion: "2026.10.1", readySince: "" });
  }
  fail(error: SessionError, retrying = false) {
    this.emitStatus({ kind: "error", error, retrying });
  }
  stop() {}
  async resync() {}
  async setForeground() {}
  callService = jest.fn<Promise<ServiceCallResult>, [ServiceCall]>(
    async () => ({ kind: "accepted" }),
  );
}
function snapshot(): HomeSnapshot {
  const home = basicSnapshot([entity({ deviceId: "public-plug" })]);
  home.devices["public-plug"] = {
    id: "public-plug",
    name: "Public lamp",
    manufacturer: "TP-Link",
    model: "HS103",
    areaId: null,
    entityIds: ["switch.lamp"],
  };
  home.registryEntries.push({
    id: "stable-lamp",
    entity_id: "switch.lamp",
    device_id: "public-plug",
    area_id: null,
    entity_category: null,
    hidden_by: null,
    disabled_by: null,
    name: null,
    platform: "tplink",
  });
  return home;
}

let manager: SessionManager;
let world: ReturnType<typeof createWorld>;
/** Storage shared by every "page" of one browser profile. */
function createWorld() {
  return {
    prefStore: new MemoryStorage(),
    principalStore: new MemoryStorage(),
    auth: memoryAuthStore(),
    revoked: jest.fn(async (_hassUrl: string, _token: string) => ({
      kind: "revoked" as const,
    })),
    restored: [] as BrowserAuthorization[],
    users: [] as string[],
    failures: [] as (SessionError | undefined)[],
    backends: [] as UserBackend[],
  };
}
/** One page: its own manager and channel over the shared browser storage. */
function page(options: { store?: boolean } = {}) {
  manager?.disconnect();
  // The previous page is gone, with its channel.
  FakeChannel.open = [];
  useCockpit.setState(useCockpit.getInitialState(), true);
  const preferences = new PreferencesStorage(world.prefStore);
  const principals = new GrantPrincipals(world.principalStore);
  const web: WebAuth = {
    ...(options.store === false ? {} : { store: world.auth.store }),
    channel: createAuthChannel(Channel),
    principals,
    restore: (session) => {
      if (session.clientId !== clientId) return undefined;
      const authorization = new BrowserAuthorization(
        {
          hassUrl: session.hassUrl,
          clientId: session.clientId,
          access_token: "",
          refresh_token: session.refreshToken,
          expires_in: 0,
          expires: 0,
        },
        { fetch: jest.fn(async () => new Response("", { status: 200 })) },
      );
      authorization.remembered = true;
      world.restored.push(authorization);
      return {
        url: session.hassUrl,
        allowInsecureHttp: session.allowInsecureHttp,
        authorization,
        rememberedPrincipal: session.principal,
      };
    },
    revoke: world.revoked,
  };
  manager = new SessionManager(
    new Credentials(new MemoryStorage(), new MemoryStorage(), () => "id"),
    preferences,
    web,
  );
  return { preferences, principals, web };
}
function signIn(options: { remember?: boolean; refreshToken?: string } = {}) {
  const revoke = jest.fn(async () => new Response("", { status: 200 }));
  const value: BrowserSignIn = {
    url,
    allowInsecureHttp: false,
    authorization: new BrowserAuthorization(
      {
        hassUrl: url,
        clientId,
        access_token: "public-access",
        refresh_token: options.refreshToken ?? "public-refresh",
        expires_in: 1800,
        expires: Date.now() + 1_800_000,
      },
      { fetch: revoke as unknown as typeof fetch },
    ),
    ...(options.remember ? { remember: true } : {}),
  };
  return { revoke, signIn: value };
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};
const backend = () => world.backends.at(-1)!;
const otherTab = () => createAuthChannel(Channel);
function capture() {
  const result = manager.commands.capture("stable-lamp");
  if (result.kind !== "captured") throw new Error(result.reason);
  return result.target;
}
async function grantedBy(user: string) {
  world.users.push(user);
  page();
  await manager.connect(token);
  await settle();
  expect(await manager.allowSwitch(capture())).toBe(true);
}
const grants = async (preferences: PreferencesStorage) =>
  Object.keys(
    (await preferences.load()).file.profiles[profile]?.switchEnrollments ?? {},
  );
const record = (overrides: Partial<RememberedSession> = {}) =>
  world.auth.sessions.get(profile) as RememberedSession | undefined;

beforeEach(() => {
  jest.resetAllMocks();
  FakeChannel.open = [];
  world = createWorld();
  jest
    .mocked(HomeAssistantBackend)
    .mockImplementation((input: unknown, _id: string, options?: unknown) => {
      const made = new UserBackend(
        input,
        (options ?? {}) as Hook,
        world.users.shift() ?? "user-alice",
        world.failures.shift(),
      );
      world.backends.push(made);
      return made as unknown as HomeAssistantBackend;
    });
  jest
    .mocked(DemoBackend)
    .mockImplementation(
      () => new UserBackend(undefined, {}, "demo") as unknown as DemoBackend,
    );
});
afterEach(() => manager?.disconnect());

describe("remembering a browser sign-in", () => {
  test("without the opt-in nothing durable is written and a reload asks to sign in", async () => {
    page();
    await manager.connect(signIn().signIn);
    await settle();
    expect(useCockpit.getState().status.kind).toBe("ready");
    expect(manager.browserSession).toBe("memory");
    expect(world.auth.sessions.size).toBe(0);
    page();
    await manager.bootstrap();
    expect(HomeAssistantBackend).toHaveBeenCalledTimes(1);
    expect(useCockpit.getState()).toMatchObject({
      initialized: true,
      profileId: null,
    });
  });

  test("with the opt-in, only the refresh token is kept, after the user check and a fresh snapshot", async () => {
    page();
    const { signIn: value } = signIn({ remember: true });
    let atReady: number | undefined;
    useCockpit.subscribe((state) => {
      if (state.status.kind === "ready" && atReady === undefined)
        atReady = world.auth.calls.filter((c) => c === "remember").length;
    });
    await manager.connect(value);
    await settle();
    expect(atReady).toBe(0);
    expect(record()).toEqual({
      version: 1,
      profileId: profile,
      hassUrl: url,
      clientId,
      allowInsecureHttp: false,
      principal: await principalFor(url, "user-alice"),
      refreshToken: "public-refresh",
      rememberedAt: expect.any(Number),
    });
    expect(JSON.stringify(record())).not.toContain("public-access");
    expect(value.authorization.remembered).toBe(true);
    expect(manager.browserSession).toBe("remembered");
    expect(JSON.stringify(useCockpit.getState())).not.toContain(
      "public-refresh",
    );
  });

  test("closing and reopening the browser reconnects the same profile, then takes a fresh snapshot", async () => {
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    const remembered = record()!.rememberedAt;
    page();
    await manager.bootstrap();
    await settle();
    const restored = world.restored[0]!;
    expect(HomeAssistantBackend).toHaveBeenLastCalledWith(
      expect.objectContaining({ url, authorization: restored }),
      expect.any(String),
      expect.objectContaining({ verifyUser: true }),
    );
    expect(restored.auth.expired).toBe(true);
    expect(useCockpit.getState()).toMatchObject({
      profileId: profile,
      status: { kind: "ready" },
      snapshot: expect.objectContaining({ sessionId: "test-session" }),
    });
    expect(manager.browserSession).toBe("remembered");
    // Refreshing never writes: the record is the one written at sign-in.
    expect(record()!.rememberedAt).toBe(remembered);
    expect(world.auth.calls.filter((c) => c === "remember")).toHaveLength(1);
  });

  test("a sign-in whose first synchronization fails is not remembered until it is ready", async () => {
    world.failures.push({ code: "unreachable", likelyCauses: ["dns"] });
    page();
    await expect(
      manager.connect(signIn({ remember: true }).signIn),
    ).rejects.toMatchObject({ code: "unreachable" });
    await settle();
    expect(world.auth.sessions.size).toBe(0);
    await backend().recover();
    await settle();
    expect(record()?.refreshToken).toBe("public-refresh");
  });

  test.each([
    ["the write fails", { store: true, fail: true }],
    ["this browser has no IndexedDB", { store: false, fail: false }],
  ])(
    "when %s, the page stays signed in for this page only and says so",
    async (_, options) => {
      page({ store: options.store });
      if (options.fail) world.auth.failing.add("remember");
      const { signIn: value } = signIn({ remember: true });
      await manager.connect(value);
      await settle();
      expect(useCockpit.getState().status.kind).toBe("ready");
      expect(manager.browserSession).toBe("memory");
      expect(value.authorization.remembered).toBe(false);
      expect(useCockpit.getState().notices).toContain(
        "This browser could not remember the sign-in. You stay signed in on this page only.",
      );
      expect(JSON.stringify(useCockpit.getState().notices)).not.toContain(
        "public-refresh",
      );
    },
  );

  test("a new remembered sign-in replaces the old record and revokes the token it held", async () => {
    page();
    await manager.connect(
      signIn({ remember: true, refreshToken: "old-refresh" }).signIn,
    );
    await settle();
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    expect(record()?.refreshToken).toBe("public-refresh");
    expect(world.revoked).toHaveBeenCalledWith(url, "old-refresh");
  });

  test("a remembered sign-in replaced in this page is released, not revoked", async () => {
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    page();
    await manager.bootstrap();
    await settle();
    const restored = world.restored[0]!;
    const revoke = jest.spyOn(restored, "close");
    await manager.connect({ demo: true });
    expect(restored.closed).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
    expect(record()?.refreshToken).toBe("public-refresh");
  });
});

describe("ending a remembered sign-in", () => {
  test("Sign out tears down first, deletes the record, tells other tabs without a token, then revokes", async () => {
    page();
    const { signIn: value, revoke } = signIn({ remember: true });
    await manager.connect(value);
    await settle();
    const target = capture();
    const heard: unknown[] = [];
    otherTab().subscribe((message) => heard.push(message));
    let atRevocation: unknown;
    revoke.mockImplementationOnce(async () => {
      atRevocation = {
        record: world.auth.sessions.has(profile),
        heard: heard.length,
        profileId: useCockpit.getState().profileId,
      };
      return new Response("", { status: 200 });
    });
    expect(await manager.signOut()).toEqual({ kind: "revoked" });
    expect(atRevocation).toEqual({ record: false, heard: 1, profileId: null });
    expect(heard).toEqual([{ type: "signed-out", profileId: profile }]);
    expect(world.auth.seqs.get(profile)).toBe(1);
    expect(manager.commands.setSwitch(target, true).kind).toBe("refused");
    expect(manager.browserSession).toBeUndefined();
  });

  test("signing out during the remember write leaves no secret behind", async () => {
    page();
    const { signIn: value } = signIn({ remember: true });
    const release = world.auth.hold();
    await manager.connect(value);
    await settle();
    const signingOut = manager.signOut();
    release();
    await signingOut;
    await settle();
    expect(world.auth.sessions.size).toBe(0);
    expect(value.authorization.closed).toBe(true);
    expect(value.authorization.refreshToken).toBeUndefined();
  });

  test("a sign-out elsewhere after this sign-in started wins over its late write", async () => {
    page();
    const { signIn: value, revoke } = signIn({ remember: true });
    const release = world.auth.hold();
    const connecting = manager.connect(value);
    // Another tab signs out (its message is lost); its transaction runs first
    // after this sign-in read the sequence.
    void world.auth.store.signOut(profile);
    release();
    await connecting;
    await settle();
    expect(world.auth.sessions.size).toBe(0);
    expect(value.authorization.closed).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(useCockpit.getState()).toMatchObject({ profileId: null });
    expect(useCockpit.getState().notices).toContain(
      "Signed out of Home Assistant in another tab.",
    );
  });

  test("a sign-out in another tab ends this tab's session of that profile only", async () => {
    page();
    const { signIn: value, revoke } = signIn();
    await manager.connect(value);
    await settle();
    const target = capture();
    otherTab().post({ type: "signed-out", profileId: "ha:https://b.example" });
    expect(useCockpit.getState().status.kind).toBe("ready");
    otherTab().post({ type: "signed-out", profileId: profile });
    expect(useCockpit.getState()).toMatchObject({
      profileId: null,
      status: { kind: "idle" },
    });
    expect(manager.commands.setSwitch(target, true).kind).toBe("refused");
    expect(value.authorization.closed).toBe(true);
    await settle();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(backend().callService).not.toHaveBeenCalled();
  });

  test("Stop remembering deletes the record only; this page stays signed in until it closes", async () => {
    page();
    const { signIn: value } = signIn({ remember: true });
    await manager.connect(value);
    await settle();
    expect(await manager.stopRemembering()).toBe(true);
    expect(world.auth.sessions.size).toBe(0);
    expect(useCockpit.getState().status.kind).toBe("ready");
    expect(manager.browserSession).toBe("memory");
    // Unload revokes it from now on, like any memory sign-in.
    expect(value.authorization.closeForUnload()).toBeDefined();
  });

  test("Stop remembering that cannot delete the record keeps the session remembered", async () => {
    page();
    const { signIn: value } = signIn({ remember: true });
    await manager.connect(value);
    await settle();
    world.auth.failing.add("remove");
    expect(await manager.stopRemembering()).toBe(false);
    expect(manager.browserSession).toBe("remembered");
    expect(value.authorization.closeForUnload()).toBeUndefined();
  });

  test("Forget removes the remembered sign-in too, and signs out other tabs", async () => {
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    const heard = jest.fn();
    otherTab().subscribe(heard);
    await manager.forget();
    expect(world.auth.sessions.size).toBe(0);
    expect(heard).toHaveBeenCalledWith({
      type: "signed-out",
      profileId: profile,
    });
  });

  test("a revoked remembered sign-in is removed and asks for an explicit sign-in, without a loop", async () => {
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    world.failures.push({ code: "auth_invalid" });
    page();
    await manager.bootstrap();
    await settle();
    expect(world.auth.sessions.size).toBe(0);
    expect(world.restored[0]!.closed).toBe(true);
    expect(useCockpit.getState().notices).toContain(
      "The sign-in this browser remembered is no longer valid. Sign in again.",
    );
    const constructed = jest.mocked(HomeAssistantBackend).mock.calls.length;
    await manager.retry();
    expect(jest.mocked(HomeAssistantBackend).mock.calls.length).toBe(
      constructed,
    );
  });

  test("an ended remembered sign-in never deletes a newer record from another tab", async () => {
    page();
    await manager.connect(
      signIn({ remember: true, refreshToken: "old-refresh" }).signIn,
    );
    await settle();
    page();
    await manager.bootstrap();
    await settle();
    world.auth.sessions.set(profile, {
      ...record()!,
      refreshToken: "newer-refresh",
    });
    backend().fail({ code: "auth_invalid" });
    await settle();
    expect(record()?.refreshToken).toBe("newer-refresh");
  });

  test("Home Assistant absent at launch keeps the record and the backend's own retrying error", async () => {
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    world.failures.push({
      code: "unreachable",
      likelyCauses: ["server_stopped"],
    });
    page();
    await manager.bootstrap();
    await settle();
    expect(useCockpit.getState().status).toMatchObject({
      kind: "error",
      retrying: true,
    });
    expect(world.restored[0]!.closed).toBe(false);
    expect(record()?.refreshToken).toBe("public-refresh");
    backend().ready();
    expect(useCockpit.getState().status.kind).toBe("ready");
  });

  test("a remembered sign-in that comes back as another HA user is refused and removed", async () => {
    page();
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    world.users.push("user-bob");
    page();
    await manager.bootstrap();
    await settle();
    expect(useCockpit.getState().status).toMatchObject({
      kind: "error",
      error: { code: "auth_invalid" },
    });
    expect(world.auth.sessions.size).toBe(0);
  });

  test("an unreadable record is deleted and reported without its contents", async () => {
    world.auth.sessions.set(profile, {
      ...(await rememberedRecord()),
      accessToken: "public-access",
    });
    page();
    await manager.bootstrap();
    expect(HomeAssistantBackend).not.toHaveBeenCalled();
    expect(world.auth.sessions.size).toBe(0);
    const notices = useCockpit.getState().notices;
    expect(notices).toContain(
      "The sign-in this browser remembered could not be read and was removed. Sign in again.",
    );
    expect(JSON.stringify(notices)).not.toContain("public-");
  });

  test("unreadable auth storage at launch still allows a sign-in for this page", async () => {
    world.auth.failing.add("latest");
    page();
    await manager.bootstrap();
    expect(useCockpit.getState()).toMatchObject({ initialized: true });
    expect(useCockpit.getState().notices).toContain(
      "The sign-in this browser remembered could not be read. Sign in again.",
    );
    await manager.connect(signIn().signIn);
    await settle();
    expect(useCockpit.getState().status.kind).toBe("ready");
  });
});

async function rememberedRecord(): Promise<RememberedSession> {
  return {
    version: 1,
    profileId: profile,
    hassUrl: url,
    clientId,
    allowInsecureHttp: false,
    principal: await principalFor(url, "user-alice"),
    refreshToken: "public-refresh",
    rememberedAt: 1,
  };
}

describe("power permissions belong to the verified HA user (web)", () => {
  const reset = {
    unknown:
      "Power permissions for this home were reset because the Home Assistant user who allowed them is unknown. Allow devices again if needed.",
    other:
      "Power permissions for this home were reset because a different Home Assistant user signed in.",
  };
  test("the first web session records its user; the same user keeps the exact grant", async () => {
    await grantedBy("user-alice");
    expect(
      JSON.parse(world.principalStore.values.get(PRINCIPALS_KEY)!),
    ).toEqual({
      version: 1,
      principals: { [profile]: await principalFor(url, "user-alice") },
    });
    expect(JSON.stringify([...world.principalStore.values])).not.toContain(
      "user-alice",
    );
    world.users.push("user-alice");
    const { preferences } = page();
    await manager.connect(token);
    await settle();
    expect(await grants(preferences)).toEqual(["stable-lamp"]);
    expect(manager.commands.setSwitch("stable-lamp", true).kind).toBe(
      "started",
    );
    expect(useCockpit.getState().notices).toEqual([]);
  });

  test("another HA user on the same home keeps the plan but not the grants", async () => {
    await grantedBy("user-alice");
    manager.updatePreferences((p) => ({ ...p, favorites: ["stable-lamp"] }));
    await settle();
    world.users.push("user-bob");
    const { preferences } = page();
    await manager.connect(signIn().signIn);
    await settle();
    expect(await grants(preferences)).toEqual([]);
    expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
    expect(useCockpit.getState().preferences.favorites).toEqual([
      "stable-lamp",
    ]);
    expect(useCockpit.getState().preferences.spatial.plan).not.toBeNull();
    expect(useCockpit.getState().notices).toContain(reset.other);
    expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
      kind: "refused",
      reason: "not_authorized",
    });
    // Bob may allow it for himself; Alice then starts again from nothing.
    expect(await manager.allowSwitch(capture())).toBe(true);
    world.users.push("user-alice");
    page();
    await manager.connect(token);
    await settle();
    expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
  });

  test("grants made before the principal rule are reset once, with a notice that names it", async () => {
    const { preferences } = page();
    await preferences.saveProfile(profile, {
      ...preferences.defaults(),
      favorites: ["stable-lamp"],
      switchEnrollments: {
        "stable-lamp": {
          profileId: profile,
          entityKey: "stable-lamp",
          deviceId: "public-plug",
          platform: "tplink",
          manufacturer: "TP-Link",
          model: "HS103",
          capability: "switch",
        },
      },
    });
    await manager.connect(token);
    await settle();
    expect(await grants(preferences)).toEqual([]);
    expect(useCockpit.getState().preferences.favorites).toEqual([
      "stable-lamp",
    ]);
    expect(useCockpit.getState().notices).toEqual([reset.unknown]);
    // Nothing left to reset: the next session is quiet.
    page();
    await manager.connect(token);
    await settle();
    expect(useCockpit.getState().notices).toEqual([]);
  });

  test("a crash between revocation and the principal write only repeats a harmless revocation", async () => {
    await grantedBy("user-alice");
    world.users.push("user-bob");
    const { principals, preferences } = page();
    jest
      .spyOn(principals, "set")
      .mockRejectedValueOnce(new Error("crash before the principal write"));
    await manager.connect(token);
    await settle();
    expect(await grants(preferences)).toEqual([]);
    expect(await principals.get(profile)).toBe(
      await principalFor(url, "user-alice"),
    );
    expect(useCockpit.getState().notices).toContain(
      "Power control is unavailable: this browser could not save which Home Assistant user may use it. Reconnect to try again.",
    );
    expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
      reason: "not_authorized",
    });
    expect(await manager.allowSwitch(capture())).toBe(false);
    // Next start: nothing to revoke any more, the principal is written.
    world.users.push("user-bob");
    page();
    await manager.connect(token);
    await settle();
    expect(useCockpit.getState().notices).toEqual([]);
    expect(await principals.get(profile)).toBe(
      await principalFor(url, "user-bob"),
    );
    expect(await manager.allowSwitch(capture())).toBe(true);
  });

  test("a failed revocation write keeps power control off and the principal unchanged", async () => {
    await grantedBy("user-alice");
    world.users.push("user-bob");
    const { principals, preferences } = page();
    jest
      .spyOn(preferences, "saveProfile")
      .mockRejectedValue(new Error("disk full"));
    await manager.connect(token);
    await settle();
    expect(await principals.get(profile)).toBe(
      await principalFor(url, "user-alice"),
    );
    expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
      reason: "not_authorized",
    });
    expect(await manager.allowSwitch(capture())).toBe(false);
  });

  test("commands wait for the principal, even when the backend is already ready", async () => {
    await grantedBy("user-alice");
    let bind!: Promise<void>;
    jest
      .mocked(HomeAssistantBackend)
      .mockImplementationOnce(
        (input: unknown, _id: string, options?: unknown) => {
          const made = new UserBackend(input, {}, "user-alice");
          made.start = async () => {
            bind = (options as Hook).onUser!("user-alice");
            made.ready();
          };
          world.backends.push(made);
          return made as unknown as HomeAssistantBackend;
        },
      );
    const { principals } = page();
    let write!: () => void;
    jest.spyOn(principals, "get").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          write = () => resolve(undefined);
        }),
    );
    await manager.connect(token);
    await settle();
    expect(useCockpit.getState().status.kind).toBe("ready");
    expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
      reason: "not_authorized",
    });
    write();
    await bind;
    await settle();
    // Unknown principal: the grant is reset before power control opens.
    expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
    expect(await manager.allowSwitch(capture())).toBe(true);
  });

  test("a reset in another tab turns power control off here and drops this page's grants", async () => {
    await grantedBy("user-alice");
    const { preferences } = {
      preferences: new PreferencesStorage(world.prefStore),
    };
    const before = await grants(preferences);
    // A tab of the same user changes nothing.
    otherTab().post({
      type: "principal-changed",
      profileId: profile,
      principal: await principalFor(url, "user-alice"),
    });
    expect(manager.commands.setSwitch("stable-lamp", true).kind).toBe(
      "started",
    );
    otherTab().post({
      type: "principal-changed",
      profileId: profile,
      principal: await principalFor(url, "user-bob"),
    });
    expect(manager.commands.setSwitch("stable-lamp", false)).toMatchObject({
      reason: "not_authorized",
    });
    expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
    expect(await manager.allowSwitch(capture())).toBe(false);
    expect(await grants(preferences)).toEqual(before);
    expect(useCockpit.getState().notices).toContain(
      "Power permissions for this home were reset in another tab because a different Home Assistant user signed in. Reconnect to use power control here.",
    );
  });

  test("allowing a device checks that this browser still records the same HA user", async () => {
    await grantedBy("user-alice");
    await manager.revokeSwitch(profile, "stable-lamp");
    await new GrantPrincipals(world.principalStore).set(
      profile,
      await principalFor(url, "user-bob"),
    );
    expect(await manager.allowSwitch(capture())).toBe(false);
    expect(manager.commands.setSwitch("stable-lamp", true)).toMatchObject({
      reason: "not_authorized",
    });
    expect(useCockpit.getState().notices).toContain(
      "Power permissions for this home were reset in another tab because a different Home Assistant user signed in. Reconnect to use power control here.",
    );
  });

  test("signing in, refreshing and signing out never create a grant", async () => {
    page();
    const { preferences } = {
      preferences: new PreferencesStorage(world.prefStore),
    };
    await manager.connect(signIn({ remember: true }).signIn);
    await settle();
    await manager.signOut();
    await settle();
    expect(await grants(preferences)).toEqual([]);
  });

  test("native keeps grants per profile without any user check", async () => {
    manager = new SessionManager(
      new Credentials(new MemoryStorage(), new MemoryStorage(), () => "id"),
      new PreferencesStorage(world.prefStore),
    );
    await manager.connect(token);
    expect(
      jest.mocked(HomeAssistantBackend).mock.calls[0]![2],
    ).not.toHaveProperty("onUser");
    await settle();
    expect(await manager.allowSwitch(capture())).toBe(true);
    expect(world.principalStore.values.size).toBe(0);
  });
});
