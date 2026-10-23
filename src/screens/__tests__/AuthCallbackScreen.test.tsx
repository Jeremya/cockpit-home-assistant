import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { session } from "../../services/runtime";
import { browserSignIn } from "../../services/auth/browserAuth";
import type { SignInResult } from "../../services/auth/signIn";
import { AuthCallbackScreen } from "../AuthCallbackScreen";

const mockNavigation = { setParams: jest.fn() };
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useNavigation: () => mockNavigation,
}));
jest.mock("../../services/runtime", () => ({
  session: { connect: jest.fn() },
}));
jest.mock("../../services/auth/browserAuth", () => ({
  browserSignIn: { complete: jest.fn() },
}));

const signIn = { url: "http://127.0.0.1:8123" } as never;
function completes(result: SignInResult) {
  jest.mocked(browserSignIn.complete).mockResolvedValue(result);
}

test("a verified callback connects the session, then returns to its destination", async () => {
  completes({ kind: "signed_in", signIn, returnTo: "/device/a?profile=p" });
  jest.mocked(session.connect).mockResolvedValue(undefined);
  const screen = render(<AuthCallbackScreen />);
  expect(screen.getByText("Signing in to Home Assistant…")).toBeTruthy();
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledWith("/device/a?profile=p"),
  );
  expect(session.connect).toHaveBeenCalledWith(signIn);
});

test("a failed first synchronization still leaves the callback; Home shows the status", async () => {
  completes({ kind: "signed_in", signIn, returnTo: "/" });
  jest.mocked(session.connect).mockRejectedValue({ code: "unreachable" });
  render(<AuthCallbackScreen />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
});

test("a rejected callback explains itself and offers a new sign-in, never a loop", async () => {
  completes({ kind: "failed", reason: "state_mismatch" });
  const screen = render(<AuthCallbackScreen />);
  expect(
    await screen.findByText(
      "This sign-in does not match the one started on this page. Sign in again.",
    ),
  ).toBeTruthy();
  expect(session.connect).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
  expect(router.replace).toHaveBeenCalledWith("/settings");
});

test("a remount during completion neither repeats the callback nor connects twice", async () => {
  let finish!: (result: SignInResult) => void;
  jest.mocked(browserSignIn.complete).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  jest.mocked(session.connect).mockResolvedValue(undefined);
  const first = render(<AuthCallbackScreen />);
  first.unmount();
  render(<AuthCallbackScreen />);
  await act(async () => finish({ kind: "signed_in", signIn, returnTo: "/" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
  expect(browserSignIn.complete).toHaveBeenCalledTimes(1);
  expect(session.connect).toHaveBeenCalledTimes(1);
});

test("a sign-in finishing after the user left still ends in one session, without navigation", async () => {
  let finish!: (result: SignInResult) => void;
  jest.mocked(browserSignIn.complete).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  jest.mocked(session.connect).mockResolvedValue(undefined);
  render(<AuthCallbackScreen />).unmount();
  await act(async () => finish({ kind: "signed_in", signIn, returnTo: "/" }));
  expect(session.connect).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  // Returning to the page reuses that outcome instead of a second exchange.
  render(<AuthCallbackScreen />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  expect(browserSignIn.complete).toHaveBeenCalledTimes(1);
});

test("the callback address is cleared through the router after it was read", async () => {
  const order: string[] = [];
  jest.mocked(browserSignIn.complete).mockImplementation(async () => {
    order.push("read");
    return { kind: "failed", reason: "malformed" };
  });
  mockNavigation.setParams.mockImplementation(() => {
    order.push("clear");
  });
  const screen = render(<AuthCallbackScreen />);
  await screen.findByRole("button", { name: "Sign in again" });
  expect(order).toEqual(["read", "clear"]);
  expect(mockNavigation.setParams).toHaveBeenCalledWith({
    code: undefined,
    state: undefined,
    storeToken: undefined,
  });
});
