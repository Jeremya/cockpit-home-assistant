import { fireEvent, render } from "@testing-library/react-native";
import { HomeScreen } from "../HomeScreen";
import { useCockpit } from "../../core/store";
import { DemoBackend } from "../../session/demo/DemoBackend";
import { emptyPreferences } from "../../preferences/types";
import { router } from "expo-router";
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../services/runtime", () => ({
  session: { retry: jest.fn(), refresh: jest.fn(), connect: jest.fn() },
}));
test("demo home renders room observations and opens an entity by its stable key", async () => {
  const demo = new DemoBackend("screen-proof");
  demo.onSnapshot((snapshot) =>
    useCockpit.setState({
      initialized: true,
      snapshot,
      preferences: emptyPreferences(),
      mode: "demo",
      status: { kind: "ready", haVersion: "Demo", readySince: "" },
    }),
  );
  await demo.start();
  demo.stop();
  const screen = render(<HomeScreen />);
  expect(screen.getByText("Kitchen")).toBeTruthy();
  expect(screen.getByText("Office")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Front door, Locked"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/device/[key]",
    params: { key: "demo-lock.front_door" },
  });
  screen.unmount();
});
