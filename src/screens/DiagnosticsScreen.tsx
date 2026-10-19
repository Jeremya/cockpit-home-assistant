import { ScrollView } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { confirmAction } from "../services/confirmAction";
import { useHousePlan } from "../spatial/plans";
import { areaLinkStatus } from "../spatial/selectors";
import { savedPlacements, placementIssueLabel } from "../spatial/placements";
import { Body, Button, Label, Panel, Title, styles } from "../components/ui";
import { buildInfo } from "../config/build";
import { SessionBanner } from "../components/SessionBanner";
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
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Label>Connection & data health</Label>
      <Title>Diagnostics</Title>
      <SessionBanner />
      {buildInfo.trial && (
        <Panel>
          <Label>Internal trial</Label>
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
      <Panel>
        <Body>
          Mode: {mode ?? "None"}
          {"\n"}Session: {status.kind}
          {"\n"}Home Assistant: {snapshot?.config.haVersion ?? "Not connected"}
          {snapshot && status.kind !== "ready" ? " (last synchronized)" : ""}
          {"\n"}Snapshot:{" "}
          {snapshot
            ? status.kind === "ready"
              ? "synchronized"
              : "cached; awaiting synchronization"
            : "not loaded"}
          {"\n"}Snapshot epoch: {snapshot?.syncEpoch ?? "—"}
          {"\n"}Entities: {Object.keys(snapshot?.entities ?? {}).length}
          {"\n"}Unresolved preferences: {missing.length}
        </Body>
      </Panel>
      {mode && (
        <Panel>
          <Label>Floor plan</Label>
          <Body>
            Plan: {plan.name} (revision {plan.revision}){"\n"}Saved for this
            profile: {spatial.plan ? "yes" : "not yet"}
            {"\n"}Room links: {Object.keys(spatial.areaLinks).length}
            {brokenLinks
              ? ` (${brokenLinks} ${status.kind === "ready" ? "to removed HA areas" : "absent from cached HA areas"})`
              : ""}
            {orphanLinks ? ` (${orphanLinks} to rooms not in this plan)` : ""}
            {"\n"}Device placements: {Object.keys(spatial.placements).length}
            {placementProblems.length
              ? ` (${placementProblems.length} unresolved or hidden)`
              : ""}
            {defaultChanged ? "\nA newer default plan is available." : ""}
          </Body>
          {placementProblems.map((entry) => (
            <Body key={entry.key}>
              {entry.entity?.name ?? entry.storedKey}:{" "}
              {entry.issues
                .map((issue) => placementIssueLabel[issue])
                .join(" · ")}
            </Body>
          ))}
          {!!Object.keys(spatial.placements).length && (
            <Button
              title="Manage device placements"
              secondary
              onPress={() => router.push("/house-place")}
            />
          )}
          {!preferencesReady && (
            <Body>Preferences for this profile are not loaded yet.</Body>
          )}
          <Button
            title="Reset plan to default"
            secondary
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
        </Panel>
      )}
      {snapshot && (
        <Panel>
          <Label>Registry metadata</Label>
          {Object.entries(snapshot.metadata).map(([name, value]) => (
            <Body key={name}>
              {name}: {value.kind}
              {value.kind === "stale" ? ` (${value.reason})` : ""}
            </Body>
          ))}
        </Panel>
      )}
      {!!notices.length && (
        <Panel>
          <Label>Notices</Label>
          {notices.map((notice) => (
            <Body key={notice}>{notice}</Body>
          ))}
        </Panel>
      )}
      {!!missing.length && (
        <Panel>
          <Label>
            {status.kind === "ready"
              ? "Missing identities"
              : "Unverified identities"}
          </Label>
          {missing.map((key) => (
            <Body key={key}>{key}</Body>
          ))}
        </Panel>
      )}
      {__DEV__ && (
        <Button
          title="Open 3D scene lab (development)"
          secondary
          onPress={() => router.push("/scene-lab")}
        />
      )}
      <Body>
        Tokens and authenticated image URLs are excluded from this screen. Real
        device compatibility is verified separately from demo mode.
      </Body>
    </ScrollView>
  );
}
