import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { getCondition } from "../core/policy";
import { kindLabel, primaryValue } from "../core/presentation";
import { colors } from "./ui";
const icons: Record<string, string> = {
  lock: "⌂",
  climate: "°",
  fan: "≋",
  camera: "◉",
  sensor: "◈",
  binary_sensor: "◇",
  switch: "⏻",
  event: "↗",
};
export const EntityCard = memo(function EntityCard({
  entityId,
  now,
}: {
  entityId: string;
  now?: number;
}) {
  const entity = useCockpit((state) => state.snapshot?.entities[entityId]);
  const config = useCockpit((state) => state.snapshot?.config);
  const ready = useCockpit((state) => state.status.kind === "ready");
  const favorite = useCockpit((state) =>
    entity ? state.preferences.favorites.includes(entity.key) : false,
  );
  if (!entity || !config) return null;
  const condition = getCondition(entity, ready);
  const tint = ["alert", "unknown", "unavailable"].includes(condition)
    ? colors.danger
    : condition === "attention"
      ? colors.warning
      : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entity.name}, ${primaryValue(entity, config, now)}${ready ? "" : ", cached"}`}
      onPress={() =>
        router.push({ pathname: "/device/[key]", params: { key: entity.key } })
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 9,
        opacity: ready ? (pressed ? 0.7 : 1) : 0.6,
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          backgroundColor: colors.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: tint, fontSize: 25 }}>
          {icons[entity.domain] ?? "◈"}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
          {entity.name}
          {favorite ? "  ★" : ""}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {kindLabel[entity.domain]}
          {ready ? "" : " · Cached"}
        </Text>
      </View>
      <Text
        style={{
          color: tint,
          fontSize: 14,
          maxWidth: "40%",
          textAlign: "right",
        }}
      >
        {primaryValue(entity, config, now)}
      </Text>
    </Pressable>
  );
});
