/** @jest-environment jsdom */
/** @jest-environment-options {"url":"http://localhost:8082"} */
import { URL as StandardURL } from "node:url";
import {
  canLoadLocalConnection,
  loadLocalConnection,
} from "../localConnection.web";

const originalFetch = global.fetch;
const originalURL = Object.getOwnPropertyDescriptor(global, "URL")!;
beforeEach(() => {
  global.fetch = jest.fn();
  // Bypass Expo's native lazy URL polyfill in jsdom, using the WHATWG parser.
  Object.defineProperty(global, "URL", {
    configurable: true,
    writable: true,
    value: StandardURL,
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  Object.defineProperty(global, "URL", originalURL);
  jest.useRealTimers();
});

test("local loading is explicit, memory-only and does not carry HTTP consent", async () => {
  expect(canLoadLocalConnection()).toBe(true);
  expect(global.fetch).not.toHaveBeenCalled();
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      url: "http://127.0.0.1:8123/",
      token: "public-test-token",
    }),
  } as Response);
  await expect(loadLocalConnection()).resolves.toEqual({
    url: "http://127.0.0.1:8123",
    token: "public-test-token",
  });
  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:8083/local-connection",
    expect.objectContaining({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: { "X-Maurice-Local-Connection": "1" },
    }),
  );
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test.each([
  { url: "https://home.example/?token=private", token: "private" },
  { url: "https://home.example", token: "" },
  { url: "https://home.example", token: "bad\nvalue" },
  { token: "private" },
  null,
])("invalid responses never leak their data into errors", async (data) => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
  await expect(loadLocalConnection()).rejects.toThrow(
    "Could not load the local connection.",
  );
});

test("an unavailable helper produces a bounded error without its response body", async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
  await expect(loadLocalConnection()).rejects.toThrow(
    "Could not load the local connection.",
  );
});

test("release builds cannot request the development credential endpoint", async () => {
  const environment = global as typeof global & { __DEV__: boolean };
  const previous = environment.__DEV__;
  environment.__DEV__ = false;
  try {
    expect(canLoadLocalConnection()).toBe(false);
    await expect(loadLocalConnection()).rejects.toThrow(
      "available in web development",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    environment.__DEV__ = previous;
  }
});

test("an unresponsive helper is aborted", async () => {
  jest.useFakeTimers();
  jest.mocked(global.fetch).mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  const pending = expect(loadLocalConnection()).rejects.toThrow(
    "Could not load the local connection.",
  );
  jest.advanceTimersByTime(5_000);
  await pending;
});
