import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { INTERNAL_ROUTES, internalDestination } from "../returnTo";

const origin = "https://maurice.example";

test.each([
  ["/", "/"],
  ["/settings", "/settings"],
  ["/device/ha%3Aswitch.lamp", "/device/ha%3Aswitch.lamp"],
  ["/appliance/feeder?panel=history", "/appliance/feeder?panel=history"],
  [
    "/device/ha%3Aswitch.lamp?profile=ha%3Ahttps%3A%2F%2Fhome.example",
    "/device/ha%3Aswitch.lamp?profile=ha%3Ahttps%3A%2F%2Fhome.example",
  ],
  ["/house#plan", "/house"],
  ["/?room=kitchen", "/?room=kitchen"],
])("keeps the internal destination %s", (candidate, expected) => {
  expect(internalDestination(candidate, origin)).toBe(expected);
});

test.each([
  "https://evil.example/settings",
  "//evil.example/settings",
  "/\\evil.example",
  "/auth-callback",
  "/auth-callback?code=abc&state=def",
  "/AUTH-CALLBACK",
  "/settings/../auth-callback",
  "/%2e%2e/auth-callback",
  "/unknown-route",
  "javascript:alert(1)",
  "settings",
  "",
  "/settings\n",
  "/settings\u0000",
  `/settings?${"a".repeat(600)}`,
  42,
  null,
  undefined,
  { pathname: "/settings" },
])("falls back to home for %p", (candidate) => {
  expect(internalDestination(candidate, origin)).toBe("/");
});

test("every allowed first segment is an existing route of the app", () => {
  const app = join(__dirname, "../../../../app");
  // Expo Router groups such as app/(workspace)/ do not appear in URLs.
  const roots = [
    app,
    ...readdirSync(app)
      .filter((name) => /^\(.+\)$/.test(name))
      .map((name) => join(app, name)),
  ];
  for (const segment of INTERNAL_ROUTES) {
    const file = segment === "" ? "index" : segment;
    expect(
      roots.some(
        (root) =>
          existsSync(join(root, `${file}.tsx`)) || existsSync(join(root, file)),
      ),
    ).toBe(true);
  }
  expect(INTERNAL_ROUTES).not.toContain("auth-callback");
});
