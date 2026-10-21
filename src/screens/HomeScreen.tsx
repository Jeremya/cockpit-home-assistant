import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { router, useFocusEffect } from "expo-router";
import { useCockpit } from "../core/store";
import { attentionSummary } from "../core/selectors";
import { deviceSummaries, type DeviceSummary } from "../core/deviceSummaries";
import { session } from "../services/runtime";
import { Body, Button, Label, Panel, colors, styles } from "../components/ui";
import { Icon, entityAppearance } from "../components/EntityIcon";
import { EntityCard } from "../components/EntityCard";
import { DeviceSummaryCard } from "../components/DeviceSummaryCard";
import { SessionBanner } from "../components/SessionBanner";
import { HomePlanOverview } from "../components/HomePlanOverview";
import { housePlanFor, useHousePlan } from "../spatial/plans";
import type { HousePlan } from "../spatial/model";
import { areaLinkStatus, own } from "../spatial/selectors";
import { savedPlacements } from "../spatial/placements";
import { openPlacement } from "../spatial/navigation";
import { useHomeView } from "../spatial/HomeViewProvider";
import { primaryValue } from "../core/presentation";
import {
  selectHomeArea,
  selectHomeFloor,
  selectHomeRoom,
  selectedHomeRoom,
  selectedHomeArea,
  filterHomeSummaries,
  type HomeSelection,
  type HomeViewState,
} from "../spatial/homeSelection";
import { CardGrid } from "../components/CardGrid";
import { useResponsiveLayout } from "../components/layout";
import { minTouchTarget, radii, spacing, typography } from "../theme";

export function HomeScreen() {
  const profileId = useCockpit((state) => state.profileId);
  const { plan, identity } = useHousePlan();
  return (
    <HomeContent
      key={identity}
      profileId={profileId}
      plan={plan}
      identity={identity}
    />
  );
}
function HomeContent({
  profileId,
  plan,
  identity,
}: {
  profileId: string | null;
  plan: HousePlan;
  identity: string;
}) {
  const { desktop } = useResponsiveLayout();
  const { snapshot, status, preferences, mode, initialized } = useCockpit();
  const [refreshing, setRefreshing] = useState(false);
  const { state: viewState, setState: setHomeState } = useHomeView();
  const links = preferences.spatial.areaLinks;
  const current = useRef({
    mounted: true,
    focused: true,
    floorId: viewState.floorId,
  });
  useLayoutEffect(() => {
    current.current.floorId = viewState.floorId;
  });
  useLayoutEffect(() => {
    const scope = current.current;
    scope.mounted = true;
    return () => {
      scope.mounted = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      current.current.focused = true;
      return () => {
        current.current.focused = false;
      };
    }, []),
  );
  const currentScope = () =>
    current.current.mounted &&
    current.current.focused &&
    current.current.floorId === viewState.floorId &&
    housePlanFor(useCockpit.getState()).identity === identity;
  const changeView = (next: HomeViewState) => {
    if (currentScope()) setHomeState(next);
  };
  const choose = (selection: HomeSelection) => {
    changeView(
      selection.kind === "area"
        ? selectHomeArea(viewState, selection.areaId, plan, links)
        : { ...viewState, selection },
    );
  };
  const [expandedAttention, setExpandedAttention] = useState(false);
  const [expandedCoverage, setExpandedCoverage] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const ready = status.kind === "ready";
  const summaries = useMemo(
    () =>
      snapshot && profileId
        ? deviceSummaries(snapshot, preferences, profileId, ready)
        : [],
    [snapshot, preferences, profileId, ready],
  );
  const isAll = viewState.selection.kind === "all";
  const selectedArea = selectedHomeArea(viewState, links);
  const selectedPlanRoom = selectedHomeRoom(viewState, plan, links);
  const floor = plan.floors.find((item) => item.id === viewState.floorId)!;
  const room = floor.rooms.find((item) => item.id === selectedPlanRoom?.roomId);
  const selectionLabel =
    viewState.selection.kind === "planRoom"
      ? room?.name
      : viewState.selection.kind === "area"
        ? (snapshot && own(snapshot.areas, viewState.selection.areaId)?.name) ||
          "Selected area"
        : viewState.selection.kind === "unassigned"
          ? "Unassigned"
          : null;
  const areaIds = new Set([
    ...Object.keys(snapshot?.areas ?? {}),
    ...summaries.flatMap((group) =>
      group.roomIds.filter((id): id is string => id !== null),
    ),
  ]);
  if (viewState.selection.kind === "area")
    areaIds.add(viewState.selection.areaId);
  const rooms: { name: string; selection: HomeSelection }[] = [...areaIds]
    .map((id) => ({
      name:
        (snapshot && own(snapshot.areas, id)?.name) ||
        (id === selectedArea ? "Selected area" : "Unverified area"),
      selection: { kind: "area" as const, areaId: id },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (
    summaries.some((group) => group.roomIds.includes(null)) ||
    viewState.selection.kind === "unassigned"
  )
    rooms.push({ name: "Unassigned", selection: { kind: "unassigned" } });
  const filtered = filterHomeSummaries(summaries, viewState, links);
  const linkStatus = room ? areaLinkStatus(room.id, links, snapshot) : null;
  const needsLink =
    linkStatus?.kind === "unlinked" || linkStatus?.kind === "missing";
  const selectionNote =
    viewState.selection.kind === "planRoom"
      ? linkStatus?.kind === "unlinked"
        ? "Room not linked"
        : linkStatus?.kind === "missing"
          ? "Linked area was removed from Home Assistant"
          : linkStatus?.kind === "unverified" ||
              (linkStatus?.kind === "linked" && !linkStatus.verified)
            ? "Room link is cached, not verified"
            : (room?.name ?? null)
      : viewState.selection.kind === "area"
        ? (!room ? "No linked plan room" : room.name) +
          (snapshot?.metadata.areas.kind !== "fresh"
            ? " · Area registry not verified"
            : "")
        : null;
  const markers = savedPlacements(snapshot, preferences, plan, ready)
    .filter(
      (entry) => entry.placement.floorId === floor.id && !entry.issues.length,
    )
    .map((entry) => ({
      key: entry.key,
      name: entry.entity!.name,
      position: entry.placement.position,
      condition: entry.condition,
      ...entityAppearance(entry.entity!, ready),
      stateLabel: `${primaryValue(entry.entity!, snapshot!.config)}${ready ? "" : " · Cached"}`,
    }));
  const coverage = snapshot
    ? attentionSummary(snapshot, preferences, ready)
    : null;
  const attention = coverage?.items ?? [];
  const favorites = summaries
    .filter((group) => group.favoriteRank !== null)
    .sort((a, b) => a.favoriteRank! - b.favoriteRank!);
  const favoriteIds = new Set(favorites.map((group) => group.id));
  const displayed = filtered.filter(
    (group) => !isAll || !favoriteIds.has(group.id),
  );
  const buckets = new Map<string, { name: string; items: DeviceSummary[] }>();
  for (const group of displayed) {
    const key =
      (!isAll ? "selected" : null) ??
      (group.roomIds.length > 1
        ? JSON.stringify(["multiple"])
        : JSON.stringify(["room", group.roomIds[0]]));
    const bucket = buckets.get(key) ?? {
      name: selectionLabel ?? group.roomLabel,
      items: [],
    };
    bucket.items.push(group);
    buckets.set(key, bucket);
  }
  const count = coverage?.visibleCount ?? 0;
  const deviceCount = filtered.filter((group) => group.deviceId).length;
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
      <CardGrid>
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
      </CardGrid>
    );
  const attentionSection = snapshot && (
    <Panel style={[home.attention, desktop && home.attentionAside]}>
      <View style={styles.row}>
        <View style={home.heading}>
          <Icon
            name={ready && !attention.length ? "info" : "alert-circle"}
            size={18}
            color={ready && !attention.length ? colors.muted : colors.warning}
          />
          <Text accessibilityRole="header" style={home.attentionTitle}>
            Needs attention
          </Text>
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
              {expandedCoverage ? "Hide explanation" : "About these readings"}
            </Text>
          </Pressable>
          {expandedCoverage && (
            <Body>
              Other readings are not a device health check. Hidden entities are
              excluded. A fresh HA connection does not confirm a recent device
              poll.
            </Body>
          )}
        </>
      )}
    </Panel>
  );
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          home.content,
          desktop && home.desktopContent,
        ]}
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
          {desktop ? (
            <Button
              title={refreshing ? "Refreshing…" : "Refresh"}
              secondary
              disabled={refreshing || !snapshot}
              onPress={() => {
                void refresh();
              }}
            />
          ) : (
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
          )}
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
        {initialized && (
          <View
            testID="home-overview"
            style={[home.overview, desktop && home.wideOverview]}
          >
            {attentionSection}
            <View style={{ flex: desktop ? 1 : undefined, minWidth: 0 }}>
              <HomePlanOverview
                plan={plan}
                floorId={floor.id}
                selectedRoomId={room?.id ?? null}
                markers={markers}
                wide={desktop}
                note={selectionNote}
                needsLink={needsLink}
                onFloor={(id) =>
                  changeView(selectHomeFloor(viewState, id, plan))
                }
                onRoom={(id) =>
                  changeView(selectHomeRoom(viewState, floor.id, id, plan))
                }
                onMarker={(key) => {
                  if (currentScope())
                    openPlacement(profileId, identity, floor.id, key);
                }}
                onAll={() => choose({ kind: "all" })}
                onOpen={() => {
                  if (currentScope()) router.push("/house");
                }}
                onLink={() => {
                  if (currentScope()) router.push("/house-links");
                }}
              />
            </View>
          </View>
        )}
        {snapshot && (
          <>
            <View style={home.section}>
              <Text accessibilityRole="header" style={home.title}>
                Around your home
              </Text>
              <Text style={home.caption}>
                {deviceCount} {deviceCount === 1 ? "device" : "devices"} ·{" "}
                {isAll
                  ? count
                  : filtered.reduce(
                      (sum, group) => sum + group.members.length,
                      0,
                    )}{" "}
                visible readings
                {summaries.some((group) => !group.deviceId)
                  ? " · includes standalone readings"
                  : ""}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={home.filters}
                accessibilityRole="tablist"
                accessibilityLabel="Filter devices by area"
              >
                {[
                  {
                    name: "All rooms",
                    selection: { kind: "all" } as HomeSelection,
                  },
                  ...rooms,
                ].map((option) => {
                  const selected =
                    option.selection.kind === "all"
                      ? isAll
                      : option.selection.kind === "unassigned"
                        ? viewState.selection.kind === "unassigned"
                        : option.selection.kind === "area" &&
                          selectedArea === option.selection.areaId;
                  return (
                    <Pressable
                      key={JSON.stringify(option.selection)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      aria-selected={selected}
                      onPress={() => choose(option.selection)}
                      style={[home.chip, selected && home.selectedChip]}
                    >
                      <Text
                        style={[
                          home.chipText,
                          selected && { color: colors.text },
                        ]}
                      >
                        {option.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {isAll && !!favorites.length && (
              <View style={home.section}>
                <View style={home.heading}>
                  <Icon name="star" size={16} color={colors.accent} />
                  <Text accessibilityRole="header" style={home.sectionTitle}>
                    Favorites
                  </Text>
                </View>
                {renderGroups(favorites)}
              </View>
            )}
            {[...buckets].map(([key, bucket]) => (
              <View key={key} style={home.section}>
                <Text accessibilityRole="header" style={home.roomTitle}>
                  {bucket.name}
                </Text>
                {renderGroups(bucket.items)}
              </View>
            ))}
            {!isAll && !filtered.length && count > 0 && (
              <Body>
                {needsLink
                  ? "Room not linked — choose a Home Assistant area to see its devices."
                  : "No visible devices in this selection."}
              </Body>
            )}
            {!count && (
              <Body>
                No visible supported entities yet. Select entities in Settings,
                or finish configuring your integrations in Home Assistant.
              </Body>
            )}
          </>
        )}
        {snapshot && (
          <Text style={home.footer}>
            {mode === "demo"
              ? "Demo home · simulated observations"
              : "Observations from Home Assistant"}
            {"\n"}
            {desktop ? "Refresh for a fresh snapshot" : "Pull down to refresh"}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const home = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: spacing.xl,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  desktopContent: { maxWidth: 1440, padding: spacing.xxl },
  overview: { gap: spacing.xl },
  // Attention keeps its reading position before the house on wide screens.
  wideOverview: { flexDirection: "row", alignItems: "flex-start" },
  attention: { padding: spacing.lg, gap: spacing.md },
  attentionAside: { width: 360 },
  section: { gap: spacing.md },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  homeIcon: { width: 44, height: 44, borderRadius: radii.control },
  brandName: { ...typography.name, color: colors.text, fontWeight: "600" },
  connection: { ...typography.secondary, color: colors.muted },
  settings: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  attentionTitle: { ...typography.name, color: colors.text, fontWeight: "600" },
  count: {
    ...typography.secondary,
    color: colors.warning,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    backgroundColor: "#ffc08316",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.control,
  },
  expand: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  link: { ...typography.secondary, color: colors.accent },
  title: {
    ...typography.title,
    color: colors.text,
    fontWeight: "600",
    letterSpacing: -0.6,
  },
  sectionTitle: { ...typography.name, color: colors.text, fontWeight: "600" },
  caption: { ...typography.secondary, color: colors.muted },
  filters: { gap: spacing.sm, paddingRight: 2 },
  chip: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectedChip: {
    backgroundColor: colors.accentSurface,
    borderColor: "#638bb9",
  },
  chipText: { ...typography.secondary, color: colors.muted, fontWeight: "500" },
  roomTitle: {
    ...typography.secondary,
    color: colors.muted,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  footer: {
    ...typography.secondary,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
