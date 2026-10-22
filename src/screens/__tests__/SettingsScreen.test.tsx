import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { session } from "../../services/runtime";
import { browserSignIn } from "../../services/auth/browserAuth";
import { useCockpit } from "../../core/store";
import { SettingsScreen } from "../SettingsScreen";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));
jest.mock("../../services/runtime", () => ({
  session: {
    connect: jest.fn(),
    signOut: jest.fn(),
    forget: jest.fn(),
    disconnect: jest.fn(),
    browserSession: false,
  },
}));
jest.mock("../../services/credentialStorage", () => ({
  credentialPersistence: "page",
}));
jest.mock("../../services/confirmAction", () => ({
  confirmAction: ({ onConfirm }: { onConfirm: () => void }) => onConfirm(),
}));
jest.mock("../../services/auth/browserAuth", () => ({
  browserSignInAvailable: true,
  browserSignIn: { compatibility: jest.fn(), begin: jest.fn() },
}));

beforeEach(() => {
  useCockpit.setState(useCockpit.getInitialState(), true);
  (session as { browserSession: boolean }).browserSession = false;
});

function fillAddress(screen: ReturnType<typeof render>, url: string) {
  fireEvent.changeText(screen.getByLabelText("Home Assistant URL"), url);
}

test("the manual token form and its memory-only wording stay available", () => {
  const screen = render(<SettingsScreen />);
  expect(
    screen.getByText(/Your token stays in memory for this page only/),
  ).toBeTruthy();
  expect(screen.getByLabelText("Access token")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Sign in with Home Assistant" }),
  ).toBeTruthy();
});

test("sign-in starts with the chosen address and the explicit HTTP trust", async () => {
  jest.mocked(browserSignIn.compatibility).mockReturnValue({
    kind: "compatible",
    hassUrl: "http://192.168.1.20:8123",
  });
  jest
    .mocked(browserSignIn.begin)
    .mockResolvedValue({ kind: "redirect", authorizeUrl: "http://x" });
  const screen = render(<SettingsScreen />);
  fillAddress(screen, "http://192.168.1.20:8123/");
  fireEvent(
    screen.getByRole("switch", { name: "Trust local HTTP network" }),
    "valueChange",
    true,
  );
  fireEvent.press(
    screen.getByRole("button", { name: "Sign in with Home Assistant" }),
  );
  await waitFor(() =>
    expect(browserSignIn.begin).toHaveBeenCalledWith({
      url: "http://192.168.1.20:8123",
      allowInsecureHttp: true,
      returnTo: "/",
    }),
  );
  expect(browserSignIn.compatibility).toHaveBeenCalledWith({
    url: "http://192.168.1.20:8123/",
    allowInsecureHttp: true,
  });
  expect(session.connect).not.toHaveBeenCalled();
});

test.each([
  ["insecure_app", /needs Maurice on HTTPS or on localhost/],
  ["mixed_content", /blocks an HTTP Home Assistant/],
  ["http_not_trusted", /Confirm that you trust this local network/],
] as const)(
  "an incompatible pair (%s) explains itself and does not navigate",
  (reason, help) => {
    jest
      .mocked(browserSignIn.compatibility)
      .mockReturnValue({ kind: "blocked", reason });
    const screen = render(<SettingsScreen />);
    fillAddress(screen, "http://192.168.1.20:8123");
    fireEvent.press(
      screen.getByRole("button", { name: "Sign in with Home Assistant" }),
    );
    expect(screen.getByText(help)).toBeTruthy();
    expect(browserSignIn.begin).not.toHaveBeenCalled();
  },
);

test("a browser session offers Sign out, and reports an unconfirmed revocation", async () => {
  (session as { browserSession: boolean }).browserSession = true;
  jest.mocked(session.signOut).mockResolvedValue({ kind: "unconfirmed" });
  useCockpit.setState({
    profileId: "ha:https://home.example",
    mode: "homeAssistant",
  });
  const screen = render(<SettingsScreen />);
  expect(
    screen.queryByRole("button", { name: "Forget this Home Assistant" }),
  ).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  expect(
    await screen.findByText(/could not confirm the revocation/),
  ).toBeTruthy();
  expect(session.forget).not.toHaveBeenCalled();
});

test("a token session keeps Forget this Home Assistant", () => {
  useCockpit.setState({
    profileId: "ha:https://home.example",
    mode: "homeAssistant",
  });
  const screen = render(<SettingsScreen />);
  expect(
    screen.getByRole("button", { name: "Forget this Home Assistant" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});
