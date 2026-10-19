import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { HousePlanScreen } from "../HousePlanScreen";
import { useCockpit } from "../../core/store";
import { emptyPreferences } from "../../preferences/types";
import { sampleHouse } from "../../spatial/plans";
import { resetSpatial } from "../../spatial/profilePlan";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { router, useFocusEffect } from "expo-router";
import { AccessibilityInfo } from "react-native";
import {
  fixtureEntity,
  fixtureSnapshot,
  fixturePreferences,
  location,
} from "../../spatial/__tests__/placementFixtures";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock("../../web/CockpitScene", () => () => null);

beforeEach(() =>
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    snapshot: null,
    status: { kind: "idle" },
    preferences: emptyPreferences(),
  }),
);
const withPlan = (edit: (plan: typeof sampleHouse) => void, revision = 1) => {
  const spatial = resetSpatial(sampleHouse);
  edit(spatial.plan!);
  spatial.seededFrom!.revision = revision;
  useCockpit.setState({
    preferences: { ...emptyPreferences(), spatial },
  });
};

test("the plan works without an HA connection and floor changes clear room selection", async () => {
  const screen = await renderAsync(<HousePlanScreen />);
  expect(
    screen.getByRole("tab", { name: "Floor 1", selected: true }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Explore Kitchen" })).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Floor 3" }));
  expect(screen.queryByRole("button", { name: "Explore Kitchen" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Explore Bedroom 2" }));
  expect(screen.getByRole("header", { name: "Bedroom 2" })).toBeTruthy();
  expect(screen.getByText("Not linked to a Home Assistant area.")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Floor 1" }));
  expect(screen.queryByRole("header", { name: "Bedroom 2" })).toBeNull();
});

test("placed markers and their list share stable navigation and isolate floors", async () => {
  useCockpit.setState({
    preferencesLoadedFor: "demo",
    snapshot: fixtureSnapshot(),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
    preferences: fixturePreferences({ stable: location }),
  });
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent(screen.getByTestId("plan-frame"), "layout", {
    nativeEvent: { layout: { width: 348, height: 360 } },
  });
  fireEvent.press(screen.getByTestId("plan-marker-stable"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/device/[key]",
    params: { key: "stable" },
  });
  fireEvent.press(screen.getByRole("button", { name: "Reposition Test lamp" }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/house-place",
    params: { key: "stable" },
  });
  fireEvent.press(screen.getByRole("tab", { name: "Floor 2" }));
  expect(screen.queryByTestId("plan-marker-stable")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open placed Test lamp" }),
  ).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Place device" }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/house-place",
    params: { floor: "sample-floor-2" },
  });
});

test.each([
  "current",
  "removed",
  "hidden",
  "profile",
  "plan",
  "floor",
  "view",
  "blur",
])("return accessibility focus revalidates its origin: %s", async (change) => {
  useCockpit.setState({
    preferencesLoadedFor: "demo",
    snapshot: fixtureSnapshot(),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
    preferences: fixturePreferences({ stable: location }),
  });
  let frame: FrameRequestCallback | undefined;
  const raf = jest.spyOn(global, "requestAnimationFrame");
  const enabled = jest
    .spyOn(AccessibilityInfo, "isScreenReaderEnabled")
    .mockResolvedValue(true);
  const focus = jest
    .spyOn(AccessibilityInfo, "sendAccessibilityEvent")
    .mockImplementation(() => {});
  try {
    const screen = await renderAsync(<HousePlanScreen />);
    fireEvent(screen.getByTestId("plan-frame"), "layout", {
      nativeEvent: { layout: { width: 348, height: 360 } },
    });
    fireEvent.press(screen.getByTestId("plan-marker-stable"));
    const effect = jest.mocked(useFocusEffect).mock.calls.at(-1)![0];
    raf.mockImplementationOnce((cb) => {
      frame = cb;
      return 1;
    });
    let cleanup: void | (() => void);
    act(() => {
      cleanup = effect();
    });
    // The profile may reconcile a hidden/removed identity before native focus resolves.
    await act(async () => {
      if (change === "removed")
        useCockpit.setState({ preferences: fixturePreferences({}) });
      if (change === "hidden")
        useCockpit.setState({
          preferences: {
            ...fixturePreferences({ stable: location }),
            visibility: { stable: "hidden" },
          },
        });
      if (change === "profile") useCockpit.setState({ profileId: "another" });
      if (change === "plan")
        withPlan((plan) => {
          plan.id = "replacement";
        });
      if (change === "floor")
        fireEvent.press(screen.getByRole("tab", { name: "Floor 2" }));
      if (change === "view")
        fireEvent.press(screen.getByRole("tab", { name: "3D view" }));
      if (change === "blur") cleanup?.();
    });
    await act(async () => frame!(0));
    if (change !== "current") expect(focus).not.toHaveBeenCalled();
    else {
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus.mock.calls[0]![1]).toBe("focus");
    }
    act(() => {
      cleanup?.();
    });
    await screen.unmountAsync();
  } finally {
    raf.mockRestore();
    enabled.mockRestore();
    focus.mockRestore();
  }
});

test("marker state becomes cached or unavailable and hidden entities keep only their saved metadata", async () => {
  const preferences = fixturePreferences({ stable: location });
  useCockpit.setState({
    snapshot: fixtureSnapshot(),
    preferences,
    status: { kind: "reconnecting", lastReadyAt: null },
  });
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent(screen.getByTestId("plan-frame"), "layout", {
    nativeEvent: { layout: { width: 348, height: 360 } },
  });
  expect(
    screen.getByRole("button", { name: "Test lamp, Off · Cached" }),
  ).toBeTruthy();
  await act(async () =>
    useCockpit.setState({
      snapshot: fixtureSnapshot([fixtureEntity({ state: "unavailable" })]),
      status: { kind: "ready", haVersion: "Demo", readySince: "" },
    }),
  );
  expect(
    screen.getByRole("button", { name: "Test lamp, Unavailable" }),
  ).toBeTruthy();
  await act(async () =>
    useCockpit.setState({
      preferences: { ...preferences, visibility: { stable: "hidden" } },
    }),
  );
  expect(screen.queryByTestId("plan-marker-stable")).toBeNull();
  expect(useCockpit.getState().preferences.spatial.placements.stable).toEqual(
    location,
  );
  expect(
    screen.getByText(/Some saved placements cannot be shown/),
  ).toBeTruthy();
});

test("placement markers use the same connectivity polarity and wording as Home", async () => {
  useCockpit.setState({
    snapshot: fixtureSnapshot([
      fixtureEntity({
        domain: "binary_sensor",
        state: "off",
        attributes: { device_class: "connectivity" },
      }),
    ]),
    status: { kind: "ready", haVersion: "Test", readySince: "" },
    preferences: fixturePreferences({ stable: location }),
  });
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent(screen.getByTestId("plan-frame"), "layout", {
    nativeEvent: { layout: { width: 348, height: 360 } },
  });
  expect(
    screen.getByRole("button", { name: "Test lamp, Disconnected" }),
  ).toBeTruthy();
  await act(async () =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(
    screen.getByRole("button", { name: "Test lamp, Disconnected · Cached" }),
  ).toBeTruthy();
});

test("retained HA area names stay qualified after a failed registry refresh", async () => {
  const preferences = fixturePreferences();
  preferences.spatial.areaLinks = { "sample-1-1": "kitchen" };
  useCockpit.setState({ snapshot: fixtureSnapshot(), preferences });
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Explore Kitchen" }));
  await act(async () =>
    useCockpit.setState({
      snapshot: {
        ...fixtureSnapshot(),
        metadata: {
          ...fixtureSnapshot().metadata,
          areas: {
            kind: "stale",
            lastLoadedAt: "earlier",
            reason: "forbidden",
          },
        },
      },
    }),
  );
  expect(
    screen.getByText(/Home Assistant area: Kitchen \(cached, not verified\)/),
  ).toBeTruthy();
});

test("touching a room polygon selects that room", async () => {
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent.press(
    screen.getByTestId("plan-room-sample-1-1", { includeHiddenElements: true }),
  );
  expect(screen.getByRole("header", { name: "Kitchen" })).toBeTruthy();
  expect(
    screen.getByText("No dimensions supplied for this space."),
  ).toBeTruthy();
});

test("the profile's saved plan is shown, with a notice when the default has changed", async () => {
  withPlan((plan) => {
    plan.name = "Saved home";
  }, 2);
  const screen = await renderAsync(<HousePlanScreen />);
  expect(screen.getByText("Saved home")).toBeTruthy();
  expect(screen.getByText(/A newer default plan is available/)).toBeTruthy();
});

test("a selected floor deleted from the saved plan falls back safely", async () => {
  withPlan(() => undefined);
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Floor 3" }));
  fireEvent.press(screen.getByRole("button", { name: "Explore Bedroom 2" }));
  await act(async () =>
    withPlan((plan) => {
      plan.floors = plan.floors.slice(0, 2);
    }),
  );
  expect(screen.queryByRole("tab", { name: "Floor 3" })).toBeNull();
  expect(screen.queryByRole("header", { name: "Bedroom 2" })).toBeNull();
  expect(screen.getByRole("button", { name: "Explore Kitchen" })).toBeTruthy();
});

test("replacing the displayed plan resets floor and room selection even with the same provenance", async () => {
  withPlan(() => undefined);
  const screen = await renderAsync(<HousePlanScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "Floor 3" }));
  fireEvent.press(screen.getByRole("button", { name: "Explore Bedroom 2" }));
  await act(async () => {
    const { spatial } = useCockpit.getState().preferences;
    useCockpit.setState({
      preferences: {
        ...emptyPreferences(),
        spatial: { ...spatial, plan: { ...spatial.plan!, revision: 7 } },
      },
    });
  });
  expect(
    screen.getByRole("tab", { name: "Floor 1", selected: true }),
  ).toBeTruthy();
  expect(screen.queryByRole("header", { name: "Bedroom 2" })).toBeNull();
});

test("a linked room lists the devices of its HA area and opens them", async () => {
  let demo: import("../../core/types").HomeSnapshot | undefined;
  const backend = new DemoBackend("plan-links");
  backend.onSnapshot((snapshot) => (demo = snapshot));
  await backend.start();
  backend.stop();
  const spatial = resetSpatial(sampleHouse);
  spatial.areaLinks = { "sample-1-1": "kitchen" };
  useCockpit.setState({
    snapshot: demo!,
    preferences: { ...emptyPreferences(), spatial },
  });
  const screen = await renderAsync(<HousePlanScreen />);
  expect(screen.getByText(/^11 entities$/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Explore Kitchen" }));
  expect(screen.getByText(/Home Assistant area: Kitchen/)).toBeTruthy();
  fireEvent.press(
    screen.getByRole("button", { name: "Open Fridge temperature" }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/device/[key]",
    params: { key: expect.stringContaining("fridge") },
  });
  expect(screen.queryByRole("button", { name: "Open Front door" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Explore Living room" }));
  expect(screen.getByText("Not linked to a Home Assistant area.")).toBeTruthy();
});
