import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { session } from "../../services/runtime";
import { browserSignIn } from "../../services/auth/browserAuth";
import { useCockpit } from "../../core/store";
import { SettingsScreen } from "../SettingsScreen";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock("../../services/runtime", () => ({
  session: {
    connect: jest.fn(),
    signOut: jest.fn(),
    stopRemembering: jest.fn(),
    forget: jest.fn(),
    disconnect: jest.fn(),
    subscribeBrowser: () => () => undefined,
    browserSession: undefined,
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
  browser(undefined);
});
const browser = (value: "memory" | "remembered" | undefined) => {
  (session as { browserSession: typeof value }).browserSession = value;
};

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
      remember: false,
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
  browser("memory");
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

test("Remember this browser is an explicit, unchecked choice made before the redirect", async () => {
  jest.mocked(browserSignIn.compatibility).mockReturnValue({
    kind: "compatible",
    hassUrl: "https://home.example",
  });
  jest
    .mocked(browserSignIn.begin)
    .mockResolvedValue({ kind: "redirect", authorizeUrl: "https://x" });
  const screen = render(<SettingsScreen />);
  const remember = screen.getByRole("switch", {
    name: "Remember this browser",
  });
  expect(remember.props.value).toBe(false);
  expect(
    screen.getByText(/any script running on this Maurice address/),
  ).toBeTruthy();
  expect(screen.queryByText(/Power control is not available/)).toBeNull();
  fillAddress(screen, "https://home.example");
  fireEvent(remember, "valueChange", true);
  fireEvent.press(
    screen.getByRole("button", { name: "Sign in with Home Assistant" }),
  );
  await waitFor(() =>
    expect(browserSignIn.begin).toHaveBeenCalledWith(
      expect.objectContaining({ remember: true }),
    ),
  );
});

test("a remembered session can stop being remembered without signing out", async () => {
  browser("remembered");
  jest.mocked(session.stopRemembering).mockResolvedValue(true);
  useCockpit.setState({
    profileId: "ha:https://home.example",
    mode: "homeAssistant",
  });
  const screen = render(<SettingsScreen />);
  expect(screen.getByText(/This browser remembers this sign-in/)).toBeTruthy();
  fireEvent.press(
    screen.getByRole("button", { name: "Stop remembering this browser" }),
  );
  expect(
    await screen.findByText(
      "This browser no longer remembers the sign-in. This page stays signed in until it is closed.",
    ),
  ).toBeTruthy();
  expect(session.signOut).not.toHaveBeenCalled();
});

test("a memory session offers no Stop remembering", () => {
  browser("memory");
  useCockpit.setState({
    profileId: "ha:https://home.example",
    mode: "homeAssistant",
  });
  const screen = render(<SettingsScreen />);
  expect(screen.getByText(/signed in for this page only/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Stop remembering this browser" }),
  ).toBeNull();
});

test("session notices, such as a power permission reset, are shown here", () => {
  useCockpit.setState({
    profileId: "ha:https://home.example",
    mode: "homeAssistant",
    notices: [
      "Power permissions for this home were reset because a different Home Assistant user signed in.",
    ],
  });
  const screen = render(<SettingsScreen />);
  expect(
    screen.getByText(
      "Power permissions for this home were reset because a different Home Assistant user signed in.",
    ),
  ).toBeTruthy();
});

test.each([
  ["Connect", "Connect"],
  ["Explore demo home", "Explore demo home"],
])(
  "after %s, Home replaces Settings so browser Back still reaches the previous detail",
  async (_, button) => {
    jest.mocked(session.connect).mockResolvedValue(undefined);
    const screen = render(<SettingsScreen />);
    fillAddress(screen, "https://home.example");
    fireEvent.changeText(screen.getByLabelText("Access token"), "public-token");
    fireEvent.press(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    // dismissTo would pop the workspace stack and drop that detail entry.
    expect(router.dismissTo).not.toHaveBeenCalled();
  },
);
