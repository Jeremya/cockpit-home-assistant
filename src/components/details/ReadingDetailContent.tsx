import { useState } from "react";
import { Text, View } from "react-native";
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
import { entityAppearance, Icon } from "../EntityIcon";
import { SwitchControl } from "../controls/SwitchControl";
import { CameraImageCard } from "../camera/CameraImageCard";
import { Body, Button, Label, Panel, colors, styles } from "../ui";
import { detailGap } from "./layout";
import { DetailMessage, DetailTitle, notConnected } from "./DetailTitle";

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
  const { icon, tint } = entityAppearance(entity, status.kind === "ready");
  const assessment = assessEntity(entity, status.kind === "ready");
  const device = entity.deviceId
    ? snapshot.devices[entity.deviceId]
    : undefined;
  return (
    <View testID="reading-detail" style={{ gap: detailGap }}>
      <Label>{room ? snapshot.areas[room]?.name : "Unassigned"}</Label>
      <DetailTitle>{entity.name}</DetailTitle>
      {device && (device.manufacturer || device.model) && (
        <Body>
          {[device.manufacturer, device.model].filter(Boolean).join(" · ")}
        </Body>
      )}
      <Panel>
        <View style={[styles.row, { marginBottom: 16 }]}>
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 19,
              backgroundColor: `${tint}16`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={icon} color={tint} size={28} />
          </View>
          <Body>{kindLabel[entity.domain]}</Body>
        </View>
        <Label>
          {status.kind === "ready"
            ? mode === "demo"
              ? "Simulated observation"
              : "As reported by Home Assistant"
            : "Cached observation"}
        </Label>
        <Text
          style={{
            color: tint,
            fontSize: 48,
            fontWeight: "400",
            letterSpacing: -1,
            marginVertical: 8,
          }}
        >
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
        <Body>{assessment.explanation}</Body>
        <Body>
          {cap?.kind === "switch"
            ? mode === "demo"
              ? "Values are simulated inside Maurice. Sending a request does not change the observed value until the simulation reports it."
              : "Values reflect the last state reported to Maurice. A fresh HA connection does not confirm a recent device poll."
            : "Read-only observation. Values reflect the last state reported to Maurice. A fresh HA connection does not confirm a recent device poll."}
        </Body>
      </Panel>
      {entity.domain === "camera" && (
        <CameraImageCard
          entity={entity}
          profileId={profileId}
          ready={status.kind === "ready"}
        />
      )}
      {cap?.kind === "switch" && profileId && (
        <SwitchControl
          key={`${profileId}:${snapshot.sessionId}:${entity.key}:${entity.entityId}`}
          entity={entity}
          snapshot={snapshot}
          profileId={profileId}
          mode={mode}
          ready={status.kind === "ready"}
        />
      )}
      {entity.deviceId && profileId && isVisible(entity, preferences) && (
        <Button
          title="All readings for this device"
          secondary
          onPress={() =>
            openDeviceSummary(profileId, entity.deviceId!, onOpenDevice)
          }
        />
      )}
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
    </View>
  );
}
