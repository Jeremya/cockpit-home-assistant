import { ScrollView } from "react-native";
import { useCockpit } from "../core/store";
import { Body, Label, Panel, Title, styles } from "../components/ui";
export function DiagnosticsScreen() {
  const { snapshot, status, notices, preferences, mode } = useCockpit();
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
      <Body>
        Tokens and authenticated image URLs are excluded from this screen. Real
        device compatibility is verified separately from demo mode.
      </Body>
    </ScrollView>
  );
}
