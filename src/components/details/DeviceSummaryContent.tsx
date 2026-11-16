import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import { Icon } from "../EntityIcon";
import { SwitchControl } from "../controls/SwitchControl";
import {
  Body,
  Button,
  Caption,
  KeyValue,
  Label,
  Panel,
  StatusChip,
  colors,
} from "../ui";
import { spacing, typography } from "../../theme";
import { FadeIn } from "../home/FadeIn";
import { detailColumns, detailGap } from "./layout";
import { DetailHeader, DetailMessage, notConnected } from "./DetailTitle";

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
    // Native eases a detail in; web and reduced motion show it at once.
    <FadeIn>
      <View testID="device-summary" style={{ gap: detailGap }}>
        <DetailHeader
          eyebrow={summary.roomLabel}
          title={summary.name}
          description={
            [summary.device?.manufacturer, summary.device?.model]
              .filter(Boolean)
              .join(" · ") || "Device metadata unavailable"
          }
        />
        <View
          testID="device-summary-columns"
          style={{ flexDirection: split ? "row" : "column", gap: detailGap }}
        >
          <View style={{ flex: split ? 1 : undefined, minWidth: 0 }}>
            <Panel>
              <SourceLabel ready={ready} demo={demo} plural />
              {primary && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[detail.hero, !ready && detail.cached]}
                >
                  {primaryValue(primary, snapshot.config)}
                </Text>
              )}
              <View>
                {display.rows.map((row, index) => (
                  <KeyValue
                    key={`${index}:${row.label}`}
                    label={row.label}
                    value={row.value}
                    note={row.note}
                    last={index === display.rows.length - 1}
                  />
                ))}
              </View>
              {display.qualifiers.map((qualifier) => (
                <View key={qualifier} style={detail.qualifier}>
                  <Icon name="alert-circle" size={14} color={colors.warning} />
                  <Text style={detail.qualifierText}>{qualifier}</Text>
                </View>
              ))}
              <View style={detail.footnotes}>
                {display.feeder && (
                  <Caption>
                    Distributions and quantities are manufacturer reports. They
                    do not confirm the pet ate. Battery and power meaning may
                    require verification.
                  </Caption>
                )}
                <Caption>
                  A fresh HA connection does not confirm a recent device poll.
                </Caption>
              </View>
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
          <Label tone="neutral">Reading coverage</Label>
          <Body>
            {summary.coverage.assessed} of {summary.coverage.visible} visible
            readings assessed by attention rules. Other readings are not a
            device health check.
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
            accessibilityExpanded={expanded}
            onPress={() => setExpanded((value) => !value)}
          />
        </Panel>
        {expanded && (
          <View testID="device-readings" style={{ gap: spacing.sm }}>
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
    </FadeIn>
  );
}
/** Where the values come from. Cached is amber: it is never a current reading. */
export function SourceLabel({
  ready,
  demo,
  plural = false,
}: {
  ready: boolean;
  demo: boolean;
  plural?: boolean;
}) {
  return !ready ? (
    <StatusChip
      icon="clock"
      tone="warning"
      label={plural ? "Cached observations" : "Cached observation"}
    />
  ) : demo ? (
    <StatusChip
      icon="cpu"
      tone="accent"
      label={plural ? "Simulated observations" : "Simulated observation"}
    />
  ) : (
    <StatusChip
      icon="radio"
      tone="accent"
      label={
        plural ? "Reported by Home Assistant" : "As reported by Home Assistant"
      }
    />
  );
}
export const detail = StyleSheet.create({
  hero: {
    ...typography.hero,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  cached: { color: colors.muted },
  qualifier: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qualifierText: {
    ...typography.secondary,
    color: colors.warning,
    fontWeight: "600",
    flex: 1,
  },
  footnotes: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
