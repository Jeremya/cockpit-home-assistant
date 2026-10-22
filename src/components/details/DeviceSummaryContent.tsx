import { useState } from "react";
import { Text, View } from "react-native";
import { useCockpit } from "../../core/store";
import {
  deviceSummaries,
  type DeviceSummary,
} from "../../core/deviceSummaries";
import { presentDevice } from "../../core/devicePresentation";
import type { HomeSnapshot } from "../../core/types";
import { primarySwitch } from "../../commands/switchControl";
import { primaryValue } from "../../core/presentation";
import type { ReadingDestination } from "../../services/deviceNavigation";
import { EntityCard } from "../EntityCard";
import { SwitchControl } from "../controls/SwitchControl";
import { Body, Button, Label, Panel, colors } from "../ui";
import { detailColumns, detailGap } from "./layout";
import { DetailMessage, DetailTitle, notConnected } from "./DetailTitle";

export type DeviceSummaryContentProps = {
  profileId: string;
  deviceId: string;
  /** Width measured by the owning route or panel. */
  width: number;
  onOpenReading?: (destination: ReadingDestination) => void;
};

/** One device's observations and power control, without a route or a scroll owner. */
export function DeviceSummaryContent({
  profileId,
  deviceId,
  width,
  onOpenReading,
}: DeviceSummaryContentProps) {
  const {
    snapshot,
    profileId: current,
    preferences,
    status,
    mode,
  } = useCockpit();
  const ready = status.kind === "ready";
  const group =
    snapshot && current === profileId
      ? deviceSummaries(snapshot, preferences, profileId, ready).find(
          (group) => group.deviceId === deviceId,
        )
      : undefined;
  if (current === null) return <DetailMessage {...notConnected} />;
  if (!group || !snapshot)
    return (
      <DetailMessage
        title="Device unavailable"
        body="This device is no longer visible in the current home. Return to Home to select a device."
      />
    );
  // The profile-scoped group identity remounts local expansion per target.
  return (
    <SummaryBody
      key={group.id}
      summary={group}
      snapshot={snapshot}
      ready={ready}
      demo={mode === "demo"}
      width={width}
      onOpenReading={onOpenReading}
    />
  );
}
function SummaryBody({
  summary,
  snapshot,
  ready,
  demo,
  width,
  onOpenReading,
}: {
  summary: DeviceSummary;
  snapshot: HomeSnapshot;
  ready: boolean;
  demo: boolean;
  width: number;
  onOpenReading?: (destination: ReadingDestination) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const split = detailColumns(width) === 2;
  const display = presentDevice(summary, snapshot, ready);
  const { preferences, mode } = useCockpit();
  const primary = primarySwitch(summary.deviceId, snapshot, preferences, mode);
  return (
    <View testID="device-summary" style={{ gap: detailGap }}>
      <Label>{summary.roomLabel}</Label>
      <DetailTitle>{summary.name}</DetailTitle>
      <Body>
        {[summary.device?.manufacturer, summary.device?.model]
          .filter(Boolean)
          .join(" · ") || "Device metadata unavailable"}
      </Body>
      <View
        testID="device-summary-columns"
        style={{ flexDirection: split ? "row" : "column", gap: detailGap }}
      >
        <View style={{ flex: split ? 1 : undefined, minWidth: 0 }}>
          <Panel>
            <Label>
              {!ready
                ? "Cached observations"
                : demo
                  ? "Simulated observations"
                  : "Reported by Home Assistant"}
            </Label>
            {primary && (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.text, fontSize: 40 }}
              >
                {primaryValue(primary, snapshot.config)}
              </Text>
            )}
            {display.rows.map((row, index) => (
              <View key={`${index}:${row.label}`} style={{ gap: 4 }}>
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
                Distributions and quantities are manufacturer reports. They do
                not confirm the pet ate. Battery and power meaning may require
                verification.
              </Body>
            )}
            <Body>
              A fresh HA connection does not confirm a recent device poll.
            </Body>
          </Panel>
        </View>
        {primary && (
          <View style={{ flex: split ? 1 : undefined, minWidth: 0 }}>
            <SwitchControl
              key={JSON.stringify([
                summary.profileId,
                snapshot.sessionId,
                primary.key,
                primary.entityId,
              ])}
              entity={primary}
              snapshot={snapshot}
              profileId={summary.profileId}
              mode={mode}
              ready={ready}
            />
          </View>
        )}
      </View>
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
            <EntityCard
              key={entity.key}
              entityId={entity.entityId}
              onOpenReading={onOpenReading}
            />
          ))}
        </View>
      )}
    </View>
  );
}
