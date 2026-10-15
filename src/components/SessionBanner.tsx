import { Text } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { Body, Button, Panel, colors } from "./ui";
export function SessionBanner() {
  const status = useCockpit((state) => state.status);
  if (status.kind === "ready") return null;
  const title =
    status.kind === "error"
      ? status.error.code === "auth_invalid"
        ? "Maurice was refused entry: access token rejected"
        : status.error.code === "sync_timeout"
          ? "Maurice lost patience: synchronization timed out"
          : status.error.code === "ha_version_unsupported"
            ? "Maurice refuses this Home Assistant: it needs an update"
            : "Maurice is on his lunch break. Please try again."
      : status.kind === "idle"
        ? "Maurice is off duty"
        : status.kind === "synchronizing"
          ? "Maurice is doing his rounds…"
          : status.kind === "reconnecting"
            ? "Maurice is reconnecting…"
            : "Maurice is calling Home Assistant…";
  return (
    <Panel>
      <Text style={{ color: colors.warning, fontSize: 16, fontWeight: "600" }}>
        {title}
      </Text>
      <Body>
        {status.kind === "error"
          ? status.error.code === "auth_invalid"
            ? "Create a new token in Home Assistant, then update Settings."
            : "Check the address, network, server and phone permissions. Displayed values are cached until synchronization completes."
          : "House status is unknown until a fresh synchronization completes."}
      </Body>
      {(status.kind === "error" || status.kind === "idle") && (
        <>
          <Button
            title="Retry"
            onPress={() => {
              void session.retry().catch(() => undefined);
            }}
            secondary
          />
          <Button
            title="Connection settings"
            onPress={() => router.push("/settings")}
            secondary
          />
        </>
      )}
    </Panel>
  );
}
