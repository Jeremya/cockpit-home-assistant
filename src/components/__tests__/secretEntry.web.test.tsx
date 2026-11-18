/** @jest-environment jsdom */
import { act, type ComponentType, type ReactNode } from "react";
import type { TextInputProps } from "react-native";
import { secretEntryProps } from "../secretEntry";

// The web build renders TextInput through react-native-web: assert the DOM it
// emits. Neither package ships types here, so only what the test uses is typed.
const { createRoot } = jest.requireActual<{
  createRoot: (node: Element) => {
    render: (node: ReactNode) => void;
    unmount: () => void;
  };
}>("react-dom/client");
const { TextInput } = jest.requireActual<{
  TextInput: ComponentType<TextInputProps>;
}>("react-native-web");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

test("on web the token input asks the browser not to autofill, and stays a password field", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <TextInput
        accessibilityLabel="Access token"
        {...secretEntryProps}
        secureTextEntry
      />,
    ),
  );
  const input = host.querySelector("input")!;
  expect(input.getAttribute("autocomplete")).toBe("off");
  expect(input.getAttribute("type")).toBe("password");
  expect(input.getAttribute("spellcheck")).toBe("false");
  expect(input.getAttribute("autocapitalize")).toBe("none");
  act(() => root.unmount());
  host.remove();
});
