import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DeviceSummary } from "../core/deviceSummaries";
import { presentDevice } from "../core/devicePresentation";
import type { HomeSnapshot } from "../core/types";
import { openDeviceSummary } from "../services/deviceNavigation";
import { entityAppearance, Icon } from "./EntityIcon";
import { colors } from "./ui";

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
  const display = presentDevice(summary, snapshot, ready, now);
  const { icon, tint } = entityAppearance(
    summary.issues[0] ?? display.primary ?? summary.members[0]!,
    ready,
  );
  const supporting = display.feeder
    ? display.rows.slice(1, 4)
    : display.rows
        .filter((row) => row.key !== display.primary?.key)
        .slice(0, 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open device: ${summary.name}`}
      accessibilityHint={`${display.headline}. ${display.qualifiers.join(". ")} Opens related readings.`}
      onPress={() =>
        summary.deviceId &&
        openDeviceSummary(summary.profileId, summary.deviceId)
      }
      style={({ pressed }) => [card.container, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={card.header}>
        <View style={[card.icon, { backgroundColor: `${tint}16` }]}>
          <Icon
            name={display.feeder ? "package" : icon}
            color={tint}
            size={23}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
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
      <Text style={[card.value, { color: tint }]}>{display.headline}</Text>
      {supporting.map((row) => (
        <View key={row.label} style={card.reading}>
          <Text style={[card.muted, { flex: 1 }]}>{row.label}</Text>
          <Text style={card.readingValue}>{row.value}</Text>
        </View>
      ))}
      {display.qualifiers.map((qualifier) => (
        <Text
          key={qualifier}
          style={[card.muted, { color: ready ? colors.warning : colors.muted }]}
        >
          {qualifier}
        </Text>
      ))}
    </Pressable>
  );
}
const card = StyleSheet.create({
  container: {
    padding: 18,
    gap: 9,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  value: { fontSize: 23, lineHeight: 31, fontWeight: "500" },
  reading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 6,
  },
  readingValue: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    flexShrink: 1,
  },
});
