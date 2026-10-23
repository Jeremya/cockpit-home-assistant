import { useState, useSyncExternalStore } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
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
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";
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
  const [signedOut, setSignedOut] = useState("");
  const [remember, setRemember] = useState(false);
  const [url, setUrl] = useState(
    profileId?.startsWith("ha:") ? profileId.slice(3) : "",
  );
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localLoaded, setLocalLoaded] = useState(false);
  const loadLocal = async () => {
    setError("");
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
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load the local connection.",
      );
    } finally {
      setBusy(false);
    }
  };
  const signIn = async () => {
    setError("");
    setSignedOut("");
    const compatible = browserSignIn.compatibility({
      url,
      allowInsecureHttp: trust,
    });
    if (compatible.kind === "blocked") {
      setError(signInHelp[compatible.reason]);
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
        setError(signInHelp[started.reason]);
        setBusy(false);
      }
    } catch {
      setError(
        "Could not start the sign-in. Check that this browser allows site data for Maurice.",
      );
      setBusy(false);
    }
  };
  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const origin = normalizeUrl(url);
      await session.connect({ url: origin, token, allowInsecureHttp: trust });
      setToken("");
      // Back to the Home already below, rather than a second one on top.
      router.dismissTo("/");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not connect. Check the address, access token and Home Assistant version.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: 800 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Label>Make yourself at home</Label>
        <Title>Settings</Title>
        <Panel>
          <Text style={styles.sectionTitle}>Home Assistant</Text>
          {notices.map((notice) => (
            <Body key={notice}>{notice}</Body>
          ))}
          <Body>
            Your devices stay connected through your own Home Assistant.{" "}
            {browserSession
              ? "Your token stays in memory for this page only. Reloading requires it again; it is never saved in browser storage."
              : "Maurice keeps the access token securely on this phone."}
          </Body>
          {browserSession && (
            <Body>
              Preferences and power permissions are saved in this browser,
              separately from your phone. Open Home Assistant from this computer
              to check its address; allow local network access if Chrome asks.
            </Body>
          )}
          {canLoadLocalConnection() && (
            <>
              <Button
                title="Load local connection"
                disabled={busy}
                secondary
                onPress={() => void loadLocal()}
              />
              {localLoaded && (
                <Body>
                  Local connection loaded. Review the address, confirm trust for
                  HTTP if needed, then Connect.
                </Body>
              )}
            </>
          )}
          <Text style={{ color: colors.text }}>Home Assistant URL</Text>
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
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Body>
                  {browserSignInAvailable
                    ? "I trust this local network; the sign-in and the token will be sent unencrypted."
                    : "I trust this local network; the token will be sent unencrypted."}
                </Body>
              </View>
              <Switch
                accessibilityLabel="Trust local HTTP network"
                value={trust}
                onValueChange={setTrust}
              />
            </View>
          )}
          {browserSignInAvailable && (
            <>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Body>
                    Remember this browser: reloading reconnects without signing
                    in again. Anyone using this browser profile, and any script
                    running on this Maurice address, can use this sign-in; it is
                    not protected like the phone&apos;s secure storage. Not for
                    a shared computer.
                  </Body>
                </View>
                <Switch
                  accessibilityLabel="Remember this browser"
                  value={remember}
                  onValueChange={setRemember}
                />
              </View>
              <Button
                title={
                  busy
                    ? "Opening Home Assistant…"
                    : "Sign in with Home Assistant"
                }
                disabled={busy}
                onPress={() => void signIn()}
              />
              <Body>
                Opens your Home Assistant login page. Without Remember this
                browser, the sign-in stays in memory for this page only:
                reloading asks you to sign in again, whatever you choose on that
                page. Power permissions you allow belong to the Home Assistant
                user who signs in.
              </Body>
              <Text style={styles.sectionTitle}>Or use an access token</Text>
            </>
          )}
          <Text style={{ color: colors.text }}>Long-lived access token</Text>
          <TextInput
            accessibilityLabel="Access token"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showToken}
            textContentType="password"
            placeholder="Paste your access token"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <View style={styles.row}>
            <Body>Show token</Body>
            <Switch
              accessibilityLabel="Show token"
              value={showToken}
              onValueChange={setShowToken}
            />
          </View>
          <Body>
            Create a token in Home Assistant → Profile → Security. Use a
            dedicated household user. Use the address you open Home Assistant
            with. For a local connection, use the same household network.
          </Body>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {!!error && browserSession && (
            <Body>
              Check that Home Assistant opens in this browser and that Chrome
              permits the connection. For a local HTTP server, run Maurice on
              localhost. Remote hosting may require HTTPS for Home Assistant.
            </Body>
          )}
          <Button
            title={busy ? "Connecting…" : "Connect"}
            disabled={busy}
            onPress={() => {
              void connect();
            }}
          />
        </Panel>
        {!!signedOut && <Body>{signedOut}</Body>}
        <Button
          title="Explore demo home"
          disabled={busy}
          secondary
          onPress={() => {
            setBusy(true);
            void session
              .connect({ demo: true })
              .then(() => router.dismissTo("/"))
              .catch(() => setError("Could not load demo."))
              .finally(() => setBusy(false));
          }}
        />
        {profileId && (
          <>
            <Button
              title="Entities and rooms"
              secondary
              onPress={() => router.push("/entities")}
            />
            <Button
              title="Diagnostics"
              secondary
              onPress={() => router.push("/diagnostics")}
            />
            <Button
              title="Disconnect"
              secondary
              onPress={() => {
                session.disconnect();
                router.replace("/");
              }}
            />
            {signedIn && (
              <Body>
                {browserState === "remembered"
                  ? "This browser remembers this sign-in: reloading reconnects until you sign out or stop remembering it."
                  : "You are signed in for this page only: reloading asks you to sign in again."}
              </Body>
            )}
            {signedIn && browserState === "remembered" && (
              <Button
                title="Stop remembering this browser"
                secondary
                onPress={() => {
                  setSignedOut("");
                  void session
                    .stopRemembering()
                    .then((stopped) =>
                      setSignedOut(
                        stopped
                          ? "This browser no longer remembers the sign-in. This page stays signed in until it is closed."
                          : "This browser could not forget the sign-in. Try again, or sign out.",
                      ),
                    );
                }}
              />
            )}
            {signedIn && (
              <Button
                title="Sign out"
                secondary
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
                              ? "Signed out."
                              : "Signed out on this page, but Home Assistant could not confirm the revocation. Remove this sign-in in Home Assistant under Profile → Security.",
                          ),
                        )
                        .catch(() => setError("Could not sign out."));
                    },
                  })
                }
              />
            )}
            {mode === "homeAssistant" && !signedIn && (
              <Button
                title="Forget this Home Assistant"
                secondary
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
                          setError("Could not remove stored credentials."),
                        );
                    },
                  })
                }
              />
            )}
          </>
        )}
        <Panel style={{ alignItems: "center", gap: 10 }}>
          <Image
            source={require("../../assets/maurice.png")}
            style={{ width: 120, height: 120 }}
            accessibilityLabel="Maurice: a moustached butler in a waistcoat and bow tie, chin raised with a disapproving look, in front of a house and smart-home icons"
          />
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              letterSpacing: 4,
            }}
          >
            MAURICE
          </Text>
          <Text
            style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}
          >
            Module Autonome Universel de Régulation Intelligente et de Contrôle
            Électrique.
          </Text>
          <Text
            style={{
              color: colors.accent,
              fontSize: 14,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            « Maurice s’occupe de tout. Vous, de rien. »
          </Text>
        </Panel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
