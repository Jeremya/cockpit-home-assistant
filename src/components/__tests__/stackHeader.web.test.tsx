import { StyleSheet, type ViewStyle } from "react-native";
import { HeaderBackButton } from "expo-router/react-navigation";
import { stackHeaderLeft } from "../stackHeader.web";

const props = {
  canGoBack: true,
  label: "Home",
  href: "/",
  onPress: jest.fn(),
  tintColor: "#fff",
};

test("the web Stack back link keeps its label and action and gets a 48 px target", () => {
  const element = stackHeaderLeft(props) as React.ReactElement<{
    style: ViewStyle;
    label: string;
    href: string;
    onPress: () => void;
  }>;
  expect(element.type).toBe(HeaderBackButton);
  expect(element.props.label).toBe("Home");
  expect(element.props.href).toBe("/");
  expect(element.props.onPress).toBe(props.onPress);
  const style = StyleSheet.flatten(element.props.style);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
});

test("a first screen draws no back link on web", () => {
  expect(stackHeaderLeft({ ...props, canGoBack: false })).toBeNull();
});
