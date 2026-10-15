import { Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { useHousePlan } from "../spatial/plans";
import { Body, Button, Label, Panel, Title, styles } from "../components/ui";
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
      <Panel>
        <Body>
          Mode: {mode ?? "None"}
          {"\n"}Session: {status.kind}
          {"\n"}Home Assistant: {snapshot?.config.haVersion ?? "Not connected"}
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
            {"\n"}Device placements: {Object.keys(spatial.placements).length}
            {defaultChanged ? "\nA newer default plan is available." : ""}
          </Body>
          {!preferencesReady && (
            <Body>Preferences for this profile are not loaded yet.</Body>
          )}
          <Button
            title="Reset plan to default"
            secondary
            disabled={!preferencesReady}
            onPress={() =>
              Alert.alert(
                "Reset floor plan?",
                "Replaces this profile's floor plan with the current default and removes its room links and device placements. Favorites, visibility, room overrides and credentials are kept.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Reset",
                    style: "destructive",
                    onPress: () => {
                      if (!session.resetSpatial())
                        session.notice(
                          "The plan was not reset: preferences for this profile are not loaded.",
                        );
                    },
                  },
                ],
              )
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
          <Label>Missing identities</Label>
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
