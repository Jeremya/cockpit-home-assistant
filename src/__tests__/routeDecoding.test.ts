import { getStateFromPath } from "expo-router/build/fork/getStateFromPath";

const options = { screens: { Device: "device/:key", Home: "" } };

function params(path: string) {
  const state = getStateFromPath(path, options);
  expect(state?.routes).toHaveLength(1);
  return state?.routes[0]?.params;
}

describe("installed Expo Router query decoding", () => {
  it("retains the stable device key and Unicode query values", () => {
    expect(
      params(
        "/device/ha%3Aswitch.lamp?name=Salon+%C3%A9tage&icon=%F0%9F%8F%A0",
      ),
    ).toMatchObject({
      key: "ha:switch.lamp",
      name: "Salon étage",
      icon: "🏠",
    });
  });

  it("preserves repeated values and literal encoded plus signs", () => {
    expect(
      params("/device/demo-switch.lamp?tag=a&tag=b&name=A%2BB"),
    ).toMatchObject({
      key: "demo-switch.lamp",
      tag: ["a", "b"],
      name: "A+B",
    });
  });

  it("keeps a malformed query navigable without losing the route", () => {
    expect(params("/device/demo-switch.lamp?name=%80%41%C3%A9")).toMatchObject({
      key: "demo-switch.lamp",
      // Expo's URL search parser replaces invalid UTF-8 before route matching.
      name: "�Aé",
    });
  });
});
