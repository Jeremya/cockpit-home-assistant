import { act, fireEvent, render } from "@testing-library/react-native";
import sample from "../../spatial/sample-plan.json";
import { parseHousePlan } from "../../spatial/model";
import { CockpitSceneView, SCENE_WATCHDOG_MS } from "../CockpitSceneView";
import { AppState, type AppStateStatus } from "react-native";
let appState: AppStateStatus | null = "active";
let appListener: (state: AppStateStatus) => void;
jest.mock("../EntityIcon", () => ({
  ...jest.requireActual("../EntityIcon"),
  Icon: () => null,
}));

// The DOM scene runs in another JS runtime; here it is a probe recording its props.
const mounts: Record<string, any>[] = [];
jest.mock("../../web/CockpitScene", () => {
  const { Text } = jest.requireActual("react-native");
  return function FakeScene(props: Record<string, unknown>) {
    mounts.push(props);
    return <Text>3D scene</Text>;
  };
});
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual("react").useEffect(effect, []),
}));

const floor = parseHousePlan(sample)!.floors[0]!;
const latest = () => mounts[mounts.length - 1]!;
const setup = (overrides: Record<string, unknown> = {}) => {
  const onRoomPress = jest.fn();
  const onMarkerPress = jest.fn();
  const screen = render(
    <CockpitSceneView
      floor={floor}
      markers={[]}
      selectedRoomId={null}
      onRoomPress={onRoomPress}
      onMarkerPress={onMarkerPress}
      {...overrides}
    />,
  );
  return { screen, onRoomPress, onMarkerPress };
};

beforeEach(() => {
  mounts.length = 0;
  jest.useFakeTimers();
  appState = "active";
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    get: () => appState,
  });
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, listener) => {
      appListener = listener;
      return { remove: jest.fn() };
    });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("a scene that never reports readiness falls back to the 2D plan after the watchdog", () => {
  const { screen } = setup();
  expect(screen.queryByText(/3D view unavailable/)).toBeNull();
  act(() => jest.advanceTimersByTime(SCENE_WATCHDOG_MS + 1));
  expect(screen.getByText(/3D view unavailable/)).toBeTruthy();
  expect(screen.getByText(/did not start/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry 3D view" })).toBeTruthy();
});

test("readiness cancels the watchdog and room taps reach the native screen", async () => {
  const { screen, onRoomPress } = setup();
  await act(() => latest().onSceneReady());
  act(() => jest.advanceTimersByTime(SCENE_WATCHDOG_MS * 2));
  expect(screen.queryByText(/3D view unavailable/)).toBeNull();
  await act(() => latest().onRoomPress(floor.rooms[0]!.id));
  expect(onRoomPress).toHaveBeenCalledWith(floor.rooms[0]!.id);
});

test("after a context loss and retry, callbacks from the obsolete scene are ignored", async () => {
  const { screen, onRoomPress, onMarkerPress } = setup();
  const first = latest();
  await act(() => first.onSceneReady());
  await act(() => first.onSceneError("context_lost"));
  expect(screen.getByText(/graphics context was lost/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Retry 3D view" }));
  expect(mounts.length).toBeGreaterThan(1);
  expect(latest()).not.toBe(first);
  await act(() => first.onRoomPress(floor.rooms[0]!.id));
  await act(() => first.onMarkerPress("fixture:lock"));
  await act(() => first.onSceneReady());
  expect(onRoomPress).not.toHaveBeenCalled();
  expect(onMarkerPress).not.toHaveBeenCalled();
  await act(() => latest().onSceneReady());
  expect(screen.queryByText(/3D view unavailable/)).toBeNull();
});

test("only sanitized geometry and markers cross the bridge", () => {
  setup({
    markers: [
      {
        key: "fixture:lock",
        floorId: floor.id,
        position: floor.rooms[0]!.label,
        icon: "lock",
        label: "Front door",
        condition: "attention",
        token: "secret-token",
      },
    ],
  });
  const serialized = JSON.stringify({
    floor: latest().floor,
    markers: latest().markers,
  });
  expect(serialized).not.toContain("secret-token");
  expect(serialized).not.toContain("dimensions");
  expect(latest().markers).toHaveLength(1);
  expect(latest().visible).toBe(true);
});

test("the scene is told to stop rendering when the caller hides it", () => {
  const { screen } = setup();
  expect(latest().visible).toBe(true);
  screen.rerender(
    <CockpitSceneView
      floor={floor}
      markers={[]}
      selectedRoomId={null}
      onRoomPress={jest.fn()}
      onMarkerPress={jest.fn()}
      visible={false}
    />,
  );
  expect(latest().visible).toBe(false);
});

test("background suspends the watchdog and foreground resumes with fresh visibility", () => {
  const { screen } = setup();
  act(() => appListener("background"));
  expect(latest().visible).toBe(false);
  act(() => jest.advanceTimersByTime(SCENE_WATCHDOG_MS * 2));
  expect(screen.queryByText(/3D view unavailable/)).toBeNull();
  act(() => appListener("active"));
  expect(latest().visible).toBe(true);
  act(() => jest.advanceTimersByTime(SCENE_WATCHDOG_MS + 1));
  expect(screen.getByText(/3D view unavailable/)).toBeTruthy();
});
test("failed and unmounted scenes cannot deliver selection or revive readiness", async () => {
  const { screen, onRoomPress } = setup();
  const first = latest();
  await act(() => first.onSceneReady());
  await act(() => first.onSceneError("runtime_error"));
  await act(() => first.onRoomPress(floor.rooms[0]!.id));
  await act(() => first.onSceneReady());
  expect(onRoomPress).not.toHaveBeenCalled();
  expect(screen.getByText(/3D view unavailable/)).toBeTruthy();
  screen.unmount();
  await act(() => first.onRoomPress(floor.rooms[0]!.id));
  expect(onRoomPress).not.toHaveBeenCalled();
});
test("native selection accepts only current floor rooms and current sanitized marker keys", async () => {
  const markers = [
    {
      key: "fixture",
      floorId: floor.id,
      position: floor.rooms[0]!.label,
      icon: "lock",
      label: "Test",
      condition: "normal",
    },
  ];
  const { screen, onRoomPress, onMarkerPress } = setup({ markers });
  await act(() => latest().onSceneReady());
  const first = latest();
  await act(() => first.onRoomPress("absent-room"));
  await act(() => first.onMarkerPress("absent-marker"));
  expect(onRoomPress).not.toHaveBeenCalled();
  expect(onMarkerPress).not.toHaveBeenCalled();
  await act(() => first.onMarkerPress("fixture"));
  expect(onMarkerPress).toHaveBeenCalledWith("fixture");
  onMarkerPress.mockClear();
  screen.rerender(
    <CockpitSceneView
      floor={floor}
      markers={[]}
      selectedRoomId={null}
      onRoomPress={onRoomPress}
      onMarkerPress={onMarkerPress}
    />,
  );
  await act(() => first.onMarkerPress("fixture"));
  expect(onMarkerPress).not.toHaveBeenCalled();
});

test("fallback keeps real markers and native navigation after a DOM failure", async () => {
  const { screen, onMarkerPress } = setup({
    fallbackMarkers: [
      {
        key: "stable",
        name: "Public plug",
        position: { x: 1, z: 1 },
        icon: "toggle-right",
        tint: "#ffc083",
        condition: "normal",
        stateLabel: "Off",
      },
    ],
  });
  await act(() => latest().onSceneError("context_lost"));
  fireEvent(screen.getByTestId("plan-frame"), "layout", {
    nativeEvent: { layout: { width: 348, height: 380 } },
  });
  fireEvent.press(screen.getByRole("button", { name: "Public plug, Off" }));
  expect(onMarkerPress).toHaveBeenCalledWith("stable");
  expect(screen.getByRole("button", { name: "Retry 3D view" })).toBeTruthy();
});

test("queued selection is ignored while hidden or backgrounded", async () => {
  const { screen, onRoomPress } = setup();
  await act(() => latest().onSceneReady());
  const queued = latest();
  act(() => appListener("background"));
  await act(() => queued.onRoomPress(floor.rooms[0]!.id));
  expect(onRoomPress).not.toHaveBeenCalled();
  act(() => appListener("active"));
  screen.rerender(
    <CockpitSceneView
      floor={floor}
      markers={[]}
      selectedRoomId={null}
      onRoomPress={onRoomPress}
      onMarkerPress={jest.fn()}
      visible={false}
    />,
  );
  await act(() => queued.onRoomPress(floor.rooms[0]!.id));
  expect(onRoomPress).not.toHaveBeenCalled();
});
