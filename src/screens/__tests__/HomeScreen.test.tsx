import { act, fireEvent, render } from "@testing-library/react-native";
import { HomeScreen } from "../HomeScreen";
import { useCockpit } from "../../core/store";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { emptyPreferences } from "../../preferences/types";
import { router } from "expo-router";
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));
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

test("demo home renders rooms and opens a physical device in the active profile", () => {
  const screen = render(<HomeScreen />);
  expect(screen.getByRole("tab", { name: "Kitchen" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Office" })).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Open device: Front door"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/appliance/[id]",
    params: { id: "demo-door", profile: "demo" },
  });
  screen.unmount();
});

test("room selection filters observations while preserving household attention", () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  expect(
    screen.getByRole("tab", { name: "Kitchen", selected: true }),
  ).toBeTruthy();
  expect(screen.getByLabelText("Open device: Kitchen fridge")).toBeTruthy();
  expect(
    screen.queryByLabelText("Open device: Office booster vent"),
  ).toBeNull();
  expect(screen.getByLabelText("Side door, Unlocked")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "All rooms" }));
  expect(
    screen.getByLabelText("Open device: Office booster vent"),
  ).toBeTruthy();
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
  expect(
    screen.getByLabelText("Open device: Office booster vent"),
  ).toBeTruthy();
});

test("changing home profiles resets room selection", () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  act(() => useCockpit.setState({ profileId: "ha:another-home" }));
  expect(
    screen.getByRole("tab", { name: "All rooms", selected: true }),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Open device: Office booster vent"),
  ).toBeTruthy();
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

test("battery, problem and connectivity attention stays global under a room filter", () => {
  const { snapshot } = useCockpit.getState();
  const base = snapshot!.entities["binary_sensor.fridge_door"]!;
  const added = [
    {
      ...base,
      key: "problem",
      entityId: "binary_sensor.problem",
      name: "Reported problem",
      areaId: "office",
      state: "on",
      attributes: { device_class: "problem" },
    },
    {
      ...base,
      key: "network",
      entityId: "binary_sensor.network",
      name: "Network",
      areaId: "entry",
      state: "off",
      attributes: { device_class: "connectivity" },
    },
    {
      ...base,
      key: "battery",
      entityId: "sensor.battery",
      domain: "sensor",
      name: "Battery",
      areaId: "office",
      state: "15",
      attributes: { device_class: "battery", unit_of_measurement: "%" },
    },
  ];
  useCockpit.setState({
    snapshot: {
      ...snapshot!,
      entities: {
        ...snapshot!.entities,
        ...Object.fromEntries(added.map((e) => [e.entityId, e])),
      },
    },
  });
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Kitchen" }));
  fireEvent.press(
    screen.getByRole("button", { name: "Show all 4 attention items" }),
  );
  expect(screen.getByLabelText("Network, Disconnected")).toBeTruthy();
  expect(
    screen.getByLabelText("Reported problem, Problem reported"),
  ).toBeTruthy();
  expect(screen.getByLabelText("Battery, 15 %")).toBeTruthy();
  act(() =>
    useCockpit.setState({
      preferences: {
        ...useCockpit.getState().preferences,
        visibility: { network: "hidden" },
      },
    }),
  );
  expect(screen.queryByLabelText("Network, Disconnected")).toBeNull();
  expect(
    screen.getByLabelText("Reported problem, Problem reported"),
  ).toBeTruthy();
});

test("empty attention qualifies coverage and never certifies an empty or partial home", () => {
  const { snapshot } = useCockpit.getState();
  const base = snapshot!.entities["binary_sensor.fridge_door"]!;
  const connected = {
    ...base,
    entityId: "binary_sensor.network",
    key: "network",
    state: "on",
    attributes: { device_class: "connectivity" },
  };
  const reading = snapshot!.entities["sensor.fridge_temperature"]!;
  useCockpit.setState({
    snapshot: {
      ...snapshot!,
      entities: {
        [connected.entityId]: connected,
        [reading.entityId]: reading,
      },
    },
  });
  const screen = render(<HomeScreen />);
  expect(
    screen.getByText("No issue detected by the available attention rules."),
  ).toBeTruthy();
  expect(
    screen.getByText(/Attention rules assessed 1 of 2 visible entities/),
  ).toBeTruthy();
  act(() =>
    useCockpit.setState({
      snapshot: { ...snapshot!, entities: { [reading.entityId]: reading } },
    }),
  );
  expect(
    screen.getByText(/Attention rules assessed 0 of 1 visible entities/),
  ).toBeTruthy();
  act(() => useCockpit.setState({ snapshot: { ...snapshot!, entities: {} } }));
  expect(screen.getByText("No visible entities to assess yet.")).toBeTruthy();
  expect(
    screen.queryByText("No issue detected by the available attention rules."),
  ).toBeNull();
});
