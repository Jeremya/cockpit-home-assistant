import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { AppState } from "react-native";
import { router } from "expo-router";
import { SessionManager } from "../../session/SessionManager";
import { BackendEvents } from "../../session/types";
import { Credentials } from "../../services/credentials";
import { PreferencesStorage } from "../../preferences/storage";
import { DemoBackend, type DemoOptions } from "../../session/demo/DemoBackend";
import { useCockpit } from "../../core/store";
import { deviceSummaries } from "../../core/deviceSummaries";
import { entity, snapshot } from "../../commands/__tests__/fixtures";
import { profileIdFor } from "../../session/homeAssistant/url";
import type { CommandStore } from "../../commands/store";
import type { HomeSnapshot } from "../../core/types";
import { DeviceSummaryCard } from "../DeviceSummaryCard";
import { colors } from "../ui";

let mockManager: SessionManager;
let mockOptions: DemoOptions;
let mockDemo: DemoBackend;
let mockHa: ControlledBackend;
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../session/demo/DemoBackend", () => {
  const actual = jest.requireActual("../../session/demo/DemoBackend");
  return {
    ...actual,
    DemoBackend: jest.fn((id: string) => {
      mockDemo = new actual.DemoBackend(id, mockOptions);
      return mockDemo;
    }),
  };
});
jest.mock("../../session/homeAssistant/HomeAssistantBackend", () => ({
  HomeAssistantBackend: jest.fn(() => mockHa),
}));
jest.mock("../../services/runtime", () => ({
  commands: {
    capture: (key: string) => mockManager.commands.capture(key),
    setSwitch: (...args: Parameters<SessionManager["commands"]["setSwitch"]>) =>
      mockManager.commands.setSwitch(...args),
  },
  commandStore: {
    getState: () => mockManager.commandStore.getState(),
    getInitialState: () => mockManager.commandStore.getInitialState(),
    subscribe: (...args: Parameters<CommandStore["subscribe"]>) =>
      mockManager.commandStore.subscribe(...args),
  },
  session: {
    dismissCommand: (id: string) => mockManager.dismissCommand(id),
  },
}));
jest.mock("../EntityIcon", () => ({
  ...jest.requireActual("../EntityIcon"),
  Icon: () => null,
}));
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
function haHome() {
  const lamp = entity({ deviceId: "plug" });
  const other = entity({
    key: "other-lamp",
    entityId: "switch.other_lamp",
    name: "Other lamp",
    deviceId: "other-plug",
  });
  const result = snapshot([lamp, other]);
  for (const [id, name, value] of [
    ["plug", "Public lamp", lamp],
    ["other-plug", "Other lamp", other],
  ] as const) {
    result.devices[id] = {
      id,
      name,
      manufacturer: "TP-Link",
      model: "HS103",
      areaId: null,
      entityIds: [value.entityId],
    };
    result.registryEntries.push({
      id: value.key,
      entity_id: value.entityId,
      device_id: id,
      area_id: null,
      entity_category: null,
      hidden_by: null,
      disabled_by: null,
      name: null,
      platform: "tplink",
    });
  }
  return result;
}
class ControlledBackend extends BackendEvents {
  current: HomeSnapshot = haHome();
  async start() {
    this.emitSnapshot(this.current);
    this.emitStatus({ kind: "ready", haVersion: "2026.10.1", readySince: "" });
  }
  observe(next: HomeSnapshot) {
    this.current = next;
    this.emitSnapshot(next);
  }
  stop() {}
  async resync() {}
  async setForeground() {}
  async ping() {
    return true;
  }
  callService = jest.fn(async () => ({ kind: "accepted" as const }));
}
/** Home's inputs for one device card, read from the live store. */
const now = Date.parse("2026-10-16T12:00:00Z");
function Card({ deviceId }: { deviceId: string }) {
  const { snapshot: current, preferences, profileId, status } = useCockpit();
  if (!current || !profileId) return null;
  const ready = status.kind === "ready";
  const summary = deviceSummaries(current, preferences, profileId, ready).find(
    (group) => group.deviceId === deviceId,
  );
  return summary ? (
    <DeviceSummaryCard
      summary={summary}
      snapshot={current}
      ready={ready}
      now={now}
    />
  ) : null;
}
let screen: Awaited<ReturnType<typeof renderAsync>>;
const manager = () =>
  new SessionManager(
    new Credentials(new MemoryStorage(), new MemoryStorage(), () => "fixture"),
    new PreferencesStorage(new MemoryStorage()),
  );
async function demo(options: DemoOptions = {}) {
  mockOptions = options;
  mockManager = manager();
  await mockManager.connect({ demo: true });
  const dispatch = jest.spyOn(mockDemo, "callService");
  screen = await renderAsync(<Card deviceId="demo-plug" />);
  return dispatch;
}
async function homeAssistant(deviceId = "plug") {
  mockHa = new ControlledBackend();
  mockManager = manager();
  await mockManager.connect({
    url: "https://public.example",
    token: "fixture",
    allowInsecureHttp: false,
  });
  screen = await renderAsync(<Card deviceId={deviceId} />);
}
async function allow(key: string) {
  const captured = mockManager.commands.capture(key);
  if (captured.kind !== "captured") throw new Error(captured.message);
  await act(async () => {
    await mockManager.allowSwitch(captured.target);
  });
}
const open = () =>
  screen.getByRole("button", { name: "Open device: Living room lamp" });
const turn = (on: boolean) =>
  screen.getByRole("button", {
    name: `Turn Living room lamp ${on ? "on" : "off"}`,
  });
function savedPress(node = turn(true)) {
  while (typeof node.props.onPress !== "function" && node.parent)
    node = node.parent;
  return node.props.onPress as () => void;
}
const lampState = () =>
  useCockpit.getState().snapshot!.entities["switch.living_lamp"]!.state;
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  AppState.currentState = "active";
  useCockpit.setState(useCockpit.getInitialState(), true);
});
afterEach(async () => {
  await screen?.unmountAsync();
  mockManager?.disconnect();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("opening the detail and requesting power are separate targets", async () => {
  const dispatch = await demo();
  fireEvent.press(open());
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/appliance/[id]",
    params: { id: "demo-plug", profile: "demo" },
  });
  expect(dispatch).not.toHaveBeenCalled();
  fireEvent.press(turn(true));
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ service: "turn_on" }),
  );
  expect(router.push).toHaveBeenCalledTimes(1);
  // The open target holds no power control: the two targets are siblings.
  expect(
    open().findAll((node) =>
      /^Turn /.test(node.props.accessibilityLabel ?? ""),
    ),
  ).toHaveLength(0);
});

test("two synchronous presses from one render send once", async () => {
  const dispatch = await demo();
  const press = savedPress();
  await act(async () => {
    press();
    press();
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
});

test.each(["unknown", "unavailable"])(
  "%s power is unavailable without a guessed inverse",
  async (value) => {
    const dispatch = await demo({
      initialState: { "switch.living_lamp": { state: value } },
    });
    const action = screen.getByRole("button", {
      name: "Living room lamp power unavailable",
    });
    expect(action).toBeDisabled();
    expect(screen.getByText("Power unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Turn / })).toBeNull();
    fireEvent.press(action);
    expect(dispatch).not.toHaveBeenCalled();
  },
);

test("cached and background states disable the action with an explanation", async () => {
  const dispatch = await demo();
  const press = savedPress();
  await act(async () =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(turn(true)).toBeDisabled();
  expect(
    screen.getByText("Wait for synchronization before using power control."),
  ).toBeTruthy();
  await act(async () => press());
  await act(async () => mockManager.refresh());
  expect(turn(true)).not.toBeDisabled();
  AppState.currentState = "background";
  await act(async () => savedPress()());
  expect(dispatch).not.toHaveBeenCalled();
});

test("a callback from an older session or epoch is refused", async () => {
  const dispatch = await demo();
  const press = savedPress();
  await act(async () => mockManager.refresh());
  await act(async () => press());
  expect(dispatch).not.toHaveBeenCalled();
  const replaced = savedPress();
  await act(async () => mockManager.connect({ demo: true }));
  const replacement = jest.spyOn(mockDemo, "callService");
  await act(async () => replaced());
  await advance(1000);
  expect(dispatch).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
});

test("acknowledgement without observation leaves the observed state and says so", async () => {
  const dispatch = await demo({
    scenario: () => ({
      acknowledgement: "accepted",
      acknowledgementAfterMs: 100,
      observationAfterMs: null,
    }),
  });
  fireEvent.press(turn(true));
  await advance(120);
  expect(lampState()).toBe("off");
  expect(screen.getByText("Off").props.style).toContainEqual({
    color: colors.muted,
  });
  expect(turn(true)).toBeDisabled();
  expect(
    screen.getByText(/accepted\. Waiting for the reported state/),
  ).toBeTruthy();
  await advance(15_000);
  expect(
    screen.getByText(/Simulated result not confirmed\. No automatic retry\./),
  ).toBeTruthy();
  expect(screen.getByText("Off")).toBeTruthy();
  expect(dispatch).toHaveBeenCalledTimes(1);
  fireEvent.press(
    screen.getByRole("button", { name: "Dismiss result for Living room lamp" }),
  );
  expect(screen.queryByTestId("card-switch-outcome")).toBeNull();
});

test("an external On observation changes the headline and the next intent", async () => {
  const dispatch = await demo();
  expect(screen.getByText("Off")).toBeTruthy();
  const external = mockDemo.callService({
    domain: "switch",
    service: "turn_on",
    entityId: "switch.living_lamp",
  });
  await advance(450);
  await act(async () => {
    await external;
  });
  expect(screen.getByText("On").props.style).toContainEqual({
    color: colors.warning,
  });
  expect(
    screen.queryByRole("button", { name: "Turn Living room lamp on" }),
  ).toBeNull();
  fireEvent.press(turn(false));
  expect(dispatch).toHaveBeenLastCalledWith(
    expect.objectContaining({ service: "turn_off" }),
  );
});

test("Home Assistant action needs this device's grant and leaves with revocation", async () => {
  await homeAssistant();
  const action = () =>
    screen.queryByRole("button", { name: "Turn Public lamp on" });
  expect(action()).toBeNull();
  expect(
    screen.getByRole("button", { name: "Open device: Public lamp" }),
  ).toBeTruthy();
  await allow("stable-lamp");
  await act(async () => fireEvent.press(action()!));
  expect(mockHa.callService).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  await act(async () => {
    await mockManager.revokeSwitch(
      useCockpit.getState().profileId!,
      "stable-lamp",
    );
  });
  expect(action()).toBeNull();
  // The result of the request already sent stays readable for this identity.
  expect(
    screen.getByText(/Request accepted\. Waiting for the reported state/),
  ).toBeTruthy();
  expect(mockHa.callService).toHaveBeenCalledTimes(1);
});

test("another HS103 and an ambiguous device get no card action", async () => {
  await homeAssistant("other-plug");
  await allow("stable-lamp");
  expect(screen.queryByRole("button", { name: /^Turn Other lamp/ })).toBeNull();
  await screen.rerenderAsync(<Card deviceId="plug" />);
  expect(
    screen.getByRole("button", { name: "Turn Public lamp on" }),
  ).toBeTruthy();
  const ambiguous = haHome();
  const sibling = entity({
    key: "sibling",
    entityId: "switch.sibling",
    deviceId: "plug",
  });
  ambiguous.entities[sibling.entityId] = sibling;
  ambiguous.devices.plug!.entityIds.push(sibling.entityId);
  await act(async () => mockHa.observe(ambiguous));
  expect(screen.queryByRole("button", { name: /^Turn / })).toBeNull();
  expect(mockHa.callService).not.toHaveBeenCalled();
  expect(profileIdFor("https://public.example")).toBe(
    useCockpit.getState().profileId,
  );
});
