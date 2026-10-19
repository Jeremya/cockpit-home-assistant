import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { AppState } from "react-native";
import { SessionManager } from "../../../session/SessionManager";
import { BackendEvents } from "../../../session/types";
import { Credentials } from "../../../services/credentials";
import { PreferencesStorage } from "../../../preferences/storage";
import { useCockpit } from "../../../core/store";
import { DeviceSummaryScreen } from "../../../screens/DeviceSummaryScreen";
import { entity, snapshot } from "../../../commands/__tests__/fixtures";
import { profileIdFor } from "../../../session/homeAssistant/url";
import type { CommandStore } from "../../../commands/store";

let mockManager: SessionManager;
let mockBackend: ControlledBackend;
let mockProfile: string;
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "plug", profile: mockProfile }),
  router: { push: jest.fn() },
}));
jest.mock("../../../session/homeAssistant/HomeAssistantBackend", () => ({
  HomeAssistantBackend: jest.fn(() => mockBackend),
}));
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
    allowSwitch: (...args: Parameters<SessionManager["allowSwitch"]>) =>
      mockManager.allowSwitch(...args),
    revokeSwitch: (...args: Parameters<SessionManager["revokeSwitch"]>) =>
      mockManager.revokeSwitch(...args),
    dismissCommand: (id: string) => mockManager.dismissCommand(id),
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
function home() {
  const value = entity({ deviceId: "plug" });
  const result = snapshot([value]);
  result.devices.plug = {
    id: "plug",
    name: "Public lamp",
    manufacturer: "TP-Link",
    model: "HS103",
    areaId: null,
    entityIds: [value.entityId],
  };
  result.registryEntries = [
    {
      id: value.key,
      entity_id: value.entityId,
      device_id: "plug",
      area_id: null,
      entity_category: null,
      hidden_by: null,
      disabled_by: null,
      name: null,
      platform: "tplink",
    },
  ];
  return result;
}
class ControlledBackend extends BackendEvents {
  current = home();
  async start() {
    this.emitSnapshot(this.current);
    this.emitStatus({ kind: "ready", haVersion: "2026.10.1", readySince: "" });
  }
  observe(next = this.current) {
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
let screen: Awaited<ReturnType<typeof renderAsync>>;
beforeEach(async () => {
  useCockpit.setState(useCockpit.getInitialState(), true);
  AppState.currentState = "active";
  mockProfile = profileIdFor("https://public.example");
  mockBackend = new ControlledBackend();
  mockManager = new SessionManager(
    new Credentials(
      new MemoryStorage(),
      new MemoryStorage(),
      () => "public-proof",
    ),
    new PreferencesStorage(new MemoryStorage()),
  );
  await mockManager.connect({
    url: "https://public.example",
    token: "fixture",
    allowInsecureHttp: false,
  });
  screen = await renderAsync(<DeviceSummaryScreen />);
});
afterEach(async () => {
  await screen.unmountAsync();
  mockManager.disconnect();
  jest.restoreAllMocks();
});
async function press(name: string) {
  await act(async () => fireEvent.press(screen.getByRole("button", { name })));
}
test("summary provides direct power access with explicit cancelable permission, then revocation", async () => {
  const on = () => screen.getByRole("button", { name: "Turn Public lamp on" });
  expect(on()).toBeDisabled();
  await press("Allow power control");
  expect(screen.getByText(/Allowing it sends no power request/)).toBeTruthy();
  await press("Cancel permission");
  expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
  await press("Allow power control");
  await press("Allow this device");
  expect(on()).not.toBeDisabled();
  expect(mockBackend.callService).not.toHaveBeenCalled();
  await press("Turn Public lamp on");
  expect(mockBackend.callService).toHaveBeenCalledTimes(1);
  expect(useCockpit.getState().snapshot!.entities["switch.lamp"]!.state).toBe(
    "off",
  );
  expect(
    screen.getByText(/accepted. Waiting for the reported state/),
  ).toBeTruthy();
  await press("Revoke power control");
  expect(on()).toBeDisabled();
  expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
  expect(mockBackend.callService).toHaveBeenCalledTimes(1);
});
test("a replacement device during the permission review is refused", async () => {
  await press("Allow power control");
  const changed = home();
  changed.devices.plug!.model = "HS103(US)";
  await act(async () => mockBackend.observe(changed));
  await press("Allow this device");
  expect(useCockpit.getState().preferences.switchEnrollments).toEqual({});
  expect(screen.getByText(/Permission could not be saved/)).toBeTruthy();
  expect(mockBackend.callService).not.toHaveBeenCalled();
});
test("ambiguous main switches keep readings reachable without a guessed primary action", async () => {
  const changed = home();
  const sibling = entity({
    key: "other",
    entityId: "switch.other",
    deviceId: "plug",
  });
  changed.entities[sibling.entityId] = sibling;
  changed.devices.plug!.entityIds.push(sibling.entityId);
  await act(async () => mockBackend.observe(changed));
  expect(screen.queryByText("Power control")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Show all 2 readings" }),
  ).toBeTruthy();
});
