import { parseRememberedSession, type RememberedSession } from "../authStore";

const session: RememberedSession = {
  version: 1,
  profileId: "ha:http://192.168.1.20:8123",
  hassUrl: "http://192.168.1.20:8123",
  clientId: "http://localhost:8094/",
  allowInsecureHttp: true,
  principal: "A".repeat(43),
  refreshToken: "public-refresh",
  rememberedAt: 1_760_000_000_000,
};

test("a remembered session is copied with its documented fields only", () => {
  const parsed = parseRememberedSession({ ...session });
  expect(parsed).toEqual(session);
  expect(parsed).not.toBe(session);
});

test.each<[string, unknown]>([
  ["not an object", "public-refresh"],
  ["another version", { ...session, version: 2 }],
  ["an extra field", { ...session, accessToken: "public-access" }],
  ["a missing field", { ...session, principal: undefined }],
  [
    "a profile of another origin",
    { ...session, profileId: "ha:https://x.example" },
  ],
  [
    "an unnormalized address",
    { ...session, hassUrl: "http://192.168.1.20:8123/" },
  ],
  ["untrusted HTTP", { ...session, allowInsecureHttp: false }],
  [
    "a client id that is not an origin",
    { ...session, clientId: "http://localhost:8094/x" },
  ],
  ["a malformed principal", { ...session, principal: "user-alice" }],
  ["an empty refresh token", { ...session, refreshToken: "" }],
  ["a refresh token with spaces", { ...session, refreshToken: "a b" }],
  ["a non-numeric date", { ...session, rememberedAt: "today" }],
])("a record with %s is refused", (_, value) => {
  expect(parseRememberedSession(value)).toBeUndefined();
});
