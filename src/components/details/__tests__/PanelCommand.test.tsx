import {
  act,
  fireEvent,
  renderAsync,
  within,
} from "@testing-library/react-native";
import { AppState } from "react-native";
import { SessionManager } from "../../../session/SessionManager";
import { Credentials } from "../../../services/credentials";
import { PreferencesStorage } from "../../../preferences/storage";
import { DemoBackend } from "../../../session/demo/DemoBackend";
import { useCockpit } from "../../../core/store";
import { HomeScreen } from "../../../screens/HomeScreen";
import {
  HomeViewProvider,
  createHomeViewSession,
} from "../../../spatial/HomeViewProvider";
import { DeviceSummaryContent } from "../DeviceSummaryContent";
import type { CommandStore } from "../../../commands/store";

let mockManager: SessionManager;
let mockBackend: DemoBackend;
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
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
    refresh: jest.fn(),
    retry: jest.fn(),
    connect: jest.fn(),
  },
}));
jest.mock("../../CockpitSceneView", () => ({ CockpitSceneView: () => null }));
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
let viewSession: ReturnType<typeof createHomeViewSession>;
beforeEach(async () => {
  jest.useFakeTimers();
  AppState.currentState = "active";
  useCockpit.setState(useCockpit.getInitialState(), true);
  mockManager = new SessionManager(
    new Credentials(new MemoryStorage(), new MemoryStorage(), () => "fixture"),
    new PreferencesStorage(new MemoryStorage()),
  );
  await mockManager.connect({ demo: true });
  viewSession = createHomeViewSession();
});
afterEach(() => {
  viewSession.dispose();
  mockManager.disconnect();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("a Home card request and the panel show one command and send one service", async () => {
  const dispatch = jest.spyOn(mockBackend, "callService");
  const profileId = useCockpit.getState().profileId!;
  const workspace = await renderAsync(
    <HomeViewProvider session={viewSession}>
      <HomeScreen />
      <DeviceSummaryContent
        profileId={profileId}
        deviceId="demo-plug"
        width={400}
      />
    </HomeViewProvider>,
  );
  const panel = () => within(workspace.getByTestId("device-summary"));
  const homeOn = workspace
    .getAllByRole("button", { name: "Turn Living room lamp on" })
    .find((node) => !panel().queryAllByRole("button").includes(node))!;
  fireEvent.press(homeOn);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(120);
  });
  // Accepted but not yet observed: the panel shows the same pending request.
  expect(
    panel().getByText(/accepted. Waiting for the reported state/),
  ).toBeTruthy();
  expect(
    panel().getByRole("button", { name: "Turn Living room lamp on" }),
  ).toBeDisabled();
  fireEvent.press(
    panel().getByRole("button", { name: "Turn Living room lamp on" }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(330);
  });
  expect(
    panel().getByText("Simulated state observed after the request."),
  ).toBeTruthy();
  expect(dispatch).toHaveBeenCalledTimes(1);
  await workspace.unmountAsync();
});
