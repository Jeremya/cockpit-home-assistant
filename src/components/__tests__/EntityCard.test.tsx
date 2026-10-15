import { render } from "@testing-library/react-native";
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
  const screen = await render(<EntityCard entityId="lock.front_door" />);
  expect(screen.getByLabelText("Front door, Locked, cached")).toBeTruthy();
  expect(screen.getByText("Lock · Cached")).toBeTruthy();
});
