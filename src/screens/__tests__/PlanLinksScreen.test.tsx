import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { session } from "../../services/runtime";
import { PlanLinksScreen } from "../PlanLinksScreen";
import { useCockpit } from "../../core/store";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { emptyPreferences } from "../../preferences/types";
import { resetSpatial } from "../../spatial/profilePlan";
import { sampleHouse } from "../../spatial/plans";
import type { HomeSnapshot } from "../../core/types";

jest.mock("../../services/runtime", () => {
  const { useCockpit: store } = jest.requireActual("../../core/store");
  return {
    session: {
      notice: jest.fn(),
      updatePreferences: jest.fn((update) => {
        const state = store.getState();
        if (state.preferencesLoadedFor !== state.profileId) return false;
        store.setState({ preferences: update(state.preferences) });
        return true;
      }),
    },
  };
});

let demo: HomeSnapshot;
beforeAll(async () => {
  const backend = new DemoBackend("links-proof");
  backend.onSnapshot((snapshot) => (demo = snapshot));
  await backend.start();
  backend.stop();
});
beforeEach(() =>
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    preferencesLoadedFor: "demo",
    snapshot: demo,
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
    preferences: { ...emptyPreferences(), spatial: resetSpatial(sampleHouse) },
  }),
);
const links = () => useCockpit.getState().preferences.spatial.areaLinks;

test("a room is linked only by an explicit choice, and an area moves between rooms", async () => {
  const screen = await renderAsync(<PlanLinksScreen />);
  expect(screen.getAllByText("Floor 1 · Unlinked")).toHaveLength(2);
  expect(links()).toEqual({});
  fireEvent.press(
    screen.getByRole("button", { name: "Link Living room, Floor 1" }),
  );
  fireEvent.press(screen.getByRole("radio", { name: "Living room" }));
  expect(links()).toEqual({ "sample-1-0": "living" });
  expect(
    screen.getByText(/Floor 1 · Living room · \d+ entit(y|ies)/),
  ).toBeTruthy();

  fireEvent.press(
    screen.getByRole("button", { name: "Link Kitchen, Floor 1" }),
  );
  expect(
    screen.getByText("Moves the link from Living room · Floor 1"),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("radio", { name: "Living room" }));
  expect(links()).toEqual({ "sample-1-1": "living" });

  fireEvent.press(
    screen.getByRole("button", { name: "Link Kitchen, Floor 1" }),
  );
  fireEvent.press(screen.getByRole("radio", { name: "Unlinked" }));
  expect(links()).toEqual({});
});

test("without HA areas the screen explains what to do instead of offering a blank picker", async () => {
  useCockpit.setState({ snapshot: { ...demo, areas: {} } });
  const screen = await renderAsync(<PlanLinksScreen />);
  expect(screen.getByText(/Home Assistant has no areas yet/)).toBeTruthy();
  fireEvent.press(
    screen.getByRole("button", { name: "Link Living room, Floor 1" }),
  );
  expect(
    screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel),
  ).toEqual(["Unlinked"]);
});

test("offline or with a stale registry, existing links are kept and marked unverified", async () => {
  useCockpit.setState((state) => ({
    snapshot: null,
    preferences: {
      ...state.preferences,
      spatial: {
        ...state.preferences.spatial,
        areaLinks: { "sample-1-0": "living" },
      },
    },
  }));
  const screen = await renderAsync(<PlanLinksScreen />);
  expect(
    screen.getByText(/Connect to Home Assistant to choose areas/),
  ).toBeTruthy();
  expect(
    screen.getByText("Floor 1 · Linked to living (not verified)"),
  ).toBeTruthy();
  act(() =>
    useCockpit.setState({
      snapshot: {
        ...demo,
        areas: {},
        metadata: {
          ...demo.metadata,
          areas: { kind: "stale", lastLoadedAt: null, reason: "forbidden" },
        },
      },
    }),
  );
  expect(
    screen.getByText(/area names could not be loaded \(forbidden\)/),
  ).toBeTruthy();
  expect(links()).toEqual({ "sample-1-0": "living" });
});

test("a link to an area removed from HA is reported and kept until changed", async () => {
  useCockpit.setState((state) => ({
    preferences: {
      ...state.preferences,
      spatial: {
        ...state.preferences.spatial,
        areaLinks: { "sample-1-0": "garage" },
      },
    },
  }));
  const screen = await renderAsync(<PlanLinksScreen />);
  expect(
    screen.getByText("Floor 1 · Linked area was removed from Home Assistant"),
  ).toBeTruthy();
  expect(links()).toEqual({ "sample-1-0": "garage" });
});

test("links cannot be edited before the profile's preferences are loaded", async () => {
  useCockpit.setState({ preferencesLoadedFor: null });
  const screen = await renderAsync(<PlanLinksScreen />);
  expect(
    screen.getByText("Preferences for this profile are not loaded yet."),
  ).toBeTruthy();
  const row = screen.getByRole("button", { name: "Link Living room, Floor 1" });
  expect(row.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(row);
  expect(screen.queryByRole("radio")).toBeNull();
});

test("an open picker closes when the profile or the plan changes", async () => {
  const screen = await renderAsync(<PlanLinksScreen />);
  fireEvent.press(
    screen.getByRole("button", { name: "Link Living room, Floor 1" }),
  );
  expect(screen.getAllByRole("radio").length).toBeGreaterThan(1);
  act(() =>
    useCockpit.setState({
      profileId: "ha:other",
      preferencesLoadedFor: "ha:other",
    }),
  );
  expect(screen.queryByRole("radio")).toBeNull();

  fireEvent.press(
    screen.getByRole("button", { name: "Link Living room, Floor 1" }),
  );
  expect(screen.getAllByRole("radio").length).toBeGreaterThan(1);
  act(() =>
    useCockpit.setState((state) => ({
      preferences: {
        ...state.preferences,
        spatial: {
          ...state.preferences.spatial,
          plan: { ...state.preferences.spatial.plan!, revision: 9 },
        },
      },
    })),
  );
  expect(screen.queryByRole("radio")).toBeNull();
  expect(links()).toEqual({});
});

test("a choice from a picker whose context changed before rendering is refused", async () => {
  const screen = await renderAsync(<PlanLinksScreen />);
  fireEvent.press(
    screen.getByRole("button", { name: "Link Living room, Floor 1" }),
  );
  const option = screen.getByRole("radio", { name: "Office" });
  // The store moves on before React re-renders, and the tap lands on the picker
  // rendered for the old context. React's expected act() warning is muted here only.
  const error = jest
    .spyOn(console, "error")
    .mockImplementation((message: unknown, ...rest: unknown[]) => {
      if (!String(message).includes("not wrapped in act"))
        throw new Error(String(message) + rest.join(" "));
    });
  useCockpit.setState({
    profileId: "ha:other",
    preferencesLoadedFor: "ha:other",
  });
  fireEvent.press(option);
  expect(links()).toEqual({});
  expect(session.notice).toHaveBeenCalledWith(
    expect.stringContaining("The link was not saved"),
  );
  error.mockRestore();
});

test("a link named from a stale area registry is labelled as cached", async () => {
  useCockpit.setState((state) => ({
    snapshot: {
      ...demo,
      metadata: {
        ...demo.metadata,
        areas: { kind: "stale", lastLoadedAt: "earlier", reason: "timeout" },
      },
    },
    preferences: {
      ...state.preferences,
      spatial: {
        ...state.preferences.spatial,
        areaLinks: { "sample-1-0": "living" },
      },
    },
  }));
  const screen = await renderAsync(<PlanLinksScreen />);
  expect(
    screen.getByText(
      /Floor 1 · Living room \(cached, not verified\) · \d+ entit/,
    ),
  ).toBeTruthy();
});
