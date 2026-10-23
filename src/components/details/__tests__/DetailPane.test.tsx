import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { DetailPane } from "../DetailPane";

jest.mock("../../EntityIcon", () => ({
  ...jest.requireActual("../../EntityIcon"),
  Icon: () => null,
}));

test("the panel is a named, non-modal region with one close action", () => {
  const onClose = jest.fn();
  const screen = render(
    <DetailPane
      width={389}
      canGoBack={false}
      onBack={jest.fn()}
      onClose={onClose}
    >
      <Text>Body</Text>
    </DetailPane>,
  );
  const pane = screen.getByTestId("detail-panel");
  expect(pane.props.role).toBe("region");
  expect(pane.props["aria-label"]).toBe("Details");
  expect(pane.props["aria-modal"]).toBeUndefined();
  expect(pane).toHaveStyle({ width: 389 });
  expect(
    screen.queryByRole("button", { name: "Back to previous detail" }),
  ).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Close details" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Body")).toBeTruthy();
});
test("a drill-down inside the panel offers one step back", () => {
  const onBack = jest.fn();
  const screen = render(
    <DetailPane width={360} canGoBack onBack={onBack} onClose={jest.fn()}>
      <Text>Body</Text>
    </DetailPane>,
  );
  fireEvent.press(
    screen.getByRole("button", { name: "Back to previous detail" }),
  );
  expect(onBack).toHaveBeenCalledTimes(1);
});
test("route presentation keeps the same nesting without panel chrome", () => {
  const screen = render(
    <DetailPane
      framed={false}
      width={389}
      canGoBack
      onBack={jest.fn()}
      onClose={jest.fn()}
    >
      <Text>Body</Text>
    </DetailPane>,
  );
  expect(screen.queryByTestId("detail-panel")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Body")).toBeTruthy();
});
