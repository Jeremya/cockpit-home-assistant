import { act, fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import { DeviceSummaryContent } from "../DeviceSummaryContent";
import { useCockpit } from "../../../core/store";
import { emptyPreferences } from "../../../preferences/types";
import { publicDeviceFixture } from "../../../core/__tests__/deviceFixtures";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => {
    throw new Error("Detail content must not read route parameters");
  },
  router: { push: jest.fn() },
}));
// A desktop-wide browser must not decide the layout of a measured column.
jest.mock("../../layout", () => ({
  useResponsiveLayout: () => ({ desktop: true, width: 1920, height: 1080 }),
}));
jest.mock("../../../services/runtime", () => ({
  session: { updatePreferences: jest.fn() },
}));
jest.mock("../../EntityIcon", () => ({
  ...jest.requireActual("../../EntityIcon"),
  Icon: () => null,
}));

function twoDevices() {
  const snapshot = publicDeviceFixture();
  const network = snapshot.entities["binary_sensor.public_5"]!;
  snapshot.entities[network.entityId] = { ...network, deviceId: "router" };
  snapshot.devices.router = {
    id: "router",
    name: "Public router",
    manufacturer: null,
    model: null,
    areaId: "kitchen",
    entityIds: [network.entityId],
  };
  return snapshot;
}
/** The handler a rendered card received, invoked later as a delayed tap would be. */
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

test.each([0, 360, 440])(
  "a %ipx measured column stays single even in a desktop-wide browser",
  (width) => {
    const screen = render(
      <DeviceSummaryContent
        profileId="public-home"
        deviceId="feeder"
        width={width}
      />,
    );
    expect(screen.getByTestId("device-summary-columns")).toHaveStyle({
      flexDirection: "column",
    });
    expect(screen.getByText("Public cat feeder")).toBeTruthy();
  },
);
test("a measured width with room for two columns places them side by side", () => {
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={760}
    />,
  );
  expect(screen.getByTestId("device-summary-columns")).toHaveStyle({
    flexDirection: "row",
  });
});
test("injected reading navigation receives only revalidated canonical destinations", () => {
  const onOpenReading = jest.fn();
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
      onOpenReading={onOpenReading}
    />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Show all 7 readings" }));
  fireEvent.press(screen.getByLabelText("Vendor battery, low"));
  expect(onOpenReading).toHaveBeenCalledWith({
    kind: "reading",
    profileId: "public-home",
    entityKey: "reading-6",
  });
  expect(router.push).not.toHaveBeenCalled();
});
test("without an injected callback a reading keeps its existing route", () => {
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
    />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Show all 7 readings" }));
  fireEvent.press(screen.getByLabelText("Vendor battery, low"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/device/[key]",
    params: { key: "reading-6", profile: "public-home" },
  });
});
test.each([
  [
    "hidden",
    () =>
      useCockpit.setState({
        preferences: {
          ...emptyPreferences(),
          visibility: { "reading-6": "hidden" },
        },
      }),
  ],
  [
    "removed",
    () => {
      const snapshot = publicDeviceFixture();
      delete snapshot.entities["sensor.public_6"];
      useCockpit.setState({ snapshot });
    },
  ],
  ["in another profile", () => useCockpit.setState({ profileId: "other" })],
])("a delayed reading tap is refused once its target is %s", (_, change) => {
  const onOpenReading = jest.fn();
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
      onOpenReading={onOpenReading}
    />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Show all 7 readings" }));
  const press = savedPress(screen.getByLabelText("Vendor battery, low"));
  act(change);
  press();
  expect(onOpenReading).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
test("the same device ID in another profile is not shown for the old target", () => {
  useCockpit.setState({ profileId: "another-home" });
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
    />,
  );
  expect(screen.getByText("Device unavailable")).toBeTruthy();
  expect(screen.queryByText("Public cat feeder")).toBeNull();
});
test("changing the target does not carry the expanded readings to another device", () => {
  useCockpit.setState({ snapshot: twoDevices() });
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
    />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Show all 6 readings" }));
  expect(screen.getByTestId("device-readings")).toBeTruthy();
  screen.rerender(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="router"
      width={400}
    />,
  );
  expect(screen.getByText("Public router")).toBeTruthy();
  expect(screen.queryByTestId("device-readings")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Show all 1 readings" }),
  ).toBeTruthy();
});
test("the device name is one focusable heading the panel can move focus to", () => {
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
    />,
  );
  const title = screen.getByTestId("detail-title");
  expect(title.props.accessibilityRole).toBe("header");
  expect(title.props.tabIndex).toBe(-1);
  expect(screen.getAllByTestId("detail-title")).toHaveLength(1);
  expect(title).toHaveTextContent("Public cat feeder");
});
test("before any home is connected the target asks for a connection, not removal", () => {
  useCockpit.setState({ profileId: null, snapshot: null });
  const screen = render(
    <DeviceSummaryContent
      profileId="public-home"
      deviceId="feeder"
      width={400}
    />,
  );
  expect(screen.getByText("Not connected")).toBeTruthy();
  expect(screen.queryByText("Device unavailable")).toBeNull();
  expect(screen.getByTestId("detail-title")).toHaveTextContent("Not connected");
});
