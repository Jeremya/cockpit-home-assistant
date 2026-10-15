import { act, fireEvent, renderAsync } from "@testing-library/react-native";
import { HousePlanScreen } from "../HousePlanScreen";
import { useCockpit } from "../../core/store";
import { emptyPreferences } from "../../preferences/types";
import { sampleHouse } from "../../spatial/plans";
import { resetSpatial } from "../../spatial/profilePlan";

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
  expect(screen.getByText("Device locations have not been set.")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "Floor 1" }));
  expect(screen.queryByRole("header", { name: "Bedroom 2" })).toBeNull();
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
