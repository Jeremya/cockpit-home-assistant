import { act, fireEvent, render } from "@testing-library/react-native";
import sample from "../../spatial/sample-plan.json";
import { parseHousePlan } from "../../spatial/model";
import { CockpitSceneView, SCENE_WATCHDOG_MS } from "../CockpitSceneView";

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
});
afterEach(() => jest.useRealTimers());

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
