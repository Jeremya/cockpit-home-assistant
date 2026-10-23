import { railSelected } from "../shellNavigation";

test.each([
  ["/", "/", false, true],
  ["/house", "/house", false, true],
  ["/house-links", "/house", false, true],
  ["/appliance/demo-plug", "/entities", false, true],
  ["/device/demo-switch.living_lamp", "/entities", false, true],
  ["/appliance/demo-plug", "/", false, false],
])("%s selects %s without a panel: %s → %s", (path, href, panel, expected) => {
  expect(railSelected(path, href, panel)).toBe(expected);
});
test("a detail shown beside Home keeps Overview as the current place", () => {
  expect(railSelected("/appliance/demo-plug", "/", true)).toBe(true);
  expect(railSelected("/device/demo-switch.living_lamp", "/", true)).toBe(true);
  expect(railSelected("/appliance/demo-plug", "/entities", true)).toBe(false);
  expect(railSelected("/settings", "/", true)).toBe(false);
});
