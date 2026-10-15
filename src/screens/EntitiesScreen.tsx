import { ScrollView, Switch, Text, View } from "react-native";
import { useCockpit } from "../core/store";
import { isVisible, roomId } from "../core/selectors";
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
export function EntitiesScreen() {
  const { snapshot, preferences } = useCockpit();
  const disabled =
    snapshot?.registryEntries.filter((entry) => entry.disabled_by) ?? [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Label>Your home, your view</Label>
      <Title>Entities & rooms</Title>
      <Body>
        Choose what appears on Home. Hiding an entity also removes it from Needs
        attention.
      </Body>
      {snapshot &&
        Object.values(snapshot.entities).map((entity) => (
          <Panel key={entity.key}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {entity.name}
                </Text>
                <Body>{entity.entityId}</Body>
              </View>
              <Switch
                accessibilityLabel={`Show ${entity.name}`}
                value={isVisible(entity, preferences)}
                onValueChange={(shown) =>
                  session.updatePreferences((p) => ({
                    ...p,
                    visibility: {
                      ...p.visibility,
                      [entity.key]: shown ? "shown" : "hidden",
                    },
                  }))
                }
              />
            </View>
            <Button
              title={
                preferences.favorites.includes(entity.key)
                  ? "★ Favorite"
                  : "☆ Add favorite"
              }
              secondary
              onPress={() =>
                session.updatePreferences((p) => ({
                  ...p,
                  favorites: p.favorites.includes(entity.key)
                    ? p.favorites.filter((key) => key !== entity.key)
                    : [...p.favorites, entity.key],
                }))
              }
            />
            <Body>
              Room:{" "}
              {snapshot.areas[roomId(entity, snapshot, preferences) ?? ""]
                ?.name ?? "Unassigned"}
            </Body>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {Object.values(snapshot.areas).map((area) => (
                <Button
                  key={area.id}
                  title={area.name}
                  secondary
                  onPress={() =>
                    session.updatePreferences((p) => ({
                      ...p,
                      roomOverrides: {
                        ...p.roomOverrides,
                        [entity.key]: area.id,
                      },
                    }))
                  }
                />
              ))}
            </View>
            <Button
              title="Use Home Assistant room"
              secondary
              onPress={() =>
                session.updatePreferences((p) => {
                  const next = { ...p.roomOverrides };
                  delete next[entity.key];
                  return { ...p, roomOverrides: next };
                })
              }
            />
          </Panel>
        ))}
      {!!disabled.length && (
        <Panel>
          <Label>Disabled in Home Assistant</Label>
          <Body>
            These entities have no running state. Enable them in Home Assistant
            before selecting them here.
          </Body>
          {disabled.map((entry) => (
            <Body key={entry.id}>{entry.name ?? entry.entity_id}</Body>
          ))}
        </Panel>
      )}
      {!snapshot && <Body>Connect to your home first.</Body>}
    </ScrollView>
  );
}
