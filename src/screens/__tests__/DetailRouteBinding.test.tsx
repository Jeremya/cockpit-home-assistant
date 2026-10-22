import { act, render } from "@testing-library/react-native";
import { DeviceDetailScreen } from "../DeviceDetailScreen";
import { useCockpit } from "../../core/store";
import { emptyPreferences } from "../../preferences/types";
import { publicDeviceFixture } from "../../core/__tests__/deviceFixtures";

let mockParams: { key: string; profile?: string };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
}));
jest.mock("../../services/runtime", () => ({
  session: { updatePreferences: jest.fn() },
}));
jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));

const home = (profileId: string | null) =>
  useCockpit.setState({
    initialized: true,
    profileId,
    mode: profileId ? "homeAssistant" : null,
    snapshot: profileId ? publicDeviceFixture() : null,
    preferences: emptyPreferences(),
    status: profileId
      ? { kind: "ready", haVersion: "2026.10.1", readySince: "" }
      : { kind: "idle" },
  });

test("a reading link naming its home waits for that home and ignores another", () => {
  mockParams = { key: "reading-6", profile: "home-a" };
  home(null);
  const screen = render(<DeviceDetailScreen />);
  expect(screen.getByText("Not connected")).toBeTruthy();
  act(() => home("home-b"));
  expect(screen.getByText("Entity unavailable")).toBeTruthy();
  act(() => home("home-a"));
  expect(screen.getByText("Vendor battery")).toBeTruthy();
});
test("a legacy reading link binds to the first home it is shown in, never a later one", () => {
  mockParams = { key: "reading-6" };
  home(null);
  const screen = render(<DeviceDetailScreen />);
  expect(screen.getByText("Not connected")).toBeTruthy();
  act(() => home("home-a"));
  expect(screen.getByText("Vendor battery")).toBeTruthy();
  act(() => home("home-b"));
  expect(screen.getByText("Entity unavailable")).toBeTruthy();
  act(() => home("home-a"));
  expect(screen.getByText("Vendor battery")).toBeTruthy();
});
