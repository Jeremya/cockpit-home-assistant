import { act, fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import { ReadingDetailContent } from "../ReadingDetailContent";
import { useCockpit } from "../../../core/store";
import { emptyPreferences } from "../../../preferences/types";
import { publicDeviceFixture } from "../../../core/__tests__/deviceFixtures";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => {
    throw new Error("Detail content must not read route parameters");
  },
  router: { push: jest.fn() },
}));
jest.mock("../../../services/runtime", () => ({
  session: { updatePreferences: jest.fn() },
}));
jest.mock("../../EntityIcon", () => ({
  ...jest.requireActual("../../EntityIcon"),
  Icon: () => null,
}));

function savedPress(node: ReturnType<ReturnType<typeof render>["getByRole"]>) {
  while (typeof node.props.onPress !== "function" && node.parent)
    node = node.parent;
  return node.props.onPress as () => void;
}
beforeEach(() => {
  useCockpit.setState({
    initialized: true,
    profileId: "public-home",
    mode: "homeAssistant",
    snapshot: publicDeviceFixture(),
    preferences: emptyPreferences(),
    status: { kind: "ready", haVersion: "2026.10.1", readySince: "" },
  });
});

test("an explicit profile and stable key resolve aliases without route parameters", () => {
  const preferences = emptyPreferences();
  preferences.identities.aliases.old = "reading-6";
  useCockpit.setState({ preferences });
  const screen = render(
    <ReadingDetailContent profileId="public-home" entityKey="old" />,
  );
  expect(screen.getByText("Vendor battery")).toBeTruthy();
  expect(screen.getByText("Observation details")).toBeTruthy();
});
test("the same entity key in another profile is unavailable for the old target", () => {
  useCockpit.setState({ profileId: "another-home" });
  const screen = render(
    <ReadingDetailContent profileId="public-home" entityKey="reading-6" />,
  );
  expect(screen.getByText("Entity unavailable")).toBeTruthy();
  expect(screen.queryByText("Vendor battery")).toBeNull();
});
test("raw attributes shown for one reading are not shown for the next target", () => {
  const screen = render(
    <ReadingDetailContent profileId="public-home" entityKey="reading-2" />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Show raw attributes" }));
  expect(screen.getByText(/"unit_of_measurement": "g"/)).toBeTruthy();
  screen.rerender(
    <ReadingDetailContent profileId="public-home" entityKey="reading-5" />,
  );
  expect(screen.getByText("Network")).toBeTruthy();
  expect(screen.queryByText(/unit_of_measurement/)).toBeNull();
  expect(
    screen.getByRole("button", { name: "Show raw attributes" }),
  ).toBeTruthy();
});
test("injected device navigation receives the revalidated parent device", () => {
  const onOpenDevice = jest.fn();
  const screen = render(
    <ReadingDetailContent
      profileId="public-home"
      entityKey="reading-6"
      onOpenDevice={onOpenDevice}
    />,
  );
  fireEvent.press(
    screen.getByRole("button", { name: "All readings for this device" }),
  );
  expect(onOpenDevice).toHaveBeenCalledWith({
    kind: "device",
    profileId: "public-home",
    deviceId: "feeder",
  });
  expect(router.push).not.toHaveBeenCalled();
});
test("without an injected callback the parent device keeps its existing route", () => {
  const screen = render(
    <ReadingDetailContent profileId="public-home" entityKey="reading-6" />,
  );
  fireEvent.press(
    screen.getByRole("button", { name: "All readings for this device" }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/appliance/[id]",
    params: { id: "feeder", profile: "public-home" },
  });
});
test.each([
  [
    "hidden",
    () =>
      useCockpit.setState({
        preferences: {
          ...emptyPreferences(),
          visibility: Object.fromEntries(
            Object.values(publicDeviceFixture().entities).map((entity) => [
              entity.key,
              "hidden" as const,
            ]),
          ),
        },
      }),
  ],
  [
    "removed",
    () =>
      useCockpit.setState({
        snapshot: { ...publicDeviceFixture(), entities: {} },
      }),
  ],
  ["in another profile", () => useCockpit.setState({ profileId: "other" })],
])(
  "a delayed parent-device tap is refused once its target is %s",
  (_, change) => {
    const onOpenDevice = jest.fn();
    const screen = render(
      <ReadingDetailContent
        profileId="public-home"
        entityKey="reading-6"
        onOpenDevice={onOpenDevice}
      />,
    );
    const press = savedPress(
      screen.getByRole("button", { name: "All readings for this device" }),
    );
    act(change);
    press();
    expect(onOpenDevice).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  },
);
test("the reading name is one focusable heading the panel can move focus to", () => {
  const screen = render(
    <ReadingDetailContent profileId="public-home" entityKey="reading-6" />,
  );
  const title = screen.getByTestId("detail-title");
  expect(title.props.accessibilityRole).toBe("header");
  expect(title.props.tabIndex).toBe(-1);
  expect(title).toHaveTextContent("Vendor battery");
});
test("before any home is connected the reading asks for a connection, not removal", () => {
  useCockpit.setState({ profileId: null, snapshot: null });
  const screen = render(
    <ReadingDetailContent profileId="public-home" entityKey="reading-6" />,
  );
  expect(screen.getByText("Not connected")).toBeTruthy();
  expect(screen.queryByText("Entity unavailable")).toBeNull();
});
