import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { attentionSummary, groupByRoom } from "../core/selectors";
import { deviceSummaries, type DeviceSummary } from "../core/deviceSummaries";
import { session } from "../services/runtime";
import { Body, Button, Label, Panel, colors, styles } from "../components/ui";
import { Icon } from "../components/EntityIcon";
import { EntityCard } from "../components/EntityCard";
import { DeviceSummaryCard } from "../components/DeviceSummaryCard";
import { SessionBanner } from "../components/SessionBanner";
import { HousePlanCard } from "../components/HousePlanCard";

export function HomeScreen() {
  const profileId = useCockpit((state) => state.profileId);
  return <HomeContent key={profileId ?? "welcome"} profileId={profileId} />;
}
function HomeContent({ profileId }: { profileId: string | null }) {
  const { snapshot, status, preferences, mode, initialized } = useCockpit();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [expandedAttention, setExpandedAttention] = useState(false);
  const [expandedCoverage, setExpandedCoverage] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const ready = status.kind === "ready";
  const rooms = useMemo(
    () => (snapshot ? groupByRoom(snapshot, preferences) : []),
    [snapshot, preferences],
  );
  const summaries = useMemo(
    () =>
      snapshot && profileId
        ? deviceSummaries(snapshot, preferences, profileId, ready)
        : [],
    [snapshot, preferences, profileId, ready],
  );
  const selection = rooms.find((room) => room.id === selectedRoom);
  const coverage = snapshot
    ? attentionSummary(snapshot, preferences, ready)
    : null;
  const attention = coverage?.items ?? [];
  const favorites = summaries
    .filter((group) => group.favoriteRank !== null)
    .sort((a, b) => a.favoriteRank! - b.favoriteRank!);
  const favoriteIds = new Set(favorites.map((group) => group.id));
  const displayed = summaries.filter((group) =>
    selection
      ? group.roomIds.includes(
          selection.id === "unassigned" ? null : selection.id,
        )
      : !favoriteIds.has(group.id),
  );
  const buckets = new Map<string, { name: string; items: DeviceSummary[] }>();
  for (const group of displayed) {
    const key =
      selection?.id ??
      (group.roomIds.length > 1
        ? JSON.stringify(["multiple"])
        : JSON.stringify(["room", group.roomIds[0]]));
    const bucket = buckets.get(key) ?? {
      name: selection?.name ?? group.roomLabel,
      items: [],
    };
    bucket.items.push(group);
    buckets.set(key, bucket);
  }
  const count = coverage?.visibleCount ?? 0;
  const deviceCount = summaries.filter((group) => group.deviceId).length;
  const refresh = async () => {
    setRefreshing(true);
    try {
      await session.refresh();
    } catch {
      /* Banner owns errors. */
    } finally {
      setRefreshing(false);
    }
  };
  const renderGroups = (groups: DeviceSummary[]) =>
    snapshot && (
      <View style={{ gap: 12 }}>
        {groups.map((group) =>
          group.deviceId ? (
            <DeviceSummaryCard
              key={group.id}
              summary={group}
              snapshot={snapshot}
              ready={ready}
              now={now}
            />
          ) : (
            <EntityCard
              key={group.id}
              entityId={group.members[0]!.entityId}
              now={now}
            />
          ),
        )}
      </View>
    );
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[styles.content, home.content]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.row}>
          <View style={home.brand}>
            <Image
              source={require("../../assets/icon.png")}
              style={home.homeIcon}
              accessibilityIgnoresInvertColors
            />
            <View style={{ gap: 4, flexShrink: 1 }}>
              <Text style={home.brandName}>
                {mode === "demo" ? "Maurice · demo home" : "Maurice"}
              </Text>
              <Text style={home.connection}>
                {ready
                  ? mode === "demo"
                    ? "Simulated observations"
                    : "Synced with HA"
                  : snapshot
                    ? "Cached observations"
                    : "Your home, at a glance."}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              home.settings,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="sliders" color={colors.text} />
          </Pressable>
        </View>
        {!initialized ? (
          <Body>Opening your home…</Body>
        ) : !snapshot && status.kind === "idle" ? (
          <Panel>
            <Label>Welcome home</Label>
            <Text style={styles.sectionTitle}>
              One place for your household.
            </Text>
            <Body>
              Connect to Home Assistant to see your rooms and devices, or
              explore a simulated home.
            </Body>
            <Button
              title="Connect Home Assistant"
              onPress={() => router.push("/settings")}
            />
            <Button
              title="Explore demo home"
              secondary
              onPress={() => {
                void session.connect({ demo: true }).catch(() => undefined);
              }}
            />
          </Panel>
        ) : (
          <SessionBanner />
        )}
        {snapshot && (
          <>
            <View style={{ gap: 10 }}>
              <View style={styles.row}>
                <View style={home.heading}>
                  <Icon
                    name={ready && !attention.length ? "info" : "alert-circle"}
                    size={18}
                    color={
                      ready && !attention.length ? colors.muted : colors.warning
                    }
                  />
                  <Text style={home.attentionTitle}>Needs attention</Text>
                </View>
                {ready && !!attention.length && (
                  <Text style={home.count}>{attention.length}</Text>
                )}
              </View>
              {!ready ? (
                <Body>Status unknown while disconnected.</Body>
              ) : attention.length ? (
                <>
                  {(expandedAttention ? attention : attention.slice(0, 2)).map(
                    (entity) => (
                      <EntityCard
                        key={entity.key}
                        entityId={entity.entityId}
                        now={now}
                        layout="compact"
                      />
                    ),
                  )}
                  {attention.length > 2 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: expandedAttention }}
                      onPress={() => setExpandedAttention((value) => !value)}
                      style={home.expand}
                    >
                      <Text style={home.link}>
                        {expandedAttention
                          ? "Show less"
                          : `Show all ${attention.length} attention items`}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <Body>
                  {count
                    ? "No issue detected by the available attention rules."
                    : "No visible entities to assess yet."}
                </Body>
              )}
              {ready && count > 0 && coverage && (
                <>
                  <Text style={home.caption}>
                    Attention rules assessed {coverage.assessedCount} of{" "}
                    {coverage.visibleCount} visible entities.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: expandedCoverage }}
                    onPress={() => setExpandedCoverage((value) => !value)}
                    style={home.expand}
                  >
                    <Text style={home.link}>
                      {expandedCoverage
                        ? "Hide explanation"
                        : "About these readings"}
                    </Text>
                  </Pressable>
                  {expandedCoverage && (
                    <Body>
                      Other readings are not a device health check. Hidden
                      entities are excluded. A fresh HA connection does not
                      confirm a recent device poll.
                    </Body>
                  )}
                </>
              )}
            </View>
            <View style={{ gap: 14 }}>
              <Text style={home.sectionTitle}>Around your home</Text>
              <Text style={home.caption}>
                {deviceCount} {deviceCount === 1 ? "device" : "devices"} ·{" "}
                {count} visible readings
                {summaries.some((group) => !group.deviceId)
                  ? " · includes standalone readings"
                  : ""}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={home.filters}
                accessibilityRole="tablist"
              >
                {[{ id: null, name: "All rooms" }, ...rooms].map((room) => {
                  const selected = selection
                    ? selection.id === room.id
                    : room.id === null;
                  return (
                    <Pressable
                      key={room.id ?? "all"}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      aria-selected={selected}
                      onPress={() => setSelectedRoom(room.id)}
                      style={[home.chip, selected && home.selectedChip]}
                    >
                      <Text
                        style={[
                          home.chipText,
                          selected && { color: colors.text },
                        ]}
                      >
                        {room.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {!selection && !!favorites.length && (
              <View style={{ gap: 14 }}>
                <View style={home.heading}>
                  <Icon name="star" size={16} color={colors.accent} />
                  <Text style={home.sectionTitle}>Favorites</Text>
                </View>
                {renderGroups(favorites)}
              </View>
            )}
            {[...buckets].map(([key, bucket]) => (
              <View key={key} style={{ gap: 14 }}>
                <Text style={home.roomTitle}>{bucket.name}</Text>
                {renderGroups(bucket.items)}
              </View>
            ))}
            {!count && (
              <Body>
                No visible supported entities yet. Select entities in Settings,
                or finish configuring your integrations in Home Assistant.
              </Body>
            )}
          </>
        )}
        {initialized && <HousePlanCard />}
        {snapshot && (
          <Text style={home.footer}>
            {mode === "demo"
              ? "Demo home · simulated observations"
              : "Observations from Home Assistant"}
            {"\n"}Pull down to refresh
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const home = StyleSheet.create({
  content: {
    paddingTop: 16,
    gap: 26,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  homeIcon: { width: 44, height: 44, borderRadius: 15 },
  brandName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  connection: { color: colors.muted, fontSize: 12 },
  settings: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    flexDirection: "row",
    paddingVertical: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stat: { flex: 1, alignItems: "center", gap: 6 },
  statValue: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  statLabel: { color: colors.muted, fontSize: 12 },
  attention: { padding: 16, gap: 12 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexShrink: 1,
  },
  attentionTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  count: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: "#ffc08316",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  expand: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  link: { color: colors.accent, fontSize: 13 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "600" },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  filters: { gap: 8, paddingRight: 2 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 17,
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectedChip: {
    backgroundColor: colors.accentSurface,
    borderColor: "#638bb9",
  },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  roomTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  gridRow: { flexDirection: "row", gap: 10 },
  footer: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 4,
  },
});
