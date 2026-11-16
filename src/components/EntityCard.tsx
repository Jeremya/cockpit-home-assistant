import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  openReading,
  type ReadingDestination,
} from "../services/deviceNavigation";
import { useCockpit } from "../core/store";
import { kindLabel, primaryValue } from "../core/presentation";
import type { EntityRecord } from "../core/types";
import { colors, type Interaction } from "./ui";
import { entityAppearance, Icon } from "./EntityIcon";
import { assessEntity, getCondition, needsAttention } from "../core/policy";
import { focusOriginId } from "../navigation/detailNavigation";
import { layout, radii, spacing, typography } from "../theme";

/** A switch is lit only by a ready, qualified On observation; never by a request. */
export function readingTint(
  entity: EntityRecord,
  ready: boolean,
  tint: string,
  idle: string = colors.muted,
) {
  return entity.domain === "switch" &&
    !["unknown", "unavailable", "stale"].includes(getCondition(entity, ready))
    ? ready && entity.state === "on"
      ? tint
      : idle
    : tint;
}

export const EntityCard = memo(function EntityCard({
  entityId,
  now,
  layout: arrangement = "row",
  onOpenReading,
}: {
  entityId: string;
  now?: number;
  layout?: "row" | "tile" | "compact";
  /** Presents a revalidated reading elsewhere; the route remains the default. */
  onOpenReading?: (destination: ReadingDestination) => void;
}) {
  const entity = useCockpit((state) => state.snapshot?.entities[entityId]);
  const config = useCockpit((state) => state.snapshot?.config);
  const ready = useCockpit((state) => state.status.kind === "ready");
  const profileId = useCockpit((state) => state.profileId);
  const favorite = useCockpit((state) =>
    entity ? state.preferences.favorites.includes(entity.key) : false,
  );
  if (!entity || !config) return null;
  const appearance = entityAppearance(entity, ready);
  const { icon } = appearance;
  const tint = readingTint(entity, ready, appearance.tint);
  const tile = arrangement === "tile";
  const compact = arrangement === "compact";
  const value = primaryValue(entity, config, now);
  const assessment = assessEntity(entity, ready);
  return (
    <Pressable
      // One reading can appear in attention and in the grid: each is its own origin.
      nativeID={focusOriginId("reading", `${arrangement}:${entity.key}`)}
      accessibilityRole="button"
      accessibilityLabel={`${entity.name}, ${value}${ready ? "" : ", cached"}`}
      accessibilityHint={`Opens observed state and device details. ${assessment.explanation}`}
      onPress={() =>
        profileId && openReading(profileId, entity.key, onOpenReading)
      }
      style={({ pressed, hovered }: Interaction) => [
        card.container,
        tile ? card.tile : card.row,
        compact && card.compact,
        hovered && (compact ? card.compactHovered : card.hovered),
        pressed && (compact ? card.compactPressed : card.pressed),
      ]}
    >
      <View style={tile ? card.tileTop : undefined}>
        <View style={[card.icon, { backgroundColor: `${tint}1c` }]}>
          <Icon name={icon} color={tint} size={20} />
        </View>
        {tile && favorite && (
          <Icon name="star" color={colors.accent} size={15} />
        )}
      </View>
      <View style={card.name}>
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
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  hovered: { backgroundColor: colors.raised },
  pressed: { backgroundColor: colors.hover },
  row: { flexDirection: "row", alignItems: "center", minHeight: 72 },
  // Inside the attention card: a row of that surface, not a card of its own.
  compact: {
    flexGrow: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    minHeight: 56,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
  compactHovered: { backgroundColor: "rgba(255,255,255,0.04)" },
  compactPressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  tile: { minHeight: 168 },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.body, color: colors.text, fontWeight: "600" },
  subtitle: { ...typography.caption, color: colors.muted },
  tileValue: {
    ...typography.value,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  rowValue: {
    ...typography.body,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    maxWidth: "42%",
    textAlign: "right",
  },
});
