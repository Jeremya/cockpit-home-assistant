import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCockpit } from "../core/store";
import { isVisible, roomId } from "../core/selectors";
import { session } from "../services/runtime";
import { gridColumns, gridGap, gridUnit } from "../components/CardGrid";
import { Icon } from "../components/EntityIcon";
import {
  Body,
  Button,
  Caption,
  Label,
  Panel,
  Screen,
  ScreenHeader,
  ThemedSwitch,
  colors,
  type Interaction,
} from "../components/ui";
import { minTouchTarget, radii, spacing, typography } from "../theme";
export function EntitiesScreen() {
  const { snapshot, preferences } = useCockpit();
  const [width, setWidth] = useState(0);
  const disabled =
    snapshot?.registryEntries.filter((entry) => entry.disabled_by) ?? [];
  const areas = snapshot ? Object.values(snapshot.areas) : [];
  return (
    <Screen tabBar>
      <ScreenHeader
        eyebrow="Your home, your view"
        title="Entities & rooms"
        description="Choose what appears on Home. Hiding an entity also removes it from Needs attention."
      />
      {snapshot && (
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={screen.grid}
        >
          {Object.values(snapshot.entities).map((entity) => {
            const room = roomId(entity, snapshot, preferences);
            const favorite = preferences.favorites.includes(entity.key);
            return (
              <Panel
                key={entity.key}
                style={[
                  screen.card,
                  {
                    width: gridColumns(width) === 1 ? "100%" : gridUnit(width),
                  },
                ]}
              >
                <View style={screen.head}>
                  <View style={screen.name}>
                    <Text style={screen.title}>{entity.name}</Text>
                    <Caption>{entity.entityId}</Caption>
                  </View>
                  <View style={screen.control}>
                    <ThemedSwitch
                      accessibilityLabel={`Show ${entity.name}`}
                      value={isVisible(entity, preferences)}
                      onValueChange={(shown) => {
                        session.updatePreferences((p) => ({
                          ...p,
                          visibility: {
                            ...p.visibility,
                            [entity.key]: shown ? "shown" : "hidden",
                          },
                        }));
                      }}
                    />
                  </View>
                </View>
                <View style={screen.rooms}>
                  <Body>
                    Room: {snapshot.areas[room ?? ""]?.name ?? "Unassigned"}
                  </Body>
                  <View style={screen.chips}>
                    {areas.map((area) => {
                      const selected = room === area.id;
                      return (
                        <Pressable
                          key={area.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() =>
                            session.updatePreferences((p) => ({
                              ...p,
                              roomOverrides: {
                                ...p.roomOverrides,
                                [entity.key]: area.id,
                              },
                            }))
                          }
                          style={({ pressed, hovered }: Interaction) => [
                            screen.chip,
                            hovered && screen.chipHovered,
                            selected && screen.chipSelected,
                            pressed && screen.chipPressed,
                          ]}
                        >
                          {selected && (
                            <Icon
                              name="check"
                              size={14}
                              color={colors.accent}
                            />
                          )}
                          <Text
                            style={[
                              screen.chipText,
                              selected && { color: colors.accent },
                            ]}
                          >
                            {area.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Button
                      title="Use Home Assistant room"
                      variant="quiet"
                      style={screen.reset}
                      onPress={() =>
                        session.updatePreferences((p) => {
                          const next = { ...p.roomOverrides };
                          delete next[entity.key];
                          return { ...p, roomOverrides: next };
                        })
                      }
                    />
                  </View>
                </View>
                <Button
                  title={favorite ? "★ Favorite" : "☆ Add favorite"}
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
              </Panel>
            );
          })}
        </View>
      )}
      {!!disabled.length && (
        <Panel>
          <Label tone="neutral">Disabled in Home Assistant</Label>
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
    </Screen>
  );
}
const screen = StyleSheet.create({
  // The device grid's columns: one on a phone, up to three when wide.
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: gridGap,
  },
  card: { minWidth: 0, justifyContent: "space-between" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.name, color: colors.text, fontWeight: "600" },
  control: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  rooms: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
  chipHovered: {
    backgroundColor: colors.hover,
    borderColor: colors.borderStrong,
  },
  // The check and the outline mark the current room, not colour alone.
  chipSelected: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accent,
  },
  chipPressed: { backgroundColor: colors.accentSurface },
  chipText: { ...typography.body, color: colors.text, fontWeight: "600" },
  reset: { paddingHorizontal: spacing.sm },
});
