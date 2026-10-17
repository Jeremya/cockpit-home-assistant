import { act, renderAsync } from "@testing-library/react-native";
import { DeviceDetailScreen } from "../DeviceDetailScreen";
import { useCockpit } from "../../core/store";
import {
  fixtureEntity,
  fixtureSnapshot,
  fixturePreferences,
} from "../../spatial/__tests__/placementFixtures";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ key: "stable" }),
}));
jest.mock("../../services/runtime", () => ({
  session: { updatePreferences: jest.fn() },
}));
jest.mock("../../components/EntityIcon", () => ({
  ...jest.requireActual("../../components/EntityIcon"),
  Icon: () => null,
}));

test("known value with unverified battery meaning is distinct from unavailable or cached", async () => {
  const value = fixtureEntity({
    domain: "sensor",
    state: "low",
    attributes: { device_class: "battery" },
  });
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    preferences: fixturePreferences(),
    snapshot: fixtureSnapshot([value]),
    status: { kind: "ready", haVersion: "Demo", readySince: "" },
  });
  const screen = await renderAsync(<DeviceDetailScreen />);
  expect(screen.getByText("low")).toBeTruthy();
  expect(screen.getByText(/Battery meaning not assessed/)).toBeTruthy();
  expect(
    screen.getByText(
      /A fresh HA connection does not confirm a recent device poll/,
    ),
  ).toBeTruthy();
  await act(async () =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(
    screen.getByText(/Cached observation. Current status cannot be assessed/),
  ).toBeTruthy();
  expect(screen.queryByText(/Battery meaning not assessed/)).toBeNull();
  await act(async () =>
    useCockpit.setState({
      status: { kind: "ready", haVersion: "Demo", readySince: "" },
      snapshot: fixtureSnapshot([{ ...value, state: "unavailable" }]),
    }),
  );
  expect(screen.getByText("Unavailable")).toBeTruthy();
  expect(screen.getByText(/Its physical state is not known/)).toBeTruthy();
});
