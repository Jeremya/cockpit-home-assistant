import { useState, useSyncExternalStore } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { normalizeUrl } from "../session/homeAssistant/url";
import { credentialPersistence } from "../services/credentialStorage";
import { confirmAction } from "../services/confirmAction";
import {
  canLoadLocalConnection,
  loadLocalConnection,
} from "../services/localConnection";
import {
  browserSignIn,
  browserSignInAvailable,
} from "../services/auth/browserAuth";
import type { CompatibilityBlock } from "../services/auth/compatibility";
import {
  Body,
  Button,
  Caption,
  Disclosure,
  Divider,
  Heading,
  Label,
  ListRow,
  Notice,
  Panel,
  Screen,
  ScreenHeader,
  ToggleRow,
  colors,
  styles,
} from "../components/ui";
import { secretEntryProps } from "../components/secretEntry";
import { radii, spacing, typography } from "../theme";
const signInHelp: Record<CompatibilityBlock, string> = {
  invalid_url:
    "Enter the Home Assistant address only, such as https://home.example.com.",
  http_not_trusted:
    "Confirm that you trust this local network before using HTTP.",
  mixed_content:
    "This page uses HTTPS, so the browser blocks an HTTP Home Assistant. Use the HTTPS address of Home Assistant, or an access token.",
  insecure_app:
    "Browser sign-in needs Maurice on HTTPS or on localhost. Use an access token on this address.",
  unsupported: "Browser sign-in is available in the web app only.",
};
/** Where a failure is reported: beside the action that raised it. */
type Place = "local" | "signIn" | "token" | "demo" | "session";
export function SettingsScreen() {
  const browserSession = credentialPersistence === "page";
  const profileId = useCockpit((state) => state.profileId);
  const mode = useCockpit((state) => state.mode);
  const notices = useCockpit((state) => state.notices);
  // The sign-in itself is never in the cockpit store.
  const browserState = useSyncExternalStore(
    session.subscribeBrowser,
    () => session.browserSession,
  );
  const signedIn = mode === "homeAssistant" && !!browserState;
  const [signedOut, setSignedOut] = useState<{
    text: string;
    unconfirmed?: boolean;
  } | null>(null);
  const [remember, setRemember] = useState(false);
  const [url, setUrl] = useState(
    profileId?.startsWith("ha:") ? profileId.slice(3) : "",
  );
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; at: Place } | null>(
    null,
  );
  const [localLoaded, setLocalLoaded] = useState(false);
  const [columns, setColumns] = useState(0);
  const split = columns >= 880;
  const loadLocal = async () => {
    setFailure(null);
    setBusy(true);
    setLocalLoaded(false);
    setToken("");
    setShowToken(false);
    setTrust(false);
    try {
      const local = await loadLocalConnection();
      setUrl(local.url);
      setToken(local.token);
      setLocalLoaded(true);
    } catch (error) {
      setFailure({
        at: "local",
        text:
          error instanceof Error
            ? error.message
            : "Could not load the local connection.",
      });
    } finally {
      setBusy(false);
    }
  };
  const signIn = async () => {
    setFailure(null);
    setSignedOut(null);
    const compatible = browserSignIn.compatibility({
      url,
      allowInsecureHttp: trust,
    });
    if (compatible.kind === "blocked") {
      setFailure({ at: "signIn", text: signInHelp[compatible.reason] });
      return;
    }
    setBusy(true);
    try {
      const started = await browserSignIn.begin({
        url: compatible.hassUrl,
        allowInsecureHttp: trust,
        returnTo: "/",
        remember,
      });
      // On success the page is already leaving for Home Assistant.
      if (started.kind === "blocked") {
        setFailure({ at: "signIn", text: signInHelp[started.reason] });
        setBusy(false);
      }
    } catch {
      setFailure({
        at: "signIn",
        text: "Could not start the sign-in. Check that this browser allows site data for Maurice.",
      });
      setBusy(false);
    }
  };
  const connect = async () => {
    setFailure(null);
    setBusy(true);
    try {
      const origin = normalizeUrl(url);
      await session.connect({ url: origin, token, allowInsecureHttp: trust });
      setToken("");
      router.replace("/");
    } catch (error) {
      setFailure({
        at: "token",
        text:
          error instanceof Error
            ? error.message
            : "Could not connect. Check the address, access token and Home Assistant version.",
      });
    } finally {
      setBusy(false);
    }
  };
  /** The failure, where it happened; the alert role announces it. */
  const failureAt = (place: Place) =>
    failure?.at === place && (
      <Notice tone="danger">
        <Text accessibilityRole="alert" style={styles.error}>
          {failure.text}
        </Text>
        {browserSession && (
          <Caption>
            Check that Home Assistant opens in this browser and that Chrome
            permits the connection. For a local HTTP server, run Maurice on
            localhost. Remote hosting may require HTTPS for Home Assistant.
          </Caption>
        )}
      </Notice>
    );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen tabBar width={1120} keyboardShouldPersistTaps="handled">
        <ScreenHeader eyebrow="Make yourself at home" title="Settings" />
        <View
          onLayout={(event) => setColumns(event.nativeEvent.layout.width)}
          style={[screen.columns, split && screen.columnsWide]}
        >
          <View style={[screen.column, split && screen.main]}>
            <Panel style={screen.card}>
              <View style={screen.group}>
                <Heading>Home Assistant</Heading>
                <Body>
                  Your devices stay connected through your own Home Assistant.
                </Body>
              </View>
              {notices.map((notice) => (
                <Notice key={notice} tone="warning">
                  {notice}
                </Notice>
              ))}
              {canLoadLocalConnection() && (
                <View style={screen.group}>
                  <Button
                    title="Load local connection"
                    disabled={busy}
                    secondary
                    onPress={() => void loadLocal()}
                  />
                  {localLoaded && (
                    <Body>
                      Local connection loaded. Review the address, confirm trust
                      for HTTP if needed, then Connect.
                    </Body>
                  )}
                  {failureAt("local")}
                </View>
              )}
              <View style={screen.group}>
                <Text style={screen.fieldLabel}>Home Assistant URL</Text>
                <TextInput
                  accessibilityLabel="Home Assistant URL"
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://home.example.com"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                {url.trim().startsWith("http:") && (
                  <ToggleRow
                    title="I trust this local network"
                    warning={
                      browserSignInAvailable
                        ? "The sign-in and the token will be sent unencrypted."
                        : "The token will be sent unencrypted."
                    }
                    accessibilityLabel="Trust local HTTP network"
                    value={trust}
                    onValueChange={setTrust}
                  />
                )}
                <Disclosure title="Help with the address">
                  <Caption>
                    Use the address you open Home Assistant with. For a local
                    connection, use the same household network.
                  </Caption>
                  {browserSession && (
                    <Caption>
                      Open Home Assistant from this computer to check its
                      address; allow local network access if Chrome asks.
                    </Caption>
                  )}
                </Disclosure>
              </View>
              {browserSignInAvailable && (
                <>
                  <Divider />
                  <View style={screen.group}>
                    <Label tone="neutral">Sign in</Label>
                    <View style={screen.choice}>
                      <ToggleRow
                        title="Remember this browser"
                        description="Reloading reconnects without signing in again."
                        value={remember}
                        onValueChange={setRemember}
                      />
                      <Notice tone="warning" title="Not for a shared computer">
                        Anyone using this browser profile, and any script
                        running on this Maurice address, can use this sign-in;
                        it is not protected like the phone&apos;s secure
                        storage.
                      </Notice>
                    </View>
                    {failureAt("signIn")}
                    <Button
                      title={
                        busy
                          ? "Opening Home Assistant…"
                          : "Sign in with Home Assistant"
                      }
                      disabled={busy}
                      onPress={() => void signIn()}
                    />
                    <Caption>Opens your Home Assistant login page.</Caption>
                    <Disclosure title="How sign-in works">
                      <Caption>
                        Without Remember this browser, the sign-in stays in
                        memory for this page only: reloading asks you to sign in
                        again, whatever you choose on that page.
                      </Caption>
                      <Caption>
                        Power permissions you allow belong to the Home Assistant
                        user who signs in.
                      </Caption>
                    </Disclosure>
                  </View>
                  <Divider />
                </>
              )}
              <View style={screen.group}>
                {browserSignInAvailable && (
                  <Label tone="neutral">Or use an access token</Label>
                )}
                <Text style={screen.fieldLabel}>Long-lived access token</Text>
                <TextInput
                  accessibilityLabel="Access token"
                  value={token}
                  onChangeText={setToken}
                  {...secretEntryProps}
                  secureTextEntry={!showToken}
                  placeholder="Paste your access token"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <Caption>
                  {browserSession
                    ? "Your token stays in memory for this page only. Reloading requires it again; it is never saved in browser storage."
                    : "Maurice keeps the access token securely on this phone."}
                </Caption>
                <ToggleRow
                  title="Show token"
                  value={showToken}
                  onValueChange={setShowToken}
                />
                <Disclosure title="How to create a token">
                  <Caption>
                    Create a token in Home Assistant → Profile → Security. Use a
                    dedicated household user.
                  </Caption>
                </Disclosure>
                {failureAt("token")}
                <Button
                  title={busy ? "Connecting…" : "Connect"}
                  disabled={busy}
                  secondary={browserSignInAvailable}
                  onPress={() => {
                    void connect();
                  }}
                />
              </View>
              {browserSession && (
                <>
                  <Divider />
                  <Caption>
                    Preferences and power permissions are saved in this browser,
                    separately from your phone.
                  </Caption>
                </>
              )}
            </Panel>
          </View>
          <View style={[screen.column, split && screen.aside]}>
            {!!signedOut && (
              <Notice tone={signedOut.unconfirmed ? "warning" : "neutral"} live>
                {signedOut.text}
              </Notice>
            )}
            <View style={screen.group}>
              <Button
                title="Explore demo home"
                disabled={busy}
                secondary
                onPress={() => {
                  setBusy(true);
                  void session
                    .connect({ demo: true })
                    .then(() => router.replace("/"))
                    .catch(() =>
                      setFailure({ at: "demo", text: "Could not load demo." }),
                    )
                    .finally(() => setBusy(false));
                }}
              />
              {failureAt("demo")}
            </View>
            {profileId && (
              <>
                <Panel>
                  <Label tone="neutral">This session</Label>
                  {signedIn && (
                    <Body>
                      {browserState === "remembered"
                        ? "This browser remembers this sign-in: reloading reconnects until you sign out or stop remembering it."
                        : "You are signed in for this page only: reloading asks you to sign in again."}
                    </Body>
                  )}
                  {failureAt("session")}
                  <Button
                    title="Disconnect"
                    secondary
                    onPress={() => {
                      session.disconnect();
                      router.replace("/");
                    }}
                  />
                  {signedIn && browserState === "remembered" && (
                    <Button
                      title="Stop remembering this browser"
                      secondary
                      onPress={() => {
                        setSignedOut(null);
                        void session.stopRemembering().then((stopped) =>
                          setSignedOut(
                            stopped
                              ? {
                                  text: "This browser no longer remembers the sign-in. This page stays signed in until it is closed.",
                                }
                              : {
                                  text: "This browser could not forget the sign-in. Try again, or sign out.",
                                  unconfirmed: true,
                                },
                          ),
                        );
                      }}
                    />
                  )}
                  {signedIn && (
                    <Button
                      title="Sign out"
                      variant="danger"
                      onPress={() =>
                        confirmAction({
                          title: "Sign out?",
                          message:
                            "Ends this browser sign-in in every tab, forgets it in this browser and asks Home Assistant to revoke it. Preferences are kept.",
                          confirmLabel: "Sign out",
                          onConfirm: () => {
                            void session
                              .signOut()
                              .then((result) =>
                                setSignedOut(
                                  result?.kind === "revoked"
                                    ? { text: "Signed out." }
                                    : {
                                        text: "Signed out on this page, but Home Assistant could not confirm the revocation. Remove this sign-in in Home Assistant under Profile → Security.",
                                        unconfirmed: true,
                                      },
                                ),
                              )
                              .catch(() =>
                                setFailure({
                                  at: "session",
                                  text: "Could not sign out.",
                                }),
                              );
                          },
                        })
                      }
                    />
                  )}
                  {mode === "homeAssistant" && !signedIn && (
                    <Button
                      title="Forget this Home Assistant"
                      variant="danger"
                      onPress={() =>
                        confirmAction({
                          title: "Forget connection?",
                          message: `Removes the token from ${browserSession ? "this page, and any sign-in this browser remembers for this Home Assistant" : "this phone"}. Preferences are kept. Revoke the token separately in Home Assistant.`,
                          confirmLabel: "Forget",
                          onConfirm: () => {
                            void session
                              .forget()
                              .then(() => router.replace("/"))
                              .catch(() =>
                                setFailure({
                                  at: "session",
                                  text: "Could not remove stored credentials.",
                                }),
                              );
                          },
                        })
                      }
                    />
                  )}
                </Panel>
                <Panel style={screen.list}>
                  <ListRow
                    icon="grid"
                    title="Entities and rooms"
                    onPress={() => router.push("/entities")}
                  />
                  <ListRow
                    icon="activity"
                    title="Diagnostics"
                    onPress={() => router.push("/diagnostics")}
                  />
                </Panel>
              </>
            )}
            <Panel style={screen.brand}>
              <Image
                source={require("../../assets/maurice.png")}
                style={screen.portrait}
                accessibilityLabel="Maurice: a moustached butler in a waistcoat and bow tie, chin raised with a disapproving look, in front of a house and smart-home icons"
              />
              <Text style={screen.wordmark}>MAURICE</Text>
              <Caption style={screen.centered}>
                Module Autonome Universel de Régulation Intelligente et de
                Contrôle Électrique.
              </Caption>
              <Text style={screen.motto}>
                « Maurice s’occupe de tout. Vous, de rien. »
              </Text>
            </Panel>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
const screen = StyleSheet.create({
  // One column on a phone; the connection beside everything else when wide.
  columns: { gap: spacing.lg },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  column: { gap: spacing.lg, minWidth: 0 },
  main: { flex: 1 },
  aside: { width: 360 },
  card: { gap: spacing.lg },
  group: { gap: spacing.sm },
  fieldLabel: {
    ...typography.secondary,
    color: colors.text,
    fontWeight: "600",
  },
  choice: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
  list: { padding: spacing.sm, gap: 0 },
  brand: { alignItems: "center", gap: spacing.sm },
  portrait: { width: 96, height: 96 },
  wordmark: {
    ...typography.heading,
    color: colors.text,
    fontWeight: "700",
    letterSpacing: 4,
  },
  centered: { textAlign: "center" },
  motto: {
    ...typography.secondary,
    color: colors.accent,
    fontStyle: "italic",
    textAlign: "center",
  },
});
