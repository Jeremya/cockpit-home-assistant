import { useState } from "react";
import {
  Alert,
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
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";
export function SettingsScreen() {
  const profileId = useCockpit((state) => state.profileId);
  const mode = useCockpit((state) => state.mode);
  const [url, setUrl] = useState(
    profileId?.startsWith("ha:") ? profileId.slice(3) : "",
  );
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const origin = normalizeUrl(url);
      await session.connect({ url: origin, token, allowInsecureHttp: trust });
      setToken("");
      router.replace("/");
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
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Label>Make yourself at home</Label>
        <Title>Settings</Title>
        <Panel>
          <Text style={styles.sectionTitle}>Home Assistant</Text>
          <Body>
            Your devices stay connected through your own Home Assistant. Maurice
            keeps the access token securely on this phone.
          </Body>
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
            with. For a local connection, keep your phone on the same Wi-Fi.
          </Body>
          {url.trim().startsWith("http:") && (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Body>
                  I trust this local network; the token will be sent
                  unencrypted.
                </Body>
              </View>
              <Switch
                accessibilityLabel="Trust local HTTP network"
                value={trust}
                onValueChange={setTrust}
              />
            </View>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Button
            title={busy ? "Connecting…" : "Connect"}
            disabled={busy}
            onPress={() => {
              void connect();
            }}
          />
        </Panel>
        <Button
          title="Explore demo home"
          disabled={busy}
          secondary
          onPress={() => {
            setBusy(true);
            void session
              .connect({ demo: true })
              .then(() => router.replace("/"))
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
            {mode === "homeAssistant" && (
              <Button
                title="Forget this Home Assistant"
                secondary
                onPress={() =>
                  Alert.alert(
                    "Forget connection?",
                    "Removes the token from this phone. Preferences are kept. Revoke the token separately in Home Assistant.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Forget",
                        style: "destructive",
                        onPress: () => {
                          void session
                            .forget()
                            .then(() => router.replace("/"))
                            .catch(() =>
                              setError("Could not remove stored credentials."),
                            );
                        },
                      },
                    ],
                  )
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
