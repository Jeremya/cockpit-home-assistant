import { act, fireEvent, render, within } from "@testing-library/react-native";
import { HomeScreen as Home } from "../HomeScreen";
import {
  HomeViewProvider,
  createHomeViewSession,
} from "../../spatial/HomeViewProvider";
import { useCockpit } from "../../core/store";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { emptyPreferences } from "../../preferences/types";
import { router, useFocusEffect } from "expo-router";
import { HomePlanOverview } from "../../components/HomePlanOverview";
import { CockpitSceneView } from "../../components/CockpitSceneView";
import { sampleHouse } from "../../spatial/plans";
import { resetSpatial } from "../../spatial/profilePlan";
import {
  fixtureSnapshot,
  fixturePreferences,
  location,
} from "../../spatial/__tests__/placementFixtures";
let mockViewSession: ReturnType<typeof createHomeViewSession>;
function HomeScreen() {
  return (
    <HomeViewProvider session={mockViewSession}>
      <Home />
    </HomeViewProvider>
  );
}
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));
jest.mock("../../services/runtime", () => {
  const { createCommandStore } = jest.requireActual("../../commands/store");
  return {
    session: { retry: jest.fn(), refresh: jest.fn(), connect: jest.fn() },
    commands: { capture: jest.fn(), setSwitch: jest.fn() },
    commandStore: createCommandStore().readonly,
  };
});
let mockDesktop = false;
jest.mock("../../components/CockpitSceneView", () => ({
  CockpitSceneView: () => null,
}));
jest.mock("../../components/layout", () => ({
  useResponsiveLayout: () => ({
    desktop: mockDesktop,
    width: mockDesktop ? 1440 : 430,
    height: 932,
  }),
}));
afterEach(() => {
  mockDesktop = false;
});
type Node = ReturnType<ReturnType<typeof render>["toJSON"]>;
/** Labels and texts in tree order, which is the reading order on both platforms. */
function readingOrder(node: Node): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(readingOrder);
  const label = node.props.accessibilityLabel as string | undefined;
  return [
    ...(label ? [label] : []),
    ...(node.children ?? []).flatMap((child) =>
      typeof child === "string" ? [child] : readingOrder(child),
    ),
  ];
}
afterEach(() => mockViewSession?.dispose());
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
  mockViewSession = createHomeViewSession();
});

test("adaptive Home keeps room selection and explicit view choice across breakpoints", () => {
  mockDesktop = true;
  const screen = render(<HomeScreen />);
  expect(screen.UNSAFE_getByType(CockpitSceneView).props.cameraMode).toBe(
    "model",
  );
  fireEvent.press(screen.getByLabelText("Select Kitchen on plan"));
  fireEvent.press(screen.getByRole("tab", { name: "2D plan" }));
  mockDesktop = false;
  screen.rerender(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Show rooms on plan" }));
  expect(
    screen.getByRole("tab", { name: "2D plan", selected: true }),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Select Kitchen on plan").props.accessibilityState
      .selected,
  ).toBe(true);
  mockDesktop = true;
  screen.rerender(<HomeScreen />);
  expect(screen.UNSAFE_queryByType(CockpitSceneView)).toBeNull();
  fireEvent.press(screen.getByRole("tab", { name: "3D view" }));
  mockDesktop = false;
  screen.rerender(<HomeScreen />);
  expect(screen.UNSAFE_getByType(CockpitSceneView).props.cameraMode).toBe(
    "orbit",
  );
  expect(screen.UNSAFE_getByType(CockpitSceneView).props.selectedRoomId).toBe(
    sampleHouse.floors[0]!.rooms[1]!.id,
  );
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

test("compact and wide homes read attention, house, filters then the same single cards", () => {
  const cardsAt = (desktop: boolean) => {
    mockDesktop = desktop;
    const screen = render(<HomeScreen />);
    const order = readingOrder(screen.toJSON());
    const attention = order.indexOf("Needs attention");
    const house = order.findIndex((text) => /^Open .+ floor plan$/.test(text));
    const filters = order.indexOf("All rooms");
    const cards = order.filter((text) => text.startsWith("Open device: "));
    expect(attention).toBeGreaterThanOrEqual(0);
    expect(attention).toBeLessThan(house);
    expect(house).toBeLessThan(filters);
    expect(filters).toBeLessThan(order.indexOf(cards[0]!));
    expect(
      screen.getByRole("header", { name: "Around your home" }),
    ).toBeTruthy();
    screen.unmount();
    return cards;
  };
  const compact = cardsAt(false);
  expect(compact.length).toBeGreaterThan(1);
  expect(new Set(compact).size).toBe(compact.length);
  expect(cardsAt(true)).toEqual(compact);
});

test("favorites lead All rooms without repeating in their room group", () => {
  const { snapshot, preferences } = useCockpit.getState();
  useCockpit.setState({
    preferences: {
      ...preferences,
      favorites: [snapshot!.entities["fan.office_vent"]!.key],
    },
  });
  const screen = render(<HomeScreen />);
  const order = readingOrder(screen.toJSON());
  const firstCard = order.findIndex((text) => text.startsWith("Open device: "));
  expect(order.indexOf("Favorites")).toBeLessThan(firstCard);
  expect(order[firstCard]).toBe("Open device: Office booster vent");
  expect(
    screen.getAllByLabelText("Open device: Office booster vent"),
  ).toHaveLength(1);
  fireEvent.press(screen.getByRole("tab", { name: "Office" }));
  expect(screen.queryByText("Favorites")).toBeNull();
  expect(
    screen.getAllByLabelText("Open device: Office booster vent"),
  ).toHaveLength(1);
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

test("hiding a selected area's readings keeps its selection and explains the empty result", () => {
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
    screen.getByRole("tab", { name: "Kitchen", selected: true }),
  ).toBeTruthy();
  expect(
    screen.queryByLabelText("Open device: Office booster vent"),
  ).toBeNull();
  expect(
    screen.getByText("No visible devices in this selection."),
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

function linkSample() {
  const spatial = resetSpatial(sampleHouse);
  spatial.areaLinks = { "sample-1-1": "kitchen", "sample-2-1": "office" };
  useCockpit.setState({
    preferences: { ...useCockpit.getState().preferences, spatial },
  });
}

test("area and plan room controls share selection across floors and resize", () => {
  linkSample();
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Office" }));
  fireEvent.press(screen.getByRole("button", { name: "Show rooms on plan" }));
  expect(
    screen.getByRole("tab", { name: "Floor 2", selected: true }),
  ).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "Select Study on plan", selected: true }),
  ).toBeTruthy();
  mockDesktop = true;
  screen.rerender(<HomeScreen />);
  expect(
    screen.getByRole("tab", { name: "Select Study on plan", selected: true }),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Floor 1" }));
  expect(
    screen.getByRole("tab", { name: "All rooms", selected: true }),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Select Kitchen on plan" }));
  expect(
    within(screen.getByLabelText("Filter devices by area")).getByRole("tab", {
      name: "Kitchen",
      selected: true,
    }),
  ).toBeTruthy();
  expect(
    screen.queryByLabelText("Open device: Office booster vent"),
  ).toBeNull();
  fireEvent.press(screen.getByLabelText("Open device: Kitchen fridge"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/appliance/[id]",
    params: { id: "demo-fridge", profile: "demo" },
  });
  const effect = jest.mocked(useFocusEffect).mock.calls.at(-1)![0];
  act(() => {
    const blur = effect();
    if (blur) blur();
    effect();
  });
  expect(
    screen.getByRole("tab", { name: "Select Kitchen on plan", selected: true }),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Show all rooms" }));
  expect(
    screen.getByRole("tab", { name: "Floor 1", selected: true }),
  ).toBeTruthy();
});

test("unlinked rooms explain their empty results and remain usable without a snapshot", () => {
  mockDesktop = true;
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Select Kitchen on plan" }));
  expect(screen.getByText("Room not linked")).toBeTruthy();
  expect(screen.queryByLabelText("Open device: Kitchen fridge")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Link this room" }));
  expect(router.push).toHaveBeenCalledWith("/house-links");
  act(() => useCockpit.setState({ snapshot: null }));
  expect(
    screen.getByRole("tab", { name: "Select Kitchen on plan", selected: true }),
  ).toBeTruthy();
});

test("Home intent survives route remounts, but not a scope change while Home is absent", () => {
  linkSample();
  mockDesktop = true;
  const tree = (shown: boolean) => (
    <HomeViewProvider session={mockViewSession}>
      {shown && <Home />}
    </HomeViewProvider>
  );
  const screen = render(tree(true));
  fireEvent.press(screen.getByRole("tab", { name: "Office" }));
  screen.rerender(tree(false));
  screen.rerender(tree(true));
  expect(
    screen.getByRole("tab", { name: "Select Study on plan", selected: true }),
  ).toBeTruthy();
  screen.rerender(tree(false));
  act(() => useCockpit.setState({ profileId: "other-home" }));
  act(() => useCockpit.setState({ profileId: "demo" }));
  screen.rerender(tree(true));
  expect(
    screen.getByRole("tab", { name: "All rooms", selected: true }),
  ).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "Floor 1", selected: true }),
  ).toBeTruthy();
});

test("fresh area deletion clears selection, while a reconnect's missing registry preserves it", () => {
  linkSample();
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Office" }));
  const snapshot = useCockpit.getState().snapshot!;
  act(() =>
    useCockpit.setState({
      snapshot: {
        ...snapshot,
        areas: {},
        metadata: {
          ...snapshot.metadata,
          areas: { kind: "stale", lastLoadedAt: null, reason: "timeout" },
        },
      },
    }),
  );
  expect(
    screen.getByRole("tab", { name: "Selected area", selected: true }),
  ).toBeTruthy();
  expect(screen.getByText(/Area registry not verified/)).toBeTruthy();
  act(() => useCockpit.setState({ snapshot: { ...snapshot, areas: {} } }));
  expect(
    screen.getByRole("tab", { name: "All rooms", selected: true }),
  ).toBeTruthy();
});

test.each(["floor", "profile", "revision", "hidden", "blur", "unmount"])(
  "delayed marker callbacks reject an obsolete scope: %s",
  (change) => {
    mockDesktop = true;
    useCockpit.setState({
      preferencesLoadedFor: "demo",
      snapshot: fixtureSnapshot(),
      preferences: fixturePreferences({ stable: location }),
    });
    const screen = render(<HomeScreen />);
    const marker = screen.UNSAFE_getByType(HomePlanOverview).props.onMarker;
    if (change === "floor")
      fireEvent.press(screen.getByRole("tab", { name: "Floor 2" }));
    if (change === "profile")
      act(() => useCockpit.setState({ profileId: "other" }));
    if (change === "revision")
      act(() => {
        const preferences = useCockpit.getState().preferences;
        useCockpit.setState({
          preferences: {
            ...preferences,
            spatial: {
              ...preferences.spatial,
              plan: {
                ...preferences.spatial.plan!,
                revision: preferences.spatial.plan!.revision + 1,
              },
            },
          },
        });
      });
    if (change === "hidden")
      act(() =>
        useCockpit.setState({
          preferences: {
            ...useCockpit.getState().preferences,
            visibility: { stable: "hidden" },
          },
        }),
      );
    if (change === "blur")
      act(() => {
        const cleanup = jest.mocked(useFocusEffect).mock.calls.at(-1)![0]();
        if (cleanup) cleanup();
      });
    if (change === "unmount") screen.unmount();
    act(() => marker("stable"));
    expect(router.push).not.toHaveBeenCalled();
  },
);

test("current markers navigate through placement validation without clearing selection", () => {
  mockDesktop = true;
  const preferences = fixturePreferences({ stable: location });
  preferences.spatial.areaLinks = { "sample-1-1": "kitchen" };
  useCockpit.setState({
    preferencesLoadedFor: "demo",
    snapshot: fixtureSnapshot(),
    preferences,
  });
  const screen = render(<HomeScreen />);
  fireEvent.press(
    within(screen.getByLabelText("Filter devices by area")).getByRole("tab", {
      name: "Kitchen",
    }),
  );
  act(() => screen.UNSAFE_getByType(HomePlanOverview).props.onMarker("stable"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/device/[key]",
    params: { key: "stable", profile: "demo" },
  });
  expect(
    within(screen.getByLabelText("Filter devices by area")).getByRole("tab", {
      name: "Kitchen",
      selected: true,
    }),
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
test("a desktop Home beside the detail panel stacks attention above the house when its column is narrow", () => {
  mockDesktop = true;
  const screen = render(<HomeScreen />);
  const overview = screen.getByTestId("home-overview");
  const layout = (width: number) =>
    fireEvent(overview, "layout", { nativeEvent: { layout: { width } } });
  expect(overview).toHaveStyle({ flexDirection: "row" });
  layout(632);
  expect(screen.getByTestId("home-overview")).not.toHaveStyle({
    flexDirection: "row",
  });
  // The plan keeps its desktop presentation: opening the panel never swaps the scene.
  expect(screen.UNSAFE_getByType(CockpitSceneView).props.cameraMode).toBe(
    "model",
  );
  layout(736);
  expect(screen.getByTestId("home-overview")).toHaveStyle({
    flexDirection: "row",
  });
  screen.unmount();
});
test("the device list title is the focus fallback when an origin card has gone", () => {
  const screen = render(<HomeScreen />);
  const title = screen.getByRole("header", { name: "Around your home" });
  expect(title.props.nativeID).toBe("home-list-title");
  expect(title.props.tabIndex).toBe(-1);
  screen.unmount();
});

test("category quick filters narrow the visible devices and toggle back to all", () => {
  const screen = render(<HomeScreen />);
  expect(screen.getByText("Cat feeder")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: /Filter by lights/ }));
  expect(screen.getByText("Living room lamp")).toBeTruthy();
  expect(screen.queryByText("Cat feeder")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: /Filter by lights/ }));
  expect(screen.getByText("Cat feeder")).toBeTruthy();
  screen.unmount();
});

test("the compact architectural preview opens the full floor plan", () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(
    screen.getByRole("button", { name: /architectural preview/ }),
  );
  expect(router.push).toHaveBeenCalledWith("/house");
  screen.unmount();
});
