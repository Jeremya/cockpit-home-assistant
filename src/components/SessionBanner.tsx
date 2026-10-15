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
        ? "Access token rejected"
        : status.error.code === "sync_timeout"
          ? "Synchronization timed out"
          : status.error.code === "ha_version_unsupported"
            ? "Home Assistant needs an update"
            : "Connection needs attention"
      : status.kind === "idle"
        ? "Disconnected"
        : status.kind === "synchronizing"
          ? "Synchronizing your home…"
          : status.kind === "reconnecting"
            ? "Reconnecting…"
            : "Connecting to Home Assistant…";
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
