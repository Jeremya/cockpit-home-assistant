import { act, fireEvent, render, within } from "@testing-library/react-native";
import { DeviceSummaryScreen } from "../DeviceSummaryScreen";
import { HomeScreen } from "../HomeScreen";
import { useCockpit } from "../../core/store";
import { emptyPreferences } from "../../preferences/types";
import { publicDeviceFixture } from "../../core/__tests__/deviceFixtures";
import { router } from "expo-router";
import {
  openDeviceSummary,
  openReading,
} from "../../services/deviceNavigation";
let mockParams = { id: "feeder", profile: "public-home" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
}));
jest.mock("../../services/runtime", () => ({
  session: { retry: jest.fn(), refresh: jest.fn(), connect: jest.fn() },
}));
jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));
beforeEach(() => {
  mockParams = { id: "feeder", profile: "public-home" };
  useCockpit.setState({
    initialized: true,
    profileId: "public-home",
    mode: "homeAssistant",
    snapshot: publicDeviceFixture(),
    preferences: emptyPreferences(),
    status: { kind: "ready", haVersion: "2026.10.1", readySince: "" },
  });
});
test("one feeder card opens its profile-scoped summary; individual eligible readings remain reachable", () => {
  const home = render(<HomeScreen />);
  expect(
    home.getAllByRole("button", { name: "Open device: Public cat feeder" }),
  ).toHaveLength(1);
  fireEvent.press(
    home.getByRole("button", { name: "Open device: Public cat feeder" }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/appliance/[id]",
    params: { id: "feeder", profile: "public-home" },
  });
  home.unmount();
  const detail = render(<DeviceSummaryScreen />);
  expect(detail.getByText(/They do not confirm the pet ate/)).toBeTruthy();
  expect(detail.getByText("1 reading needs interpretation")).toBeTruthy();
  fireEvent.press(detail.getByRole("button", { name: "Show all 7 readings" }));
  expect(
    within(detail.getByTestId("device-readings")).getAllByRole("button"),
  ).toHaveLength(7);
  fireEvent.press(detail.getByLabelText("Vendor battery, low"));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/device/[key]",
    params: { key: "reading-6" },
  });
});
test("favorites represent eligible members once; filtering a room still includes the favored device", () => {
  useCockpit.setState({
    preferences: {
      ...emptyPreferences(),
      favorites: ["reading-0", "reading-1"],
    },
  });
  const home = render(<HomeScreen />);
  expect(home.getByText("Favorites")).toBeTruthy();
  expect(
    home.getAllByRole("button", { name: "Open device: Public cat feeder" }),
  ).toHaveLength(1);
  fireEvent.press(home.getByRole("tab", { name: "Kitchen" }));
  expect(home.queryByText("Favorites")).toBeNull();
  expect(
    home.getByRole("button", { name: "Open device: Public cat feeder" }),
  ).toBeTruthy();
});
test("summary details track current visibility, removal, unavailable values and cached status", () => {
  const detail = render(<DeviceSummaryScreen />);
  act(() =>
    useCockpit.setState({
      preferences: {
        ...emptyPreferences(),
        visibility: { "reading-6": "hidden" },
      },
    }),
  );
  fireEvent.press(detail.getByRole("button", { name: "Show all 6 readings" }));
  expect(detail.queryByLabelText("Vendor battery, low")).toBeNull();
  act(() =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(detail.getByText("Cached · current state unknown")).toBeTruthy();
  act(() =>
    useCockpit.setState({
      snapshot: { ...publicDeviceFixture(), entities: {} },
    }),
  );
  expect(detail.getByText("Device unavailable")).toBeTruthy();
});
test("same device ID in another profile cannot revive an old summary route or receive a delayed tap", () => {
  const home = render(<HomeScreen />);
  const profileAtTap = useCockpit.getState().profileId!;
  const staleTap = () => openDeviceSummary(profileAtTap, "feeder");
  home.unmount();
  act(() => useCockpit.setState({ profileId: "another-home" }));
  staleTap();
  expect(router.push).not.toHaveBeenCalled();
  const detail = render(<DeviceSummaryScreen />);
  expect(detail.getByText("Device unavailable")).toBeTruthy();
});
test("callbacks revalidate removed and hidden membership and stable-key aliases", () => {
  const prefs = emptyPreferences();
  prefs.identities.aliases.old = "reading-0";
  useCockpit.setState({ preferences: prefs });
  openReading("public-home", "old");
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/device/[key]",
    params: { key: "reading-0" },
  });
  jest.mocked(router.push).mockClear();
  const hidden = Object.fromEntries(
    Object.values(publicDeviceFixture().entities).map((e) => [
      e.key,
      "hidden" as const,
    ]),
  );
  useCockpit.setState({ preferences: { ...prefs, visibility: hidden } });
  openDeviceSummary("public-home", "feeder");
  openReading("public-home", "old");
  expect(router.push).not.toHaveBeenCalled();
});
test("one multi-room device remains discoverable under each member room without rewriting assignments", () => {
  const snapshot = publicDeviceFixture();
  snapshot.areas.office = { id: "office", name: "Office" };
  const preferences = {
    ...emptyPreferences(),
    roomOverrides: { "reading-0": "office" },
  };
  useCockpit.setState({ snapshot, preferences });
  const home = render(<HomeScreen />);
  expect(
    home.getAllByRole("button", { name: "Open device: Public cat feeder" }),
  ).toHaveLength(1);
  fireEvent.press(home.getByRole("tab", { name: "Office" }));
  expect(
    home.getByRole("button", { name: "Open device: Public cat feeder" }),
  ).toBeTruthy();
  fireEvent.press(home.getByRole("tab", { name: "Kitchen" }));
  expect(
    home.getByRole("button", { name: "Open device: Public cat feeder" }),
  ).toBeTruthy();
  expect(useCockpit.getState().preferences.roomOverrides).toEqual({
    "reading-0": "office",
  });
});
