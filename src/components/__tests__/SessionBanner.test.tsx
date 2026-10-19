import { act, fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import { SessionBanner } from "../SessionBanner";
import { useCockpit } from "../../core/store";
import { session } from "../../services/runtime";
import type { SessionError } from "../../core/types";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../services/runtime", () => ({
  session: { retry: jest.fn().mockResolvedValue(undefined) },
}));

beforeEach(() => useCockpit.setState({ status: { kind: "idle" } }));

test("automatic recovery is explicit and possible causes are a qualified, accessible disclosure", () => {
  useCockpit.setState({
    status: {
      kind: "error",
      retrying: true,
      error: {
        code: "unreachable",
        likelyCauses: ["not_on_network", "dns", "dns"],
      },
    },
  });
  const screen = render(<SessionBanner />);
  expect(
    screen.getByRole("header", { name: "Maurice is reconnecting…" }),
  ).toBeTruthy();
  expect(screen.getByText(/Reconnecting automatically/)).toBeTruthy();
  expect(screen.getByText(/Displayed values are cached/)).toBeTruthy();
  expect(screen.queryByText(/Possible causes:/)).toBeNull();
  fireEvent.press(
    screen.getByRole("button", {
      name: "Show connection checks",
      expanded: false,
    }),
  );
  expect(
    screen.getByRole("button", {
      name: "Hide connection checks",
      expanded: true,
    }),
  ).toBeTruthy();
  const text = screen.getByText(/Possible causes:/).props.children.join("");
  expect(text).toContain("may be outside your home network");
  expect(text.match(/may not resolve/g)).toHaveLength(1);
  fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(session.retry).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole("button", { name: "Connection settings" }));
  expect(router.push).toHaveBeenCalledWith("/settings");
});

test.each<SessionError>([
  { code: "auth_invalid" },
  { code: "ha_version_unsupported", haVersion: "2026.9.4" },
])(
  "terminal error keeps actions and never promises automatic recovery: $code",
  (error) => {
    useCockpit.setState({ status: { kind: "error", error, retrying: false } });
    const screen = render(<SessionBanner />);
    expect(screen.queryByText(/Reconnecting automatically/)).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Connection settings" }),
    ).toBeTruthy();
    if (error.code === "ha_version_unsupported") {
      expect(screen.getByText(/Detected: 2026.9.4/)).toBeTruthy();
      expect(screen.getByText(/2026.10 or later is required/)).toBeTruthy();
    }
    act(() =>
      useCockpit.setState({
        status: { kind: "ready", haVersion: "2026.10.1", readySince: "" },
      }),
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  },
);

test.each<SessionError>([
  { code: "invalid_url", detail: "PRIVATE_CREDENTIAL_SENTINEL" },
  { code: "storage", detail: "PRIVATE_CREDENTIAL_SENTINEL" },
  { code: "unknown", detail: "PRIVATE_CREDENTIAL_SENTINEL" },
  {
    code: "ha_version_unsupported",
    haVersion: "https://PRIVATE_CREDENTIAL_SENTINEL",
  },
])("raw error details never enter diagnostics text: $code", (error) => {
  useCockpit.setState({ status: { kind: "error", retrying: false, error } });
  const screen = render(<SessionBanner />);
  expect(JSON.stringify(screen.toJSON())).not.toContain(
    "PRIVATE_CREDENTIAL_SENTINEL",
  );
});

test("a refresh timeout and transport reconnect both qualify cached observations", () => {
  useCockpit.setState({
    status: {
      kind: "error",
      retrying: true,
      error: { code: "sync_timeout", phase: "resync" },
    },
  });
  const screen = render(<SessionBanner />);
  expect(
    screen.getByRole("header", { name: "Synchronization timed out" }),
  ).toBeTruthy();
  expect(screen.getByText(/Reconnecting automatically/)).toBeTruthy();
  act(() =>
    useCockpit.setState({
      status: { kind: "reconnecting", lastReadyAt: null },
    }),
  );
  expect(screen.getByText(/Displayed values are cached/)).toBeTruthy();
});
