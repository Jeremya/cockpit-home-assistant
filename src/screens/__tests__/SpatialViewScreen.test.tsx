import { act, fireEvent, render } from "@testing-library/react-native";
import { HousePlanScreen } from "../HousePlanScreen";
import { useCockpit } from "../../core/store";
import { router } from "expo-router";
import {
  fixtureEntity,
  fixturePreferences,
  fixtureSnapshot,
  location,
} from "../../spatial/__tests__/placementFixtures";

const mockScenes: Record<string, any>[] = [];
jest.mock("../../components/CockpitSceneView", () => ({
  CockpitSceneView: (props: Record<string, unknown>) => {
    mockScenes.push(props);
    const { Text } = jest.requireActual("react-native");
    return <Text>Production scene</Text>;
  },
}));
jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const scene = () => mockScenes[mockScenes.length - 1]!;

beforeEach(() => {
  mockScenes.length = 0;
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    preferencesLoadedFor: "demo",
    preferences: fixturePreferences({ stable: location }),
    snapshot: fixtureSnapshot(),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
  });
});
const select3D = (screen: ReturnType<typeof render>) =>
  fireEvent.press(screen.getByRole("tab", { name: "3D view" }));

test("2D/3D and the native list share room selection; whole-floor reset is explicit", () => {
  const screen = render(<HousePlanScreen />);
  expect(
    screen.getByRole("tab", { name: "2D plan", selected: true }),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Explore Kitchen" }));
  select3D(screen);
  expect(scene().floor.id).toBe(location.floorId);
  expect(scene().selectedRoomId).toBe("sample-1-1");
  expect(scene().markers).toEqual([
    {
      key: "stable",
      floorId: location.floorId,
      position: location.position,
      icon: "switch",
      label: "Test lamp",
      condition: "normal",
    },
  ]);
  act(() => scene().onRoomPress("sample-1-0"));
  expect(scene().selectedRoomId).toBe("sample-1-0");
  fireEvent.press(screen.getByRole("tab", { name: "2D plan" }));
  expect(screen.getByRole("header", { name: "Living room" })).toBeTruthy();
  select3D(screen);
  const reset = scene().resetKey;
  fireEvent.press(screen.getByRole("button", { name: "Show whole floor" }));
  expect(scene().selectedRoomId).toBeNull();
  expect(scene().resetKey).toBe(reset + 1);
});

test("floor changes keep the view choice, clear room selection and reject old floor taps", () => {
  const screen = render(<HousePlanScreen />);
  select3D(screen);
  const old = scene();
  fireEvent.press(screen.getByRole("tab", { name: "Floor 2" }));
  expect(
    screen.getByRole("tab", { name: "3D view", selected: true }),
  ).toBeTruthy();
  expect(scene().floor.id).toBe("sample-floor-2");
  expect(scene().markers).toEqual([]);
  act(() => {
    old.onMarkerPress("stable");
    old.onRoomPress("sample-1-1");
  });
  expect(router.push).not.toHaveBeenCalled();
  expect(scene().selectedRoomId).toBeNull();
});

test("observation quality updates both renderer and native list, preserving the saved position", () => {
  const screen = render(<HousePlanScreen />);
  select3D(screen);
  for (const condition of ["unknown", "unavailable"] as const) {
    act(() =>
      useCockpit.setState({
        snapshot: fixtureSnapshot([fixtureEntity({ state: condition })]),
      }),
    );
    expect(scene().markers[0].condition).toBe(condition);
    expect(
      screen.getByText(condition === "unknown" ? "Unknown" : "Unavailable"),
    ).toBeTruthy();
  }
  act(() =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(scene().markers[0].condition).toBe("stale");
  expect(screen.getByText("Unavailable · Cached")).toBeTruthy();
  expect(scene().markers[0].position).toEqual(location.position);
});

test("a removed/hidden placement cannot be opened by an already queued scene callback", () => {
  const screen = render(<HousePlanScreen />);
  select3D(screen);
  const old = scene();
  const preferences = useCockpit.getState().preferences;
  act(() =>
    useCockpit.setState({
      preferences: {
        ...preferences,
        spatial: { ...preferences.spatial, placements: {} },
      },
    }),
  );
  act(() => old.onMarkerPress("stable"));
  expect(scene().markers).toEqual([]);
  expect(router.push).not.toHaveBeenCalled();
  act(() =>
    useCockpit.setState({
      preferences: { ...preferences, visibility: { stable: "hidden" } },
    }),
  );
  act(() => old.onMarkerPress("stable"));
  expect(scene().markers).toEqual([]);
  expect(router.push).not.toHaveBeenCalled();
  expect(useCockpit.getState().preferences.spatial.placements.stable).toEqual(
    location,
  );
});

test("a profile/plan change resets selection and rejects the obsolete scene", () => {
  const screen = render(<HousePlanScreen />);
  select3D(screen);
  const old = scene();
  act(() => useCockpit.setState({ profileId: "other" }));
  act(() => old.onMarkerPress("stable"));
  expect(router.push).not.toHaveBeenCalled();
  expect(
    screen.getByRole("tab", { name: "2D plan", selected: true }),
  ).toBeTruthy();
  select3D(screen);
  const previous = scene();
  const preferences = useCockpit.getState().preferences;
  act(() =>
    useCockpit.setState({
      preferences: {
        ...preferences,
        spatial: {
          ...preferences.spatial,
          plan: { ...preferences.spatial.plan!, revision: 2 },
        },
      },
    }),
  );
  act(() => previous.onMarkerPress("stable"));
  expect(router.push).not.toHaveBeenCalled();
  expect(
    screen.getByRole("tab", { name: "2D plan", selected: true }),
  ).toBeTruthy();
});

test("the production scene pauses outside the scroll viewport and old 3D callbacks stop after choosing 2D", () => {
  const screen = render(<HousePlanScreen />);
  select3D(screen);
  fireEvent(screen.getByTestId("house-scroll"), "layout", {
    nativeEvent: { layout: { height: 700 } },
  });
  fireEvent(screen.getByTestId("spatial-preview"), "layout", {
    nativeEvent: { layout: { y: 300, height: 400 } },
  });
  fireEvent(screen.getByTestId("scene-viewport"), "layout", {
    nativeEvent: { layout: { y: 40, height: 300 } },
  });
  expect(scene().visible).toBe(true);
  fireEvent.scroll(screen.getByTestId("house-scroll"), {
    nativeEvent: { contentOffset: { y: 660 } },
  });
  expect(scene().visible).toBe(false);
  fireEvent.scroll(screen.getByTestId("house-scroll"), {
    nativeEvent: { contentOffset: { y: 200 } },
  });
  expect(scene().visible).toBe(true);
  const old = scene();
  fireEvent.press(screen.getByRole("tab", { name: "2D plan" }));
  act(() => {
    old.onMarkerPress("stable");
    old.onRoomPress("sample-1-1");
  });
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.queryByRole("header", { name: "Kitchen" })).toBeNull();
});
