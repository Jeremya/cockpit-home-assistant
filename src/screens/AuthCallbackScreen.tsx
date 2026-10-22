import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { router, useNavigation, type Href } from "expo-router";
import { session } from "../services/runtime";
import { browserSignIn } from "../services/auth/browserAuth";
import type { SignInFailure } from "../services/auth/signIn";
import { Body, Button, Label, Panel, Title, styles } from "../components/ui";

type Outcome =
  | { kind: "connected"; returnTo: string }
  | { kind: "failed"; reason: SignInFailure };
let completion: Promise<Outcome> | undefined;
/**
 * One completion per callback page, shared by remounts. The session is opened
 * even if the user left this screen meanwhile; only navigation needs it.
 */
function completeSignIn() {
  completion ??= browserSignIn.complete().then(async (result) => {
    if (result.kind === "failed") return result;
    // A failed first synchronization is shown, and retried, by the session.
    await session.connect(result.signIn).catch(() => undefined);
    return { kind: "connected", returnTo: result.returnTo };
  });
  return completion;
}
const again = "Sign in again.";
const messages: Record<SignInFailure, string> = {
  no_transaction: `This sign-in was already used or did not start on this page. ${again}`,
  corrupt_transaction: `This sign-in could not be checked. ${again}`,
  wrong_redirect: `This sign-in did not return to this Maurice address. ${again}`,
  malformed: `Home Assistant did not return a usable sign-in. ${again}`,
  state_mismatch: `This sign-in does not match the one started on this page. ${again}`,
  expired: `This sign-in took more than 10 minutes. ${again}`,
  invalid_grant: `Home Assistant refused this sign-in code. ${again}`,
  invalid_request: `Home Assistant refused this sign-in code. ${again}`,
  access_denied:
    "Home Assistant refused this user. Check the account in Home Assistant.",
  server_error: "Home Assistant could not complete the sign-in. Try later.",
  unexpected_response:
    "Home Assistant sent an unexpected answer. Check its version and try later.",
  unreachable: `Could not reach Home Assistant to finish signing in. Check the connection. ${again}`,
  storage_unavailable:
    "This browser blocks the site data needed to finish signing in. Allow site data for Maurice, or use an access token.",
  unsupported: "Browser sign-in is available in the web app only.",
};
export function AuthCallbackScreen() {
  const navigation = useNavigation();
  const [outcome, setOutcome] = useState<Outcome>();
  useEffect(() => {
    let active = true;
    // Reads the callback address synchronously, before it is cleared.
    void completeSignIn().then((result) => {
      if (!active) return;
      completion = undefined;
      setOutcome(result);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    // The navigator writes its initial address after this screen's effects;
    // clearing the params there keeps code and state out of the address.
    navigation.setParams({
      code: undefined,
      state: undefined,
      storeToken: undefined,
    } as never);
  }, [navigation]);
  useEffect(() => {
    if (outcome?.kind === "connected") router.replace(outcome.returnTo as Href);
  }, [outcome]);
  const failure = outcome?.kind === "failed" ? outcome.reason : undefined;
  return (
    <ScrollView contentContainerStyle={[styles.content, { maxWidth: 800 }]}>
      <Label>Home Assistant</Label>
      <Title>{failure ? "Sign-in not completed" : "Signing in"}</Title>
      <Panel>
        {failure ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              {messages[failure]}
            </Text>
            <Button
              title="Sign in again"
              onPress={() => router.replace("/settings")}
            />
          </>
        ) : (
          <Body>Signing in to Home Assistant…</Body>
        )}
      </Panel>
    </ScrollView>
  );
}
