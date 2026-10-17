import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PlacementScreen } from "../PlacementScreen";
import { useCockpit } from "../../core/store";
import {
  fixtureSnapshot,
  fixturePreferences,
  location,
} from "../../spatial/__tests__/placementFixtures";

jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("../../services/runtime", () => {
  const { useCockpit: store } = jest.requireActual("../../core/store");
  return {
    session: {
      updatePreferences: jest.fn((update) => {
        const state = store.getState();
        if (!state.profileId || state.preferencesLoadedFor !== state.profileId)
          return false;
        store.setState({ preferences: update(state.preferences) });
        return true;
      }),
    },
  };
});
beforeEach(() => {
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useCockpit.setState(useCockpit.getInitialState(), true);
  useCockpit.setState({
    initialized: true,
    profileId: "demo",
    mode: "demo",
    preferencesLoadedFor: "demo",
    snapshot: fixtureSnapshot(),
    preferences: fixturePreferences(),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
  });
});
const placements = () => useCockpit.getState().preferences.spatial.placements;
type Screen = Awaited<ReturnType<typeof renderAsync>>;
function tapPlan(screen: Screen, x: number, y: number) {
  fireEvent(screen.getByTestId("plan-frame"), "layout", {
    nativeEvent: { layout: { width: 348, height: 268 } },
  });
  fireEvent.press(screen.getByTestId("plan-placement-surface"), {
    nativeEvent: { locationX: x, locationY: y },
  });
}

test("a draft becomes a saved metric placement only after explicit Save", async () => {
  const screen = await renderAsync(<PlacementScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Place Test lamp" }));
  fireEvent.press(screen.getByRole("radio", { name: "Kitchen" }));
  tapPlan(screen, 254, 134); // public plan: X=6m, Z=3m
  expect(placements()).toEqual({});
  fireEvent.press(screen.getByRole("button", { name: "Save position" }));
  expect(placements()).toEqual({
    stable: {
      floorId: "sample-floor-1",
      roomId: "sample-1-1",
      position: { x: 6, z: 3 },
    },
  });
  expect(router.back).toHaveBeenCalledTimes(1);
});
test("an invalid room tap cannot be saved; cancelling a valid draft keeps preferences", async () => {
  const screen = await renderAsync(<PlacementScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Place Test lamp" }));
  fireEvent.press(screen.getByRole("radio", { name: "Kitchen" }));
  tapPlan(screen, 94, 134); // X=2 is in Living room, not Kitchen
  expect(screen.getByRole("alert").props.children).toMatch(
    /outside the chosen room/,
  );
  fireEvent.press(screen.getByRole("button", { name: "Save position" }));
  expect(placements()).toEqual({});
  tapPlan(screen, 254, 134);
  fireEvent.press(screen.getByRole("button", { name: "Cancel placement" }));
  expect(placements()).toEqual({});
});
test("changing floors clears the old draft instead of transferring its coordinates", async () => {
  const screen = await renderAsync(<PlacementScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Place Test lamp" }));
  tapPlan(screen, 94, 134);
  fireEvent.press(screen.getByRole("radio", { name: "Floor 2" }));
  fireEvent.press(screen.getByRole("button", { name: "Save position" }));
  expect(placements()).toEqual({});
  tapPlan(screen, 94, 134);
  fireEvent.press(screen.getByRole("button", { name: "Save position" }));
  expect(placements().stable?.floorId).toBe("sample-floor-2");
});
test("repositioning keeps one stable placement and removal leaves other settings intact", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ key: "stable" });
  const preferences = fixturePreferences({ stable: location });
  preferences.favorites = ["stable"];
  useCockpit.setState({ preferences });
  const screen = await renderAsync(<PlacementScreen />);
  tapPlan(screen, 254, 134);
  fireEvent.press(screen.getByRole("button", { name: "Save position" }));
  expect(Object.keys(placements())).toEqual(["stable"]);
  expect(placements().stable?.position).toEqual({ x: 6, z: 3 });
  fireEvent.press(
    screen.getByRole("button", { name: "Remove placement: Test lamp" }),
  );
  expect(placements()).toEqual({});
  expect(useCockpit.getState().preferences.favorites).toEqual(["stable"]);
});
test("profile and plan replacement discard drafts", async () => {
  const screen = await renderAsync(<PlacementScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Place Test lamp" }));
  tapPlan(screen, 94, 134);
  await act(async () =>
    useCockpit.setState({
      profileId: "ha:other",
      preferencesLoadedFor: "ha:other",
      preferences: fixturePreferences(),
    }),
  );
  expect(screen.queryByRole("button", { name: "Save position" })).toBeNull();
  expect(placements()).toEqual({});
  fireEvent.press(screen.getByRole("button", { name: "Place Test lamp" }));
  tapPlan(screen, 94, 134);
  await act(async () =>
    useCockpit.setState((state) => ({
      preferences: {
        ...state.preferences,
        spatial: {
          ...state.preferences.spatial,
          plan: { ...state.preferences.spatial.plan!, revision: 2 },
        },
      },
    })),
  );
  expect(screen.queryByRole("button", { name: "Save position" })).toBeNull();
});
test("unloaded profiles cannot place and missing saved entities remain removable", async () => {
  useCockpit.setState({ preferencesLoadedFor: null });
  const screen = await renderAsync(<PlacementScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Place Test lamp" }));
  expect(screen.queryByRole("button", { name: "Save position" })).toBeNull();
  await act(async () =>
    useCockpit.setState({
      preferencesLoadedFor: "demo",
      preferences: fixturePreferences({ removed: location }),
      snapshot: fixtureSnapshot([]),
    }),
  );
  expect(screen.getByText("Not in current observations")).toBeTruthy();
  fireEvent.press(
    screen.getByRole("button", { name: "Remove placement: removed" }),
  );
  expect(placements()).toEqual({});
});
