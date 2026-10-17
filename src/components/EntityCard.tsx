import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { openReading } from "../services/deviceNavigation";
import { useCockpit } from "../core/store";
import { kindLabel, primaryValue } from "../core/presentation";
import { colors } from "./ui";
import { entityAppearance, Icon } from "./EntityIcon";
import { assessEntity, needsAttention } from "../core/policy";
export const EntityCard = memo(function EntityCard({
  entityId,
  now,
  layout = "row",
}: {
  entityId: string;
  now?: number;
  layout?: "row" | "tile" | "compact";
}) {
  const entity = useCockpit((state) => state.snapshot?.entities[entityId]);
  const config = useCockpit((state) => state.snapshot?.config);
  const ready = useCockpit((state) => state.status.kind === "ready");
  const profileId = useCockpit((state) => state.profileId);
  const favorite = useCockpit((state) =>
    entity ? state.preferences.favorites.includes(entity.key) : false,
  );
  if (!entity || !config) return null;
  const { icon, tint } = entityAppearance(entity, ready);
  const tile = layout === "tile";
  const value = primaryValue(entity, config, now);
  const assessment = assessEntity(entity, ready);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entity.name}, ${value}${ready ? "" : ", cached"}`}
      accessibilityHint={`Opens observed state and device details. ${assessment.explanation}`}
      onPress={() => profileId && openReading(profileId, entity.key)}
      style={({ pressed }) => [
        card.container,
        tile ? card.tile : card.row,
        layout === "compact" && card.compact,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={tile ? card.tileTop : undefined}>
        <View style={[card.icon, { backgroundColor: `${tint}16` }]}>
          <Icon name={icon} color={tint} size={22} />
        </View>
        {tile && favorite && (
          <Icon name="star" color={colors.accent} size={15} />
        )}
      </View>
      <View style={tile ? card.tileName : card.name}>
        <Text style={card.title}>
          {entity.name}
          {!tile && favorite ? "  ★" : ""}
        </Text>
        <Text style={card.subtitle}>
          {kindLabel[entity.domain]}
          {ready ? "" : " · Cached"}
        </Text>
        {ready && needsAttention(assessment.condition) && (
          <Text style={card.subtitle}>{assessment.explanation}</Text>
        )}
      </View>
      <Text style={[tile ? card.tileValue : card.rowValue, { color: tint }]}>
        {value}
      </Text>
    </Pressable>
  );
});

const card = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  compact: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 5,
    borderRadius: 0,
    marginBottom: 0,
  },
  tile: { flex: 1, minHeight: 178, gap: 12 },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, gap: 5 },
  tileName: { flex: 1, gap: 5 },
  title: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  tileValue: { fontSize: 20, lineHeight: 27, fontWeight: "500" },
  rowValue: { fontSize: 14, maxWidth: "38%", textAlign: "right" },
});
