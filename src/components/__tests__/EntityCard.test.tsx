import { renderAsync } from "@testing-library/react-native";
import { EntityCard, readingTint } from "../EntityCard";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { useCockpit } from "../../core/store";
import { entity } from "../../commands/__tests__/fixtures";
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
test("a switch takes its active colour only from a ready On observation", () => {
  const lit = "lit";
  const idle = "idle";
  const tint = (state: string, ready = true) =>
    readingTint(entity({ state }), ready, lit, idle);
  expect(tint("on")).toBe(lit);
  expect(tint("off")).toBe(idle);
  // Cached, unknown and unavailable keep the colour their condition was given
  // (grey or amber upstream): a known Off must not be mistaken for them.
  expect(tint("on", false)).toBe(lit);
  expect(tint("off", false)).toBe(lit);
  expect(tint("unavailable")).toBe(lit);
  expect(tint("unknown")).toBe(lit);
  // Another kind of reading is never recoloured.
  expect(
    readingTint(
      entity({ domain: "lock", state: "locked" }),
      true,
      "lock",
      idle,
    ),
  ).toBe("lock");
});
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
