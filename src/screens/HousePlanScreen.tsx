import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useHousePlan } from "../spatial/plans";
import type { HousePlan, RoomKind } from "../spatial/model";
import { FloorPlanView } from "../components/FloorPlanView";
import { Icon, type IconName } from "../components/EntityIcon";
import { Body, Label, Panel, Title, colors, styles } from "../components/ui";

const roomIcons: Record<RoomKind, IconName> = {
  living: "coffee",
  bedroom: "moon",
  kitchen: "grid",
  bathroom: "droplet",
  storage: "box",
  circulation: "corner-up-right",
};
export function HousePlanScreen() {
  const { plan, defaultChanged, identity } = useHousePlan();
  return (
    <HousePlanContent
      key={identity}
      plan={plan}
      defaultChanged={defaultChanged}
    />
  );
}
function HousePlanContent({
  plan,
  defaultChanged,
}: {
  plan: HousePlan;
  defaultChanged: boolean;
}) {
  const [floorId, setFloorId] = useState(plan.floors[0]!.id);
  const [roomId, setRoomId] = useState<string | null>(null);
  const floor =
    plan.floors.find((item) => item.id === floorId) ?? plan.floors[0]!;
  const room = floor.rooms.find((item) => item.id === roomId);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, planStyles.content]}
    >
      <View style={{ gap: 8 }}>
        <Label>
          {plan.source === "sample" ? "Sample floor plan" : "Your floor plan"}
        </Label>
        <Title>{plan.name}</Title>
        <Body>
          {plan.floors.length} floors ·{" "}
          {plan.source === "reference_image"
            ? "Traced from your reference plan"
            : "Illustrative layout"}
        </Body>
      </View>
      {defaultChanged && (
        <Panel>
          <Body>
            A newer default plan is available. Your saved plan is kept; reset it
            from Diagnostics to use the new one.
          </Body>
        </Panel>
      )}
      <View style={planStyles.floorTabs} accessibilityRole="tablist">
        {plan.floors.map((item) => {
          const selected = item.id === floor.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.name}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => {
                setFloorId(item.id);
                setRoomId(null);
              }}
              style={[planStyles.floorTab, selected && planStyles.selectedTab]}
            >
              <Icon
                name="layers"
                size={16}
                color={selected ? colors.accent : colors.muted}
              />
              <Text
                style={[
                  planStyles.floorText,
                  selected && { color: colors.text },
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Panel style={{ padding: 10, gap: 10 }}>
        <View style={[styles.row, { paddingHorizontal: 10, paddingTop: 8 }]}>
          <Text style={planStyles.floorName}>{floor.name}</Text>
          <Text style={planStyles.caption}>{floor.rooms.length} spaces</Text>
        </View>
        <FloorPlanView
          floor={floor}
          selectedRoom={room?.id ?? null}
          onSelectRoom={setRoomId}
        />
        <Text style={planStyles.hint}>Tap a room to explore</Text>
      </Panel>
      {room && (
        <Panel style={{ borderColor: "#638bb9" }}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 8 }}>
              <Label>{floor.name}</Label>
              <Text accessibilityRole="header" style={planStyles.roomName}>
                {room.name}
              </Text>
            </View>
            <Icon name={roomIcons[room.kind]} color={colors.accent} size={25} />
          </View>
          {room.dimensions && (
            <Text style={planStyles.dimensions}>{room.dimensions}</Text>
          )}
          <Body>
            {room.dimensions
              ? "Dimensions shown on the supplied plan."
              : "No dimensions supplied for this space."}
          </Body>
          <Text style={planStyles.caption}>
            Device locations have not been set.
          </Text>
        </Panel>
      )}
      <View style={{ gap: 10 }}>
        <Text style={styles.sectionTitle}>Spaces on this floor</Text>
        {floor.rooms.map((item) => {
          const selected = item.id === room?.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Explore ${item.name}`}
              accessibilityState={{ selected }}
              aria-pressed={selected}
              onPress={() => setRoomId(item.id)}
              style={[planStyles.roomRow, selected && planStyles.selectedRow]}
            >
              <Icon
                name={roomIcons[item.kind]}
                color={selected ? colors.accent : colors.muted}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={planStyles.roomLabel}>{item.name}</Text>
                {item.dimensions && (
                  <Text style={planStyles.caption}>{item.dimensions}</Text>
                )}
              </View>
              <Icon
                name={selected ? "check" : "chevron-right"}
                size={16}
                color={selected ? colors.accent : colors.muted}
              />
            </Pressable>
          );
        })}
      </View>
      <Body>
        Layout and scale are approximate.{" "}
        {plan.source === "reference_image"
          ? "Room outlines follow your image; "
          : ""}
        heights and device positions are not measured.
      </Body>
    </ScrollView>
  );
}
const planStyles = StyleSheet.create({
  content: { maxWidth: 800, width: "100%", alignSelf: "center", gap: 22 },
  floorTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  floorTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  selectedTab: {
    backgroundColor: colors.accentSurface,
    borderColor: "#638bb9",
  },
  floorText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  floorName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  hint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingBottom: 8,
  },
  roomName: { color: colors.text, fontSize: 23, fontWeight: "600" },
  dimensions: { color: colors.accent, fontSize: 23, fontWeight: "400" },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectedRow: {
    backgroundColor: colors.accentSurface,
    borderColor: "#638bb9",
  },
  roomLabel: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
  },
});
