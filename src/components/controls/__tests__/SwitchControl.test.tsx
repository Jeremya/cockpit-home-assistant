import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { SessionManager } from "../../../session/SessionManager";
import { Credentials } from "../../../services/credentials";
import { PreferencesStorage } from "../../../preferences/storage";
import {
  DemoBackend,
  type DemoOptions,
} from "../../../session/demo/DemoBackend";
import { useCockpit } from "../../../core/store";
import { DeviceDetailScreen } from "../../../screens/DeviceDetailScreen";
import { SwitchControl } from "../SwitchControl";
import type { CommandStore } from "../../../commands/store";

let mockManager: SessionManager;
let mockOptions: DemoOptions;
let mockBackend: DemoBackend;
let mockKey: string;
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ key: mockKey }),
}));
jest.mock("../../../session/demo/DemoBackend", () => {
  const actual = jest.requireActual("../../../session/demo/DemoBackend");
  return {
    ...actual,
    DemoBackend: jest.fn((id: string) => {
      mockBackend = new actual.DemoBackend(id, mockOptions);
      return mockBackend;
    }),
  };
});
jest.mock("../../../services/runtime", () => ({
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
    updatePreferences: jest.fn(),
  },
}));
jest.mock("../../../components/EntityIcon", () => ({
  ...jest.requireActual("../../../components/EntityIcon"),
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
let screen: Awaited<ReturnType<typeof renderAsync>>;
let listeners: Set<(state: AppStateStatus) => void>;
const on = () =>
  screen.getByRole("button", { name: "Turn Living room lamp on" });
const off = () =>
  screen.getByRole("button", { name: "Turn Living room lamp off" });
function savedPress() {
  let node = on();
  while (typeof node.props.onPress !== "function" && node.parent)
    node = node.parent;
  if (typeof node.props.onPress !== "function")
    throw new Error("Missing press handler");
  return node.props.onPress as () => void;
}
const state = () =>
  useCockpit.getState().snapshot!.entities["switch.living_lamp"]!.state;
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
async function setup(
  options: DemoOptions = {},
  key = "demo-switch.living_lamp",
) {
  mockKey = key;
  mockOptions = options;
  mockManager = new SessionManager(
    new Credentials(new MemoryStorage(), new MemoryStorage(), () => "fixture"),
    new PreferencesStorage(new MemoryStorage()),
  );
  await mockManager.connect({ demo: true });
  const dispatch = jest.spyOn(mockBackend, "callService");
  screen = await renderAsync(<DeviceDetailScreen />);
  return dispatch;
}
async function background(active: boolean) {
  await act(async () => {
    AppState.currentState = active ? "active" : "background";
    listeners.forEach((listener) => listener(AppState.currentState));
    await mockManager.setForeground(active);
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  AppState.currentState = "active";
  listeners = new Set();
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    });
  useCockpit.setState(useCockpit.getInitialState(), true);
});
afterEach(async () => {
  await screen?.unmountAsync();
  mockManager?.disconnect();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("explicit On/Off preserves observations until the demo reports an effect", async () => {
  const dispatch = await setup();
  expect(screen.getByText("Simulated power control")).toBeTruthy();
  expect(off()).toBeDisabled();
  expect(on()).not.toBeDisabled();
  fireEvent.press(on());
  expect(state()).toBe("off");
  expect(on().props.accessibilityState).toMatchObject({
    busy: true,
    disabled: true,
  });
  expect(screen.getByText("Simulated request is being sent.")).toBeTruthy();
  await advance(120);
  expect(state()).toBe("off");
  expect(
    screen.getByText(/accepted. Waiting for the reported state/),
  ).toBeTruthy();
  expect(on()).toBeDisabled();
  expect(off()).toBeDisabled();
  await advance(330);
  expect(state()).toBe("on");
  expect(on()).toBeDisabled();
  expect(off()).not.toBeDisabled();
  expect(
    screen.getByText("Simulated state observed after the request."),
  ).toBeTruthy();
  expect(dispatch).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole("button", { name: "Dismiss result" }));
  expect(screen.queryByTestId("switch-outcome")).toBeNull();
  fireEvent.press(off());
  await advance(450);
  expect(state()).toBe("off");
  expect(dispatch).toHaveBeenCalledTimes(2);
});
test("same-render repeated presses and accepted-but-unobserved presses send once", async () => {
  const dispatch = await setup();
  const press = savedPress();
  await act(async () => {
    press();
    press();
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
  await advance(120);
  await act(async () => press());
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test("state before acknowledgement remains an observation without premature success", async () => {
  await setup({
    scenario: () => ({
      acknowledgement: "accepted",
      acknowledgementAfterMs: 900,
      observationAfterMs: 100,
    }),
  });
  fireEvent.press(on());
  await advance(100);
  expect(state()).toBe("on");
  expect(screen.getByText("Simulated request is being sent.")).toBeTruthy();
  expect(off()).toBeDisabled();
  await advance(800);
  expect(
    screen.getByText("Simulated state observed after the request."),
  ).toBeTruthy();
});
test("rejection shows qualified simulated wording without rolling back a later state", async () => {
  await setup({
    scenario: () => ({
      acknowledgement: "rejected",
      acknowledgementAfterMs: 100,
      observationAfterMs: 1000,
    }),
  });
  fireEvent.press(on());
  await advance(100);
  expect(
    screen.getByText(/Simulated device rejected the request/),
  ).toBeTruthy();
  expect(state()).toBe("off");
  await advance(900);
  expect(state()).toBe("on");
});
test("unknown can reconcile late; no automatic retry is sent", async () => {
  const dispatch = await setup({
    scenario: () => ({
      acknowledgement: "timeout",
      acknowledgementAfterMs: 100,
      observationAfterMs: 1000,
    }),
  });
  fireEvent.press(on());
  await advance(100);
  expect(
    screen.getByText("Simulated result not confirmed. No automatic retry."),
  ).toBeTruthy();
  await advance(900);
  expect(screen.getByText(/Simulated state observed later/)).toBeTruthy();
  await advance(30_000);
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test("accepted without an observation expires with honest wording", async () => {
  const dispatch = await setup({
    scenario: () => ({
      acknowledgement: "accepted",
      acknowledgementAfterMs: 100,
      observationAfterMs: null,
    }),
  });
  fireEvent.press(on());
  await advance(15_000);
  expect(
    screen.getByText("Simulated result not confirmed. No automatic retry."),
  ).toBeTruthy();
  expect(state()).toBe("off");
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test.each(["unknown", "unavailable", "unexpected"])(
  "%s state disables both controls",
  async (value) => {
    const dispatch = await setup({
      initialState: { "switch.living_lamp": { state: value } },
    });
    expect(on()).toBeDisabled();
    expect(off()).toBeDisabled();
    fireEvent.press(on());
    expect(dispatch).not.toHaveBeenCalled();
  },
);
test("cached observations disable controls; returning ready does not send", async () => {
  const dispatch = await setup();
  await act(async () =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(on()).toBeDisabled();
  expect(
    screen.getByText("Wait for synchronization before using power control."),
  ).toBeTruthy();
  await act(async () => mockManager.refresh());
  expect(on()).not.toBeDisabled();
  expect(dispatch).not.toHaveBeenCalled();
});
test("background disables a stale press; foreground never replays a request", async () => {
  const dispatch = await setup();
  const press = savedPress();
  await background(false);
  await act(async () => press());
  expect(on()).toBeDisabled();
  expect(dispatch).not.toHaveBeenCalled();
  await background(true);
  expect(on()).not.toBeDisabled();
  fireEvent.press(on());
  await background(false);
  await advance(1000);
  await background(true);
  expect(state()).toBe("on");
  expect(dispatch).toHaveBeenCalledTimes(1);
});
test("a stale rendered press cannot operate a replacement session", async () => {
  const dispatch = await setup();
  const press = savedPress();
  await act(async () => mockManager.connect({ demo: true }));
  const replacement = jest.spyOn(mockBackend, "callService");
  await act(async () => press());
  await advance(1000);
  expect(dispatch).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
});
test("refresh invalidates a prepared press even when ready returns immediately", async () => {
  const dispatch = await setup();
  const press = savedPress();
  await act(async () => mockManager.refresh());
  await act(async () => press());
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.getByText(/connection changed/)).toBeTruthy();
  fireEvent.press(on());
  await advance(450);
  expect(dispatch).toHaveBeenCalledTimes(1);
});

test("an independent state change before a press produces no-op feedback without another service", async () => {
  const dispatch = await setup();
  const press = savedPress();
  const external = mockBackend.callService({
    domain: "switch",
    service: "turn_on",
    entityId: "switch.living_lamp",
  });
  await advance(450);
  await external;
  await act(async () => press());
  expect(screen.getByText("Already on.")).toBeTruthy();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(mockManager.commandStore.getState().records).toHaveLength(0);
});
test("other switches stay disabled and lock/fan/feeder readings get no control", async () => {
  const dispatch = await setup({}, "demo-switch.fridge_power_cool");
  expect(
    screen.getByText("Power control is available for the demo lamp only."),
  ).toBeTruthy();
  screen
    .getAllByRole("button")
    .filter((b) => /Turn Power cool/.test(b.props.accessibilityLabel ?? ""))
    .forEach((b) => expect(b).toBeDisabled());
  expect(dispatch).not.toHaveBeenCalled();
  for (const key of [
    "demo-lock.front_door",
    "demo-fan.office_vent",
    "demo-sensor.feeder_today",
  ]) {
    mockKey = key;
    await screen.rerenderAsync(<DeviceDetailScreen />);
    expect(screen.UNSAFE_queryByType(SwitchControl)).toBeNull();
  }
});
