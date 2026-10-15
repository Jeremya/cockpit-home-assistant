import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { groupByRoom, isVisible } from "../core/selectors";
import { getCondition } from "../core/policy";
import { session } from "../services/runtime";
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";
import { Icon } from "../components/EntityIcon";
import { EntityCard } from "../components/EntityCard";
import { SessionBanner } from "../components/SessionBanner";

function EntityGrid({
  ids,
  now,
  columns,
}: {
  ids: string[];
  now: number;
  columns: number;
}) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: Math.ceil(ids.length / columns) }, (_, row) => (
        <View key={row} style={home.gridRow}>
          {ids.slice(row * columns, (row + 1) * columns).map((id) => (
            <EntityCard key={id} entityId={id} now={now} layout="tile" />
          ))}
          {Array.from(
            { length: Math.max(0, (row + 1) * columns - ids.length) },
            (_, index) => (
              <View key={`space-${index}`} style={{ flex: 1 }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

export function HomeScreen() {
  const profileId = useCockpit((state) => state.profileId);
  return <HomeContent key={profileId ?? "welcome"} />;
}

function HomeContent() {
  const { snapshot, status, preferences, mode, initialized } = useCockpit();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [expandedAttention, setExpandedAttention] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { width, fontScale } = useWindowDimensions();
  const columns = width < 360 || fontScale > 1.3 ? 1 : width >= 720 ? 3 : 2;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const rooms = useMemo(
    () => (snapshot ? groupByRoom(snapshot, preferences) : []),
    [snapshot, preferences],
  );
  // A deleted/hidden room must not leave the home on an empty selection.
  const selection = rooms.find((room) => room.id === selectedRoom);
  const displayedRooms = selection ? [selection] : rooms;
  const ready = status.kind === "ready";
  const attention =
    snapshot && ready
      ? Object.values(snapshot.entities)
          .filter(
            (entity) =>
              isVisible(entity, preferences) &&
              ["attention", "alert", "unknown", "unavailable"].includes(
                getCondition(entity, true),
              ),
          )
          .sort(
            (a, b) =>
              Number(getCondition(a, true) !== "alert") -
              Number(getCondition(b, true) !== "alert"),
          )
      : [];
  const attentionKeys = new Set(attention.map((entity) => entity.key));
  const favorites = snapshot
    ? Object.values(snapshot.entities)
        .filter(
          (entity) =>
            isVisible(entity, preferences) &&
            preferences.favorites.includes(entity.key) &&
            !attentionKeys.has(entity.key),
        )
        .sort(
          (a, b) =>
            preferences.favorites.indexOf(a.key) -
            preferences.favorites.indexOf(b.key),
        )
    : [];
  const count = rooms.reduce((total, room) => total + room.entityIds.length, 0);
  const roomCount = rooms.filter((room) => room.id !== "unassigned").length;
  const refresh = async () => {
    setRefreshing(true);
    try {
      await session.refresh();
    } catch {
      /* Session banner owns the failure. */
    } finally {
      setRefreshing(false);
    }
  };
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
            <View style={home.homeIcon}>
              <Icon name="home" color={colors.accent} size={21} />
            </View>
            <View style={{ gap: 4, flexShrink: 1 }}>
              <Text style={home.brandName}>
                {mode === "demo" ? "Demo home" : "Home Cockpit"}
              </Text>
              <Text style={home.connection}>
                {ready
                  ? mode === "demo"
                    ? "Simulated observations"
                    : "Synced with HA"
                  : snapshot
                    ? "Cached observations"
                    : "Your household, together"}
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
        <View style={{ gap: 8 }}>
          <Title>Your home.</Title>
          <Body>
            {new Date(now).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Body>
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
              onPress={() => {
                void session.connect({ demo: true }).catch(() => undefined);
              }}
              secondary
            />
          </Panel>
        ) : (
          <SessionBanner />
        )}
        {snapshot && (
          <>
            <View style={home.summary}>
              {[
                { value: String(roomCount), label: "Rooms" },
                { value: String(count), label: "Entities" },
                {
                  value: ready ? String(attention.length) : "—",
                  label: "Attention",
                },
              ].map((stat) => (
                <View key={stat.label} style={home.stat}>
                  <Text style={home.statValue}>{stat.value}</Text>
                  <Text style={home.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
            <Panel style={home.attention}>
              <View style={styles.row}>
                <View style={home.heading}>
                  <Icon
                    name={
                      ready && !attention.length
                        ? "check-circle"
                        : "alert-circle"
                    }
                    color={
                      ready && !attention.length
                        ? colors.sensor
                        : colors.warning
                    }
                    size={18}
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
                      aria-expanded={expandedAttention}
                      onPress={() => setExpandedAttention(!expandedAttention)}
                      style={home.expand}
                    >
                      <Text style={home.link}>
                        {expandedAttention
                          ? "Show less"
                          : `Show all ${attention.length} attention items`}
                      </Text>
                      <Icon
                        name={expandedAttention ? "chevron-up" : "chevron-down"}
                        color={colors.accent}
                        size={16}
                      />
                    </Pressable>
                  )}
                </>
              ) : (
                <Body>No attention items among your visible entities.</Body>
              )}
            </Panel>
            <View style={{ gap: 16 }}>
              <View style={[styles.row, { flexWrap: "wrap" }]}>
                <Text style={home.sectionTitle}>Around your home</Text>
                <Text style={home.caption}>{count} visible entities</Text>
              </View>
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
                <EntityGrid
                  ids={favorites.map((entity) => entity.entityId)}
                  now={now}
                  columns={columns}
                />
              </View>
            )}
            {displayedRooms.map((room) => (
              <View key={room.id} style={{ gap: 14 }}>
                <View style={styles.row}>
                  <Text style={home.roomTitle}>{room.name}</Text>
                  <Text style={home.caption}>
                    {room.entityIds.length} entities
                  </Text>
                </View>
                {room.id === "unassigned" && (
                  <Text style={home.caption}>
                    Assign rooms in Settings → Entities and rooms.
                  </Text>
                )}
                <EntityGrid ids={room.entityIds} now={now} columns={columns} />
              </View>
            ))}
            {!rooms.length && (
              <Panel>
                <Body>
                  No visible supported entities yet. Select entities in
                  Settings, or finish configuring your integrations in Home
                  Assistant.
                </Body>
              </Panel>
            )}
            <Text style={home.footer}>
              {mode === "demo"
                ? "Demo home · simulated observations"
                : "Observations from Home Assistant"}
              {"\n"}Pull down to refresh
            </Text>
          </>
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
  homeIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.accentSurface,
    alignItems: "center",
    justifyContent: "center",
  },
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
    minHeight: 44,
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
    minHeight: 44,
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
