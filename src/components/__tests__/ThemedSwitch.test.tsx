import { StyleSheet, Switch } from "react-native";
import { render } from "@testing-library/react-native";
import { ThemedSwitch } from "../ui";

test("the native switch's own box is the 48 dp target (Android ignores hitSlop)", () => {
  const view = render(
    <ThemedSwitch
      accessibilityLabel="Show Front door"
      value
      onValueChange={() => {}}
    />,
  );
  const style = StyleSheet.flatten(view.UNSAFE_getByType(Switch).props.style);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
});
