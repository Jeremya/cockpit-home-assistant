import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useCockpit } from "../core/store";
import { deviceSummaries, type DeviceSummary } from "../core/deviceSummaries";
import { presentDevice } from "../core/devicePresentation";
import { EntityCard } from "../components/EntityCard";
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";
import type { HomeSnapshot } from "../core/types";

export function DeviceSummaryScreen() {
  const { id, profile } = useLocalSearchParams<{
    id: string;
    profile: string;
  }>();
  const { snapshot, profileId, preferences, status, mode } = useCockpit();
  const group =
    snapshot && profileId && profile === profileId
      ? deviceSummaries(
          snapshot,
          preferences,
          profileId,
          status.kind === "ready",
        ).find((group) => group.deviceId === id)
      : undefined;
  if (!group || !snapshot)
    return (
      <View style={[styles.screen, styles.content]}>
        <Title>Device unavailable</Title>
        <Body>
          This device is no longer visible in the current home. Return to Home
          to select a device.
        </Body>
      </View>
    );
  return (
    <SummaryContent
      key={group.id}
      summary={group}
      snapshot={snapshot}
      ready={status.kind === "ready"}
      demo={mode === "demo"}
    />
  );
}
function SummaryContent({
  summary,
  snapshot,
  ready,
  demo,
}: {
  summary: DeviceSummary;
  snapshot: HomeSnapshot;
  ready: boolean;
  demo: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const display = presentDevice(summary, snapshot, ready);
  return (
    <ScrollView
      testID="device-summary"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Label>{summary.roomLabel}</Label>
      <Title>{summary.name}</Title>
      <Body>
        {[summary.device?.manufacturer, summary.device?.model]
          .filter(Boolean)
          .join(" · ") || "Device metadata unavailable"}
      </Body>
      <Panel>
        <Label>
          {!ready
            ? "Cached observations"
            : demo
              ? "Simulated observations"
              : "Reported by Home Assistant"}
        </Label>
        {display.rows.map((row) => (
          <View key={row.label} style={{ gap: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {row.label}
            </Text>
            <Text style={{ color: colors.text, fontSize: 20 }}>
              {row.value}
            </Text>
            {row.note && <Body>{row.note}</Body>}
          </View>
        ))}
        {display.qualifiers.map((qualifier) => (
          <Text key={qualifier} style={{ color: colors.warning }}>
            {qualifier}
          </Text>
        ))}
        {display.feeder && (
          <Body>
            Distributions and quantities are manufacturer reports. They do not
            confirm the pet ate. Battery and power meaning may require
            verification.
          </Body>
        )}
        <Body>
          Read-only observations. A fresh HA connection does not confirm a
          recent device poll.
        </Body>
      </Panel>
      <Panel>
        <Label>Reading coverage</Label>
        <Body>
          {summary.coverage.assessed} of {summary.coverage.visible} visible
          readings assessed by attention rules. Other readings are not a device
          health check.
        </Body>
        {summary.coverage.missing > 0 && (
          <Body>
            {summary.coverage.missing} registered readings have no current
            observation.
          </Body>
        )}
        {summary.roomIds.length > 1 && (
          <Body>
            Members belong to multiple rooms. Individual room assignments are
            preserved.
          </Body>
        )}
        <Button
          title={
            expanded
              ? "Hide readings"
              : `Show all ${summary.members.length} readings`
          }
          secondary
          onPress={() => setExpanded((value) => !value)}
        />
      </Panel>
      {expanded && (
        <View testID="device-readings" style={{ gap: 8 }}>
          {summary.members.map((entity) => (
            <EntityCard key={entity.key} entityId={entity.entityId} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
