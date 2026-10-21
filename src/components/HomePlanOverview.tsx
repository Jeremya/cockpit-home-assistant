import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { HousePlan } from "../spatial/model";
import { minTouchTarget, radii, spacing, typography } from "../theme";
import { FloorPlanView, type FloorPlanMarker } from "./FloorPlanView";
import { colors } from "./ui";

/** One shared plan/control tree. Compact Home can disclose the larger map. */
export function HomePlanOverview({
  plan,
  floorId,
  selectedRoomId,
  markers,
  wide,
  note,
  needsLink,
  onFloor,
  onRoom,
  onMarker,
  onAll,
  onOpen,
  onLink,
}: {
  plan: HousePlan;
  floorId: string;
  selectedRoomId: string | null;
  markers: FloorPlanMarker[];
  wide: boolean;
  note: string | null;
  needsLink: boolean;
  onFloor: (id: string) => void;
  onRoom: (id: string) => void;
  onMarker: (key: string) => void;
  onAll: () => void;
  onOpen: () => void;
  onLink: () => void;
}) {
  const [expanded, setExpanded] = useState(selectedRoomId !== null);
  const floor =
    plan.floors.find((item) => item.id === floorId) ?? plan.floors[0]!;
  const shown = wide || expanded;
  return (
    <View style={s.panel} testID="home-plan-overview">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${plan.name} floor plan`}
        onPress={onOpen}
        style={s.open}
      >
        <Text style={s.title}>{plan.name}</Text>
        <Text style={s.caption}>
          {plan.floors.length} floors · Explore full floor plan
        </Text>
      </Pressable>
      {!!note && <Text style={s.caption}>{note}</Text>}
      {needsLink && (
        <Pressable accessibilityRole="button" onPress={onLink} style={s.button}>
          <Text style={s.link}>Link this room</Text>
        </Pressable>
      )}
      {!wide && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          aria-expanded={expanded}
          onPress={() => setExpanded((value) => !value)}
          style={s.button}
        >
          <Text style={s.link}>
            {expanded ? "Hide rooms on plan" : "Show rooms on plan"}
          </Text>
        </Pressable>
      )}
      {shown && (
        <>
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Home floors"
            style={s.wrap}
          >
            {plan.floors.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: floor.id === item.id }}
                aria-selected={floor.id === item.id}
                onPress={() => onFloor(item.id)}
                style={[s.button, floor.id === item.id && s.selected]}
              >
                <Text style={s.text}>{item.name}</Text>
              </Pressable>
            ))}
          </View>
          <FloorPlanView
            floor={floor}
            selectedRoom={selectedRoomId}
            markers={markers}
            onSelectRoom={onRoom}
            onMarkerPress={onMarker}
            height={wide ? 260 : 200}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.roomRow}
            accessibilityRole="tablist"
            accessibilityLabel="Rooms on home plan"
          >
            {floor.rooms.map((room) => (
              <Pressable
                key={room.id}
                accessibilityRole="tab"
                accessibilityLabel={`Select ${room.name} on plan`}
                accessibilityState={{ selected: room.id === selectedRoomId }}
                aria-selected={room.id === selectedRoomId}
                onPress={() => onRoom(room.id)}
                style={[s.button, room.id === selectedRoomId && s.selected]}
              >
                <Text style={s.text}>{room.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {selectedRoomId && (
            <Pressable
              accessibilityRole="button"
              onPress={onAll}
              style={s.button}
            >
              <Text style={s.link}>Show all rooms</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSurface,
    minWidth: 0,
  },
  open: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    gap: spacing.xs,
  },
  title: { ...typography.name, color: colors.text, fontWeight: "600" },
  caption: { ...typography.secondary, color: colors.muted, flexShrink: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roomRow: { gap: spacing.sm },
  button: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: "center",
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  selected: { backgroundColor: colors.raised, borderColor: colors.accent },
  text: { ...typography.secondary, color: colors.text, flexShrink: 1 },
  link: { ...typography.secondary, color: colors.accent, flexShrink: 1 },
});
