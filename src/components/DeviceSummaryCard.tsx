import { Pressable, StyleSheet, Text, View } from "react-native";
import { primarySwitch } from "../commands/switchControl";
import type { DeviceSummary } from "../core/deviceSummaries";
import { presentDevice } from "../core/devicePresentation";
import { getCondition } from "../core/policy";
import { primaryValue } from "../core/presentation";
import { useCockpit } from "../core/store";
import type { HomeSnapshot } from "../core/types";
import { openDeviceSummary } from "../services/deviceNavigation";
import { focusOriginId } from "../navigation/detailNavigation";
import { CompactPowerAction } from "./controls/CompactPowerAction";
import { entityAppearance, Icon } from "./EntityIcon";
import { colors } from "./ui";
import { radii, spacing, typography } from "../theme";

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
  const tint =
    shown.domain === "switch" &&
    !["unknown", "unavailable", "stale"].includes(getCondition(shown, ready))
      ? ready && shown.state === "on"
        ? appearance.tint
        : colors.muted
      : appearance.tint;
  const supporting = display.feeder
    ? display.rows.slice(1, 4)
    : display.rows.filter((row) => row.key !== primary?.key).slice(0, 2);
  // Sibling targets: opening the detail and requesting power never nest.
  return (
    <View style={card.container}>
      <Pressable
        nativeID={focusOriginId("device", summary.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open device: ${summary.name}`}
        accessibilityHint={`${headline}. ${display.qualifiers.join(". ")} Opens related readings.`}
        onPress={() =>
          summary.deviceId &&
          openDeviceSummary(summary.profileId, summary.deviceId)
        }
        style={({ pressed }) => [card.open, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={card.header}>
          <View style={[card.icon, { backgroundColor: `${tint}16` }]}>
            <Icon
              name={display.feeder ? "package" : icon}
              color={tint}
              size={23}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
            <Text style={card.name}>{summary.name}</Text>
            <Text style={card.muted}>
              {summary.roomLabel} · {summary.members.length}{" "}
              {summary.members.length === 1 ? "reading" : "readings"}
            </Text>
          </View>
          {summary.favoriteRank !== null && (
            <Icon name="star" size={16} color={colors.accent} />
          )}
          <Icon name="chevron-right" size={18} />
        </View>
        {display.feeder && <Text style={card.muted}>Last reported feed</Text>}
        <Text style={[card.value, { color: tint }]}>{headline}</Text>
        {supporting.map((row) => (
          <View key={row.key ?? row.label} style={card.reading}>
            <Text style={[card.muted, { flex: 1 }]}>{row.label}</Text>
            <Text style={card.readingValue}>{row.value}</Text>
          </View>
        ))}
        {display.qualifiers.map((qualifier) => (
          <Text
            key={qualifier}
            style={[
              card.muted,
              { color: ready ? colors.warning : colors.muted },
            ]}
          >
            {qualifier}
          </Text>
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
  container: {
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  open: { padding: spacing.md, gap: spacing.sm, borderRadius: radii.card },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  icon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  name: {
    ...typography.name,
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
  },
  muted: { ...typography.secondary, color: colors.muted, fontSize: 12 },
  value: {
    ...typography.value,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  reading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: spacing.sm,
  },
  readingValue: {
    ...typography.secondary,
    color: colors.text,
    flexShrink: 1,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
