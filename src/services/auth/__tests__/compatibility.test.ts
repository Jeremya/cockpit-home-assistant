import { browserAuthCompatibility } from "../compatibility";

const localhostApp = { origin: "http://localhost:8094", secureContext: true };
const hostedApp = { origin: "https://maurice.example", secureContext: true };

test("a localhost app can sign in to a trusted local HTTP Home Assistant", () => {
  expect(
    browserAuthCompatibility(localhostApp, {
      url: "http://192.168.1.20:8123/",
      allowInsecureHttp: true,
    }),
  ).toEqual({ kind: "compatible", hassUrl: "http://192.168.1.20:8123" });
});

test("an HTTPS app can sign in to an HTTPS Home Assistant", () => {
  expect(
    browserAuthCompatibility(hostedApp, {
      url: "https://home.example.com",
      allowInsecureHttp: false,
    }),
  ).toEqual({ kind: "compatible", hassUrl: "https://home.example.com" });
});

test("HTTP Home Assistant keeps the explicit local-network trust rule", () => {
  expect(
    browserAuthCompatibility(localhostApp, {
      url: "http://192.168.1.20:8123",
      allowInsecureHttp: false,
    }),
  ).toEqual({ kind: "blocked", reason: "http_not_trusted" });
});

test.each([
  "http://192.168.1.20:8123",
  "http://localhost:8123",
  "http://127.0.0.1:8123",
])("an HTTPS app never signs in to %s (mixed content)", (url) => {
  expect(
    browserAuthCompatibility(hostedApp, { url, allowInsecureHttp: true }),
  ).toEqual({ kind: "blocked", reason: "mixed_content" });
});

test("an app outside a secure context cannot run PKCE or keep a session", () => {
  expect(
    browserAuthCompatibility(
      { origin: "http://192.168.1.10:8081", secureContext: false },
      { url: "http://192.168.1.20:8123", allowInsecureHttp: true },
    ),
  ).toEqual({ kind: "blocked", reason: "insecure_app" });
});

test("an invalid Home Assistant address is reported, not normalized away", () => {
  expect(
    browserAuthCompatibility(hostedApp, {
      url: "https://home.example.com/lovelace?x=1",
      allowInsecureHttp: false,
    }),
  ).toEqual({ kind: "blocked", reason: "invalid_url" });
});
