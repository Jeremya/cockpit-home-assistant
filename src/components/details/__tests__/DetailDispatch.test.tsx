import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { AppState } from "react-native";
import { SessionManager } from "../../../session/SessionManager";
import { Credentials } from "../../../services/credentials";
import { PreferencesStorage } from "../../../preferences/storage";
import { DemoBackend } from "../../../session/demo/DemoBackend";
import { useCockpit } from "../../../core/store";
import { DeviceSummaryScreen } from "../../../screens/DeviceSummaryScreen";
import { DeviceDetailScreen } from "../../../screens/DeviceDetailScreen";
import type { CommandStore } from "../../../commands/store";

let mockManager: SessionManager;
let mockBackend: DemoBackend;
let mockParams: Record<string, string>;
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
}));
jest.mock("../../../session/demo/DemoBackend", () => {
  const actual = jest.requireActual("../../../session/demo/DemoBackend");
  return {
    ...actual,
    DemoBackend: jest.fn((id: string) => {
      mockBackend = new actual.DemoBackend(id);
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
jest.mock("../../EntityIcon", () => ({
  ...jest.requireActual("../../EntityIcon"),
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
beforeEach(async () => {
  jest.useFakeTimers();
  AppState.currentState = "active";
  useCockpit.setState(useCockpit.getInitialState(), true);
  mockManager = new SessionManager(
    new Credentials(new MemoryStorage(), new MemoryStorage(), () => "fixture"),
    new PreferencesStorage(new MemoryStorage()),
  );
  await mockManager.connect({ demo: true });
});
afterEach(() => {
  mockManager.disconnect();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([
  ["device summary", () => <DeviceSummaryScreen />, { id: "demo-plug" }],
  [
    "reading detail",
    () => <DeviceDetailScreen />,
    { key: "demo-switch.living_lamp" },
  ],
])(
  "the %s route renders one extracted power control that dispatches once",
  async (_, screen, params) => {
    mockParams = { ...params, profile: useCockpit.getState().profileId! };
    const dispatch = jest.spyOn(mockBackend, "callService");
    const view = await renderAsync(screen());
    const on = view.getAllByRole("button", {
      name: "Turn Living room lamp on",
    });
    expect(on).toHaveLength(1);
    fireEvent.press(on[0]!);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(450);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      view.getByText("Simulated state observed after the request."),
    ).toBeTruthy();
    await view.unmountAsync();
  },
);
