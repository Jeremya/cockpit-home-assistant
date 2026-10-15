import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
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
import { EntityCard } from "../components/EntityCard";
import { SessionBanner } from "../components/SessionBanner";
export function HomeScreen() {
  const { snapshot, status, preferences, mode, initialized } = useCockpit();
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const rooms = useMemo(
    () => (snapshot ? groupByRoom(snapshot, preferences) : []),
    [snapshot, preferences],
  );
  const attention =
    snapshot && status.kind === "ready"
      ? Object.values(snapshot.entities).filter(
          (entity) =>
            isVisible(entity, preferences) &&
            ["attention", "alert", "unknown", "unavailable"].includes(
              getCondition(entity, true),
            ),
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
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
        <Label>
          {mode === "demo" ? "Demo home · simulated" : "Home Cockpit"}
        </Label>
        <Text
          accessibilityRole="button"
          onPress={() => router.push("/settings")}
          style={{ color: colors.accent, padding: 10 }}
        >
          Settings ↗
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        <Title>Your home,{"\n"}at a glance.</Title>
        <Body>
          {new Date().toLocaleDateString(undefined, {
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
          <Text style={styles.sectionTitle}>One place for your household.</Text>
          <Body>
            Connect to Home Assistant to see your rooms and devices, or explore
            a simulated home.
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
          <View style={styles.row}>
            <Body>
              {
                Object.values(snapshot.entities).filter((entity) =>
                  isVisible(entity, preferences),
                ).length
              }{" "}
              visible entities · {rooms.length} rooms
            </Body>
            <Text
              style={{
                color: status.kind === "ready" ? colors.accent : colors.warning,
                fontSize: 12,
              }}
            >
              {status.kind === "ready"
                ? mode === "demo"
                  ? "● Simulated"
                  : "● Synced with HA"
                : "○ Cached"}
            </Text>
          </View>
          <Panel>
            <Label>Needs attention</Label>
            {status.kind !== "ready" ? (
              <Body>Status unknown while disconnected.</Body>
            ) : attention.length ? (
              attention.map((entity) => (
                <EntityCard
                  key={entity.key}
                  entityId={entity.entityId}
                  now={now}
                />
              ))
            ) : (
              <Body>No attention items among your visible entities.</Body>
            )}
          </Panel>
          {!!favorites.length && (
            <View>
              <Text style={styles.sectionTitle}>Favorites</Text>
              {favorites.map((entity) => (
                <EntityCard
                  key={entity.key}
                  entityId={entity.entityId}
                  now={now}
                />
              ))}
            </View>
          )}
          {rooms.map((room) => (
            <View key={room.id}>
              <View style={[styles.row, { marginBottom: 10 }]}>
                <Text style={styles.sectionTitle}>{room.name}</Text>
                <Body>{room.entityIds.length}</Body>
              </View>
              {room.entityIds.map((id) => (
                <EntityCard key={id} entityId={id} now={now} />
              ))}
            </View>
          ))}
          {!rooms.length && (
            <Panel>
              <Body>
                No visible supported entities yet. Select entities in Settings,
                or finish configuring your integrations in Home Assistant.
              </Body>
            </Panel>
          )}
        </>
      )}
    </ScrollView>
  );
}
