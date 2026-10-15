import { fireEvent, renderAsync } from "@testing-library/react-native";
import { HousePlanScreen } from "../HousePlanScreen";
import { useCockpit } from "../../core/store";

beforeEach(() =>
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    snapshot: null,
    status: { kind: "idle" },
  }),
);

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
