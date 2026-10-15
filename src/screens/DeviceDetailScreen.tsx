import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useCockpit } from "../core/store";
import { getCapability } from "../core/capabilities";
import { primaryValue } from "../core/presentation";
import { roomId } from "../core/selectors";
import { resolveAlias } from "../preferences/types";
import { session } from "../services/runtime";
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";
export function DeviceDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { snapshot, status, preferences, mode } = useCockpit();
  const [raw, setRaw] = useState(false);
  const resolved = resolveAlias(key, preferences.identities.aliases);
  const entity = Object.values(snapshot?.entities ?? {}).find(
    (item) => item.key === resolved,
  );
  if (!entity || !snapshot)
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Title>Entity unavailable</Title>
        <Body>
          This entity is missing from the current home. Its preferences are kept
          for reconciliation.
        </Body>
      </ScrollView>
    );
  const cap = getCapability(entity, snapshot.config);
  const room = roomId(entity, snapshot, preferences);
  const favorite = preferences.favorites.includes(entity.key);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Label>{room ? snapshot.areas[room]?.name : "Unassigned"}</Label>
      <Title>{entity.name}</Title>
      <Panel>
        <Label>
          {status.kind === "ready"
            ? mode === "demo"
              ? "Simulated observation"
              : "As reported by Home Assistant"
            : "Cached observation"}
        </Label>
        <Text style={{ color: colors.text, fontSize: 34 }}>
          {primaryValue(entity, snapshot.config)}
        </Text>
        {cap?.kind === "climate" && (
          <Body>
            Target:{" "}
            {entity.attributes.temperature !== undefined
              ? String(entity.attributes.temperature)
              : `${String(entity.attributes.target_temp_low ?? "—")} – ${String(entity.attributes.target_temp_high ?? "—")}`}{" "}
            {cap.unit}
            {"\n"}Mode: {entity.state}
          </Body>
        )}
        {entity.domain === "camera" && (
          <Body>
            Camera snapshots will be enabled after this camera’s image path is
            verified. Capture time is currently unknown.
          </Body>
        )}
        <Body>
          Device controls are part of the next implementation stage. This view
          shows observed state.
        </Body>
      </Panel>
      <Button
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        secondary
        onPress={() =>
          session.updatePreferences((p) => ({
            ...p,
            favorites: favorite
              ? p.favorites.filter((value) => value !== entity.key)
              : [...p.favorites, entity.key],
          }))
        }
      />
      <Panel>
        <Label>Observation details</Label>
        <Body>
          Entity: {entity.entityId}
          {"\n"}Last changed: {new Date(entity.lastChanged).toLocaleString()}
          {"\n"}Last updated: {new Date(entity.lastUpdated).toLocaleString()}
          {"\n"}Snapshot received:{" "}
          {new Date(snapshot.receivedAt).toLocaleString()}
          {"\n"}Availability:{" "}
          {["unknown", "unavailable"].includes(entity.state)
            ? entity.state
            : "Reported available"}
        </Body>
        {entity.domain === "lock" && (
          <Body>
            Cloud integrations can report physical changes with a delay. Polling
            integrations may take about 30 seconds.
          </Body>
        )}
      </Panel>
      <Button
        title={raw ? "Hide attributes" : "Show raw attributes"}
        secondary
        onPress={() => setRaw(!raw)}
      />
      {raw && (
        <Panel>
          <Text
            selectable
            style={{
              color: colors.muted,
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(entity.attributes).filter(
                  ([name]) => !/token|secret|password|url/i.test(name),
                ),
              ),
              null,
              2,
            )}
          </Text>
        </Panel>
      )}
    </ScrollView>
  );
}
