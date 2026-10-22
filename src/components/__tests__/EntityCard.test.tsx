import { renderAsync } from "@testing-library/react-native";
import { EntityCard } from "../EntityCard";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { useCockpit } from "../../core/store";
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
test("cached states are explicitly qualified instead of presenting a live lock state", async () => {
  const demo = new DemoBackend("component-proof");
  demo.onSnapshot((snapshot) => useCockpit.setState({ snapshot }));
  await demo.start();
  demo.stop();
  useCockpit.setState({ status: { kind: "reconnecting", lastReadyAt: null } });
  const screen = await renderAsync(<EntityCard entityId="lock.front_door" />);
  expect(screen.getByLabelText("Front door, Locked, cached")).toBeTruthy();
  expect(screen.getByText("Lock · Cached")).toBeTruthy();
});
test("each card placement is a distinct, stable focus origin for the detail panel", async () => {
  const demo = new DemoBackend("origin-proof");
  demo.onSnapshot((snapshot) => useCockpit.setState({ snapshot }));
  await demo.start();
  demo.stop();
  const row = await renderAsync(<EntityCard entityId="lock.front_door" />);
  const compact = await renderAsync(
    <EntityCard entityId="lock.front_door" layout="compact" />,
  );
  const id = (screen: typeof row) =>
    screen.getByLabelText(/^Front door,/).props.nativeID as string;
  expect(id(row)).toMatch(/^detail-origin-reading-/);
  expect(id(compact)).toMatch(/^detail-origin-reading-/);
  expect(id(row)).not.toBe(id(compact));
});
