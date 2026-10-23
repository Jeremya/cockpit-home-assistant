import {
  detailHref,
  detailLayout,
  detailTargetFromRoute,
  focusOriginId,
  focusOriginOf,
} from "../detailNavigation";

test.each([
  // Workspace width beside the 224 px rail for 1024/1280/1440/1920 windows.
  [800, { kind: "route" }],
  [1056, { kind: "panel", width: 360 }],
  [1216, { kind: "panel", width: 389 }],
  [1696, { kind: "panel", width: 440 }],
])("a %ipx workspace hosting Home gets %j", (width, expected) => {
  expect(detailLayout(width, { desktop: true, hostsHome: true })).toEqual(
    expected,
  );
});
test("a panel needs Home underneath, the desktop layout and a measurement", () => {
  expect(detailLayout(1696, { desktop: true, hostsHome: false })).toEqual({
    kind: "route",
  });
  expect(detailLayout(1696, { desktop: false, hostsHome: true })).toEqual({
    kind: "route",
  });
  expect(detailLayout(0, { desktop: true, hostsHome: true })).toEqual({
    kind: "route",
  });
});
test("a compact window gets no panel, even with room beside Home", () => {
  // 1000–1023 px: no rail, so the workspace is wide enough, but Home is compact.
  expect(detailLayout(1010, { desktop: false, hostsHome: true })).toEqual({
    kind: "route",
  });
  expect(detailLayout(1010, { desktop: true, hostsHome: true })).toEqual({
    kind: "panel",
    width: 360,
  });
});
test("the panel never squeezes Home below its minimum reading width", () => {
  for (let width = 0; width <= 2400; width += 8) {
    const layout = detailLayout(width, { desktop: true, hostsHome: true });
    if (layout.kind === "panel") {
      expect(layout.width).toBeGreaterThanOrEqual(360);
      expect(layout.width).toBeLessThanOrEqual(440);
      expect(width - layout.width).toBeGreaterThanOrEqual(640);
    }
  }
});
test("canonical hrefs carry the home explicitly, readings included", () => {
  expect(
    detailHref({ kind: "device", profileId: "home-a", deviceId: "plug" }),
  ).toEqual({
    pathname: "/appliance/[id]",
    params: { id: "plug", profile: "home-a" },
  });
  expect(
    detailHref({
      kind: "reading",
      profileId: "home-a",
      entityKey: "demo-switch.living_lamp",
    }),
  ).toEqual({
    pathname: "/device/[key]",
    params: { key: "demo-switch.living_lamp", profile: "home-a" },
  });
});
test("routes become targets of the home they name", () => {
  expect(
    detailTargetFromRoute(
      { name: "appliance/[id]", params: { id: "plug", profile: "home-a" } },
      "home-b",
    ),
  ).toEqual({ kind: "device", profileId: "home-a", deviceId: "plug" });
  expect(
    detailTargetFromRoute(
      { name: "device/[key]", params: { key: "lamp", profile: "home-a" } },
      "home-b",
    ),
  ).toEqual({ kind: "reading", profileId: "home-a", entityKey: "lamp" });
});
test("a legacy reading link without a home uses only its bound home", () => {
  const legacy = { name: "device/[key]", params: { key: "lamp" } };
  expect(detailTargetFromRoute(legacy, "home-a")).toEqual({
    kind: "reading",
    profileId: "home-a",
    entityKey: "lamp",
  });
  expect(detailTargetFromRoute(legacy, null)).toBeNull();
});
test.each([
  { name: "index" },
  { name: "appliance/[id]", params: { id: "plug" } },
  { name: "appliance/[id]", params: { profile: "home-a" } },
  { name: "device/[key]", params: { key: ["a", "b"], profile: "home-a" } },
  { name: "device/[key]", params: { key: "", profile: "home-a" } },
  { name: "settings", params: { key: "lamp", profile: "home-a" } },
])("an incomplete or foreign route %j is not a detail target", (route) => {
  expect(detailTargetFromRoute(route, "home-a")).toBeNull();
});
test("focus origins are stable, DOM-safe keys that round-trip", () => {
  const id = focusOriginId("device", '["home a","plug"]');
  expect(id).not.toMatch(/\s/);
  expect(focusOriginOf(id)).toBe(id);
  expect(focusOriginId("device", '["home a","plug"]')).toBe(id);
  expect(focusOriginOf("maurice-content")).toBeNull();
  expect(focusOriginOf(null)).toBeNull();
  expect(focusOriginOf(`detail-origin-${"x".repeat(600)}`)).toBeNull();
});
