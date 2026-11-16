import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { confirmAction } from "../services/confirmAction";
import { useHousePlan } from "../spatial/plans";
import { areaLinkStatus } from "../spatial/selectors";
import { savedPlacements, placementIssueLabel } from "../spatial/placements";
import {
  Body,
  Button,
  Caption,
  KeyValue,
  Label,
  Notice,
  Panel,
  Screen,
  ScreenHeader,
} from "../components/ui";
import { buildInfo } from "../config/build";
import { SessionBanner } from "../components/SessionBanner";
import { spacing } from "../theme";
export function DiagnosticsScreen() {
  const {
    snapshot,
    status,
    notices,
    preferences,
    mode,
    profileId,
    preferencesLoadedFor,
  } = useCockpit();
  const preferencesReady = !!profileId && preferencesLoadedFor === profileId;
  const { plan, defaultChanged } = useHousePlan();
  const { spatial } = preferences;
  const [width, setWidth] = useState(0);
  const split = width >= 880;
  const placementProblems = savedPlacements(
    snapshot,
    preferences,
    plan,
    status.kind === "ready",
  ).filter((entry) => entry.issues.length);
  const brokenLinks = Object.keys(spatial.areaLinks).filter(
    (room) =>
      areaLinkStatus(room, spatial.areaLinks, snapshot).kind === "missing",
  ).length;
  const planRooms = new Set(
    plan.floors.flatMap((floor) => floor.rooms.map((room) => room.id)),
  );
  const orphanLinks = Object.keys(spatial.areaLinks).filter(
    (room) => !planRooms.has(room),
  ).length;
  const known = new Set(
    Object.values(snapshot?.entities ?? {}).map((entity) => entity.key),
  );
  const missing = [
    ...new Set([
      ...preferences.favorites,
      ...Object.keys(preferences.visibility),
      ...Object.keys(preferences.roomOverrides),
    ]),
  ].filter((key) => !known.has(key));
  const registries = snapshot ? Object.entries(snapshot.metadata) : [];
  return (
    <Screen>
      <ScreenHeader eyebrow="Connection & data health" title="Diagnostics" />
      <SessionBanner />
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[screen.columns, split && screen.columnsWide]}
      >
        <View style={[screen.column, split && screen.half]}>
          <Panel>
            <Label tone="neutral">Session</Label>
            <View>
              <KeyValue label="Mode" value={mode ?? "None"} />
              <KeyValue label="Session" value={status.kind} />
              <KeyValue
                label="Home Assistant"
                value={`${snapshot?.config.haVersion ?? "Not connected"}${
                  snapshot && status.kind !== "ready"
                    ? " (last synchronized)"
                    : ""
                }`}
              />
              <KeyValue
                label="Snapshot"
                value={
                  snapshot
                    ? status.kind === "ready"
                      ? "synchronized"
                      : "cached; awaiting synchronization"
                    : "not loaded"
                }
                tone={
                  snapshot && status.kind !== "ready" ? "warning" : undefined
                }
              />
              <KeyValue
                label="Snapshot epoch"
                value={String(snapshot?.syncEpoch ?? "—")}
              />
              <KeyValue
                label="Entities"
                value={String(Object.keys(snapshot?.entities ?? {}).length)}
              />
              <KeyValue
                label="Unresolved preferences"
                value={String(missing.length)}
                last
              />
            </View>
          </Panel>
          <Panel>
            <Label tone="neutral">Attention coverage</Label>
            <Body>
              Attention rules are not a device health check. Other readings are
              not assessed, hidden entities are excluded, and a fresh Home
              Assistant connection does not confirm a recent device poll.
            </Body>
          </Panel>
          {buildInfo.trial && (
            <Panel>
              <Label tone="neutral">Internal trial</Label>
              <Body>
                Maurice {buildInfo.version} · build {buildInfo.number}
                {"\n"}
                Source: {buildInfo.revision}
                {"\n"}
                Bundled plan: {buildInfo.plan}
                {"\n"}
                2D plan · HA observations · simulated demo controls
              </Body>
            </Panel>
          )}
          {!!notices.length && (
            <Panel>
              <Label tone="neutral">Notices</Label>
              {notices.map((notice) => (
                <Notice key={notice} tone="warning">
                  {notice}
                </Notice>
              ))}
            </Panel>
          )}
        </View>
        <View style={[screen.column, split && screen.half]}>
          {mode && (
            <Panel>
              <Label tone="neutral">Floor plan</Label>
              <View>
                <KeyValue
                  label="Plan"
                  value={`${plan.name} (revision ${plan.revision})`}
                />
                <KeyValue
                  label="Saved for this profile"
                  value={spatial.plan ? "yes" : "not yet"}
                />
                <KeyValue
                  label="Room links"
                  value={`${Object.keys(spatial.areaLinks).length}${
                    brokenLinks
                      ? ` (${brokenLinks} ${status.kind === "ready" ? "to removed HA areas" : "absent from cached HA areas"})`
                      : ""
                  }${orphanLinks ? ` (${orphanLinks} to rooms not in this plan)` : ""}`}
                  tone={brokenLinks || orphanLinks ? "warning" : undefined}
                />
                <KeyValue
                  label="Device placements"
                  value={`${Object.keys(spatial.placements).length}${
                    placementProblems.length
                      ? ` (${placementProblems.length} unresolved or hidden)`
                      : ""
                  }`}
                  tone={placementProblems.length ? "warning" : undefined}
                  last
                />
              </View>
              {defaultChanged && (
                <Notice>A newer default plan is available.</Notice>
              )}
              {placementProblems.map((entry) => (
                <Notice key={entry.key} tone="warning">
                  {`${entry.entity?.name ?? entry.storedKey}: ${entry.issues
                    .map((issue) => placementIssueLabel[issue])
                    .join(" · ")}`}
                </Notice>
              ))}
              {!preferencesReady && (
                <Body>Preferences for this profile are not loaded yet.</Body>
              )}
              <View style={screen.actions}>
                {!!Object.keys(spatial.placements).length && (
                  <Button
                    title="Manage device placements"
                    secondary
                    style={screen.action}
                    onPress={() => router.push("/house-place")}
                  />
                )}
                <Button
                  title="Reset plan to default"
                  variant="danger"
                  style={screen.action}
                  disabled={!preferencesReady}
                  onPress={() =>
                    confirmAction({
                      title: "Reset floor plan?",
                      message:
                        "Replaces this profile's floor plan with the current default and removes its room links and device placements. Favorites, visibility, room overrides and power permissions are kept.",
                      confirmLabel: "Reset",
                      onConfirm: () => {
                        if (!session.resetSpatial())
                          session.notice(
                            "The plan was not reset: preferences for this profile are not loaded.",
                          );
                      },
                    })
                  }
                />
              </View>
            </Panel>
          )}
          {snapshot && (
            <Panel>
              <Label tone="neutral">Registry metadata</Label>
              <View>
                {registries.map(([name, value], index) => (
                  <KeyValue
                    key={name}
                    label={name}
                    value={`${value.kind}${value.kind === "stale" ? ` (${value.reason})` : ""}`}
                    tone={value.kind === "fresh" ? undefined : "warning"}
                    last={index === registries.length - 1}
                  />
                ))}
              </View>
            </Panel>
          )}
          {!!missing.length && (
            <Panel>
              <Label tone="neutral">
                {status.kind === "ready"
                  ? "Missing identities"
                  : "Unverified identities"}
              </Label>
              {missing.map((key) => (
                <Body key={key}>{key}</Body>
              ))}
            </Panel>
          )}
        </View>
      </View>
      <View style={screen.foot}>
        {__DEV__ && (
          <Button
            title="Open 3D scene lab (development)"
            variant="quiet"
            style={screen.lab}
            onPress={() => router.push("/scene-lab")}
          />
        )}
        <Caption>
          Tokens and authenticated image URLs are excluded from this screen.
          Real device compatibility is verified separately from demo mode.
        </Caption>
      </View>
    </Screen>
  );
}
const screen = StyleSheet.create({
  // One column on a phone; two balanced columns of panels when wide.
  columns: { gap: spacing.lg },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  column: { gap: spacing.lg, minWidth: 0 },
  half: { flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 200 },
  foot: { gap: spacing.sm },
  lab: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
});
