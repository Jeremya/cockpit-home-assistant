import { Pressable, StyleSheet, Text, View } from "react-native";
import { primarySwitch } from "../commands/switchControl";
import type { DeviceSummary } from "../core/deviceSummaries";
import { presentDevice } from "../core/devicePresentation";
import { primaryValue } from "../core/presentation";
import { useCockpit } from "../core/store";
import type { HomeSnapshot } from "../core/types";
import { openDeviceSummary } from "../services/deviceNavigation";
import { focusOriginId } from "../navigation/detailNavigation";
import { CompactPowerAction } from "./controls/CompactPowerAction";
import { readingTint } from "./EntityCard";
import { entityAppearance, Icon } from "./EntityIcon";
import { colors, type Interaction } from "./ui";
import { layout, radii, spacing, typography } from "../theme";

export function DeviceSummaryCard({
  summary,
  snapshot,
  ready,
  now,
}: {
  summary: DeviceSummary;
  snapshot: HomeSnapshot;
  ready: boolean;
  now: number;
}) {
  const preferences = useCockpit((state) => state.preferences);
  const mode = useCockpit((state) => state.mode);
  const display = presentDevice(summary, snapshot, ready, now);
  const power = primarySwitch(summary.deviceId, snapshot, preferences, mode);
  // Keep the observation driving the action visible even when sorted sensor
  // readings would otherwise displace it from the bounded summary.
  const primary = power ?? display.primary;
  const headline = power
    ? primaryValue(power, snapshot.config, now)
    : display.headline;
  const shown = summary.issues[0] ?? primary ?? summary.members[0]!;
  const appearance = entityAppearance(shown, ready);
  const { icon } = appearance;
  // Only a ready, qualified On observation gets the active color; never a request.
  const tint = readingTint(shown, ready, appearance.tint);
  // A reading count is not an observation: the subtitle already states it.
  const leads = !!primary || display.feeder;
  const supporting = display.feeder
    ? display.rows.slice(1, 4)
    : leads
      ? display.rows.filter((row) => row.key !== primary?.key).slice(0, 2)
      : display.rows.slice(0, 3);
  // Sibling targets: opening the detail and requesting power never nest.
  return (
    <View style={card.container}>
      <Pressable
        nativeID={focusOriginId("device", summary.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open device: ${summary.name}`}
        accessibilityHint={`${summary.roomLabel}. ${headline}. ${display.qualifiers.join(". ")} Opens related readings.`}
        onPress={() =>
          summary.deviceId &&
          openDeviceSummary(summary.profileId, summary.deviceId)
        }
        style={({ pressed, hovered }: Interaction) => [
          card.open,
          hovered && card.hovered,
          pressed && card.pressed,
        ]}
      >
        <View style={card.header}>
          <View style={[card.icon, { backgroundColor: `${tint}1c` }]}>
            <Icon
              name={display.feeder ? "package" : icon}
              color={tint}
              size={20}
            />
          </View>
          <View style={card.heading}>
            <Text style={card.name}>{summary.name}</Text>
            <Text style={card.meta}>
              {summary.roomLabel} · {summary.members.length}{" "}
              {summary.members.length === 1 ? "reading" : "readings"}
            </Text>
          </View>
          {summary.favoriteRank !== null && (
            <Icon name="star" size={16} color={colors.accent} />
          )}
          <Icon name="chevron-right" size={18} />
        </View>
        {leads && (
          <View style={card.lead}>
            {display.feeder && (
              <Text style={card.meta}>Last reported feed</Text>
            )}
            <Text style={[card.value, { color: tint }]}>{headline}</Text>
          </View>
        )}
        {!!supporting.length && (
          <View style={card.readings}>
            {supporting.map((row) => (
              <View key={row.key ?? row.label} style={card.reading}>
                <Text style={card.readingLabel}>{row.label}</Text>
                <Text style={card.readingValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}
        {display.qualifiers.map((qualifier) => (
          <View key={qualifier} style={card.qualifier}>
            <Icon
              name={ready ? "alert-circle" : "clock"}
              size={14}
              color={ready ? colors.warning : colors.muted}
            />
            <Text
              style={[
                card.meta,
                card.qualifierText,
                { color: ready ? colors.warning : colors.muted },
              ]}
            >
              {qualifier}
            </Text>
          </View>
        ))}
      </Pressable>
      {power && (
        <CompactPowerAction
          key={`${summary.profileId}:${power.key}`}
          entity={power}
          snapshot={snapshot}
          profileId={summary.profileId}
          mode={mode}
          ready={ready}
        />
      )}
    </View>
  );
}
const card = StyleSheet.create({
  // Fills its grid cell, so the cards of one row end on the same line.
  container: {
    flexGrow: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  open: {
    flexGrow: 1,
    padding: layout.cardPadding,
    gap: spacing.md,
    borderRadius: radii.card,
  },
  hovered: { backgroundColor: colors.raised },
  pressed: { backgroundColor: colors.hover },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.control,
  },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.name, color: colors.text, fontWeight: "600" },
  meta: { ...typography.caption, color: colors.muted },
  lead: { gap: 2 },
  value: {
    ...typography.value,
    fontWeight: "600",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  readings: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: spacing.md,
  },
  readingLabel: { ...typography.secondary, color: colors.muted, flex: 1 },
  readingValue: {
    ...typography.secondary,
    color: colors.text,
    fontWeight: "500",
    flexShrink: 1,
    fontVariant: ["tabular-nums"],
  },
  qualifier: { flexDirection: "row", alignItems: "center", gap: 6 },
  qualifierText: { flex: 1 },
});
