import { render } from "@testing-library/react-native";
import { DiagnosticsScreen } from "../DiagnosticsScreen";
import { useCockpit } from "../../core/store";
import {
  fixturePreferences,
  fixtureSnapshot,
  location,
} from "../../spatial/__tests__/placementFixtures";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../services/runtime", () => ({
  session: { retry: jest.fn(), notice: jest.fn(), resetSpatial: jest.fn() },
}));

test("diagnostics exposes retained unresolved spatial data and the saved revision alongside recovery", () => {
  const preferences = fixturePreferences({
    stable: { ...location, floorId: "removed-floor" },
  });
  preferences.spatial.plan!.revision = 7;
  preferences.spatial.areaLinks = {
    "sample-1-0": "removed-area",
    "removed-room": "removed-area",
  };
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    preferencesLoadedFor: "demo",
    snapshot: fixtureSnapshot(),
    preferences,
    status: {
      kind: "error",
      retrying: true,
      error: { code: "unreachable", likelyCauses: ["server_stopped"] },
    },
    notices: [],
  });
  const before = JSON.stringify(preferences);
  const screen = render(<DiagnosticsScreen />);
  expect(screen.getByText(/Plan: Sample home \(revision 7\)/)).toBeTruthy();
  expect(
    screen.getByText(
      /Room links: 2 \(2 absent from cached HA areas\) \(1 to rooms not in this plan\)/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/Device placements: 1 \(1 unresolved or hidden\)/),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Manage device placements" }),
  ).toBeTruthy();
  expect(screen.getByText(/Reconnecting automatically/)).toBeTruthy();
  expect(
    screen.getByText(/Home Assistant: 2026.10.1 \(last synchronized\)/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Snapshot: cached; awaiting synchronization/),
  ).toBeTruthy();
  expect(JSON.stringify(useCockpit.getState().preferences)).toBe(before);
});
