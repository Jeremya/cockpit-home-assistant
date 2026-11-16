import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useCockpit } from "../../core/store";
import { getCapability } from "../../core/capabilities";
import { assessEntity } from "../../core/policy";
import { kindLabel, primaryValue } from "../../core/presentation";
import { isVisible, roomId } from "../../core/selectors";
import type { EntityRecord, HomeSnapshot } from "../../core/types";
import { resolveAlias } from "../../preferences/types";
import { session } from "../../services/runtime";
import {
  openDeviceSummary,
  type DeviceDestination,
} from "../../services/deviceNavigation";
import { readingTint } from "../EntityCard";
import { entityAppearance, Icon } from "../EntityIcon";
import { SwitchControl } from "../controls/SwitchControl";
import { CameraImageCard } from "../camera/CameraImageCard";
import { Body, Button, Caption, KeyValue, Label, Panel, colors } from "../ui";
import { radii, spacing, typography } from "../../theme";
import { SourceLabel, detail } from "./DeviceSummaryContent";
import { FadeIn } from "../home/FadeIn";
import { detailGap } from "./layout";
import { DetailHeader, DetailMessage, notConnected } from "./DetailTitle";

export type ReadingDetailContentProps = {
  /** The home the target belongs to; another current home shows nothing of it. */
  profileId: string | null;
  entityKey: string;
  onOpenDevice?: (destination: DeviceDestination) => void;
};

/** One reading's observation, favorite and raw attributes, without a route or a scroll owner. */
export function ReadingDetailContent({
  profileId,
  entityKey,
  onOpenDevice,
}: ReadingDetailContentProps) {
  const { snapshot, preferences, profileId: current } = useCockpit();
  const resolved = resolveAlias(entityKey, preferences.identities.aliases);
  const entity =
    current !== null && current === profileId
      ? Object.values(snapshot?.entities ?? {}).find(
          (item) => item.key === resolved,
        )
      : undefined;
  if (current === null) return <DetailMessage {...notConnected} />;
  if (!entity || !snapshot)
    return (
      <DetailMessage
        title="Entity unavailable"
        body="This entity is missing from the current home. Its preferences are kept for reconciliation."
      />
    );
  // Raw attributes opened for one target never stay visible for the next.
  return (
    <ReadingBody
      key={JSON.stringify([profileId, entity.key])}
      entity={entity}
      snapshot={snapshot}
      profileId={profileId}
      onOpenDevice={onOpenDevice}
    />
  );
}
function ReadingBody({
  entity,
  snapshot,
  profileId,
  onOpenDevice,
}: {
  entity: EntityRecord;
  snapshot: HomeSnapshot;
  profileId: string | null;
  onOpenDevice?: (destination: DeviceDestination) => void;
}) {
  const { status, preferences, mode } = useCockpit();
  const [raw, setRaw] = useState(false);
  const cap = getCapability(entity, snapshot.config);
  const room = roomId(entity, snapshot, preferences);
  const favorite = preferences.favorites.includes(entity.key);
  const ready = status.kind === "ready";
  const appearance = entityAppearance(entity, ready);
  const { icon } = appearance;
  // A known Off is a plain value: the active colour is for On only.
  const tint = readingTint(entity, ready, appearance.tint);
  const assessment = assessEntity(entity, ready);
  const device = entity.deviceId
    ? snapshot.devices[entity.deviceId]
    : undefined;
  return (
    // Native eases a detail in; web and reduced motion show it at once.
    <FadeIn>
      <View testID="reading-detail" style={{ gap: detailGap }}>
        <DetailHeader
          eyebrow={room ? snapshot.areas[room]?.name : "Unassigned"}
          title={entity.name}
          description={
            device && (device.manufacturer || device.model)
              ? [device.manufacturer, device.model].filter(Boolean).join(" · ")
              : undefined
          }
        />
        <Panel>
          <View style={reading.source}>
            <View style={[reading.icon, { backgroundColor: `${tint}1c` }]}>
              <Icon name={icon} color={tint} size={22} />
            </View>
            <View style={reading.sourceCopy}>
              <SourceLabel ready={ready} demo={mode === "demo"} />
              <Caption>{kindLabel[entity.domain]}</Caption>
            </View>
          </View>
          <Text
            style={[
              detail.hero,
              {
                color: readingTint(entity, ready, appearance.tint, colors.text),
              },
            ]}
          >
            {primaryValue(entity, snapshot.config)}
          </Text>
          {cap?.kind === "climate" && (
            <View>
              <KeyValue
                label="Target"
                value={`${
                  entity.attributes.temperature !== undefined
                    ? String(entity.attributes.temperature)
                    : `${String(entity.attributes.target_temp_low ?? "—")} – ${String(entity.attributes.target_temp_high ?? "—")}`
                } ${cap.unit}`}
              />
              <KeyValue label="Mode" value={entity.state} last />
            </View>
          )}
          <Body style={reading.assessment}>{assessment.explanation}</Body>
          <View style={detail.footnotes}>
            <Caption>
              {cap?.kind === "switch"
                ? mode === "demo"
                  ? "Values are simulated inside Maurice. Sending a request does not change the observed value until the simulation reports it."
                  : "Values reflect the last state reported to Maurice. A fresh HA connection does not confirm a recent device poll."
                : "Read-only observation. Values reflect the last state reported to Maurice. A fresh HA connection does not confirm a recent device poll."}
            </Caption>
          </View>
        </Panel>
        {entity.domain === "camera" && (
          <CameraImageCard
            entity={entity}
            profileId={profileId}
            ready={ready}
          />
        )}
        {cap?.kind === "switch" && profileId && (
          <SwitchControl
            key={`${profileId}:${snapshot.sessionId}:${entity.key}:${entity.entityId}`}
            entity={entity}
            snapshot={snapshot}
            profileId={profileId}
            mode={mode}
            ready={ready}
          />
        )}
        <View style={reading.actions}>
          {entity.deviceId && profileId && isVisible(entity, preferences) && (
            <Button
              title="All readings for this device"
              secondary
              icon="list"
              style={reading.action}
              onPress={() =>
                openDeviceSummary(profileId, entity.deviceId!, onOpenDevice)
              }
            />
          )}
          <Button
            title={favorite ? "Remove from favorites" : "Add to favorites"}
            secondary
            icon="star"
            style={reading.action}
            onPress={() =>
              session.updatePreferences((p) => ({
                ...p,
                favorites: favorite
                  ? p.favorites.filter((value) => value !== entity.key)
                  : [...p.favorites, entity.key],
              }))
            }
          />
        </View>
        <Panel>
          <Label tone="neutral">Observation details</Label>
          <View>
            <KeyValue label="Entity" value={entity.entityId} />
            <KeyValue
              label="Last changed"
              value={new Date(entity.lastChanged).toLocaleString()}
            />
            <KeyValue
              label="Last updated"
              value={new Date(entity.lastUpdated).toLocaleString()}
            />
            <KeyValue
              label="Snapshot received"
              value={new Date(snapshot.receivedAt).toLocaleString()}
            />
            <KeyValue
              label="Availability"
              value={
                ["unknown", "unavailable"].includes(entity.state)
                  ? entity.state
                  : "Reported available"
              }
              last
            />
          </View>
          {entity.domain === "lock" && (
            <Caption>
              Cloud integrations can report physical changes with a delay.
              Polling integrations may take about 30 seconds.
            </Caption>
          )}
          <Button
            title={raw ? "Hide attributes" : "Show raw attributes"}
            variant="quiet"
            accessibilityExpanded={raw}
            style={reading.disclosure}
            onPress={() => setRaw(!raw)}
          />
          {raw && (
            <Text selectable style={reading.raw}>
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
          )}
        </Panel>
      </View>
    </FadeIn>
  );
}
const reading = StyleSheet.create({
  source: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceCopy: { flex: 1, minWidth: 0, gap: 2 },
  assessment: { color: colors.text },
  // Side by side where both fit; each keeps a full 48 dp row otherwise.
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 220 },
  // The label aligns with the column; the padding keeps the 48 dp target.
  disclosure: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
  raw: {
    ...typography.caption,
    color: colors.muted,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    padding: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.background,
  },
});
