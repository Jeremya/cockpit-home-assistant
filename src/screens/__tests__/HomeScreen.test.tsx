import { act, fireEvent, render } from "@testing-library/react-native";
import { HomeScreen } from "../HomeScreen";
import { useCockpit } from "../../core/store";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { emptyPreferences } from "../../preferences/types";
import { router } from "expo-router";
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../services/runtime", () => ({
  session: { retry: jest.fn(), refresh: jest.fn(), connect: jest.fn() },
}));
beforeEach(async () => {
  const demo = new DemoBackend("screen-proof");
  demo.onSnapshot((snapshot) =>
    useCockpit.setState({
      initialized: true,
      profileId: "demo",
      snapshot,
      preferences: emptyPreferences(),
      mode: "demo",
      status: { kind: "ready", haVersion: "Demo", readySince: "" },
    }),
  );
  await demo.start();
  demo.stop();
});

test("demo home renders rooms and opens an entity by its stable key", () => {
  const screen = render(<HomeScreen />);
  expect(screen.getByRole("tab", { name: "Kitchen" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Office" })).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Front door, Locked"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/device/[key]",
    params: { key: "demo-lock.front_door" },
  });
  screen.unmount();
});

test("room selection filters observations while preserving household attention", () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  expect(
    screen.getByRole("tab", { name: "Kitchen", selected: true }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Fridge temperature, 37 °F")).toBeTruthy();
  expect(screen.queryByLabelText("Office booster vent, On · 60%")).toBeNull();
  expect(screen.getByLabelText("Side door, Unlocked")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "All rooms" }));
  expect(screen.getByLabelText("Office booster vent, On · 60%")).toBeTruthy();
});

test("removing a selected room's entities returns to all rooms", () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  act(() => {
    const { snapshot, preferences } = useCockpit.getState();
    const visibility = Object.fromEntries(
      Object.values(snapshot!.entities)
        .filter((entity) => entity.areaId === "kitchen")
        .map((entity) => [entity.key, "hidden" as const]),
    );
    useCockpit.setState({ preferences: { ...preferences, visibility } });
  });
  expect(
    screen.getByRole("tab", { name: "All rooms", selected: true }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Office booster vent, On · 60%")).toBeTruthy();
});

test("changing home profiles resets room selection", () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  act(() => useCockpit.setState({ profileId: "ha:another-home" }));
  expect(
    screen.getByRole("tab", { name: "All rooms", selected: true }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Office booster vent, On · 60%")).toBeTruthy();
});

test("collapsed attention is expandable, excludes hidden entities and becomes unknown offline", () => {
  const { snapshot, preferences } = useCockpit.getState();
  const entities = { ...snapshot!.entities };
  for (const id of [
    "lock.front_door",
    "fan.office_vent",
    "camera.front_door",
  ]) {
    entities[id] = { ...entities[id]!, state: "unavailable" };
  }
  entities["lock.jammed"] = {
    ...entities["lock.front_door"]!,
    entityId: "lock.jammed",
    key: "demo-lock.jammed",
    name: "Jammed door",
    state: "jammed",
  };
  useCockpit.setState({
    snapshot: { ...snapshot!, entities },
    preferences: {
      ...preferences,
      visibility: { [entities["camera.front_door"]!.key]: "hidden" },
      favorites: [entities["fan.office_vent"]!.key],
    },
  });
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  expect(screen.getByLabelText("Jammed door, Jammed")).toBeTruthy();
  expect(
    screen.queryByLabelText("Office booster vent, Unavailable"),
  ).toBeNull();
  expect(screen.queryByText("Favorites")).toBeNull();
  fireEvent.press(
    screen.getByRole("button", { name: "Show all 4 attention items" }),
  );
  expect(
    screen.getByLabelText("Office booster vent, Unavailable"),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Front door camera, Unavailable")).toBeNull();
  act(() =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(screen.getByText("Status unknown while disconnected.")).toBeTruthy();
  expect(
    screen.queryByLabelText("Office booster vent, Unavailable"),
  ).toBeNull();
  expect(
    screen.queryByText("No attention items among your visible entities."),
  ).toBeNull();
});
