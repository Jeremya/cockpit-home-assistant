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
import {
  Body,
  Button,
  Heading,
  Label,
  Panel,
  colors,
  styles,
  type Interaction,
} from "../components/ui";
import {
  Icon,
  entityAppearance,
  type IconName,
} from "../components/EntityIcon";
import { EntityCard } from "../components/EntityCard";
import { DeviceSummaryCard } from "../components/DeviceSummaryCard";
import { SessionBanner } from "../components/SessionBanner";
import { HomePlanOverview } from "../components/HomePlanOverview";
import { HomePulse, type HomePulseRoom } from "../components/home/HomePulse";
import { HomeArchitecture } from "../components/home/HomeArchitecture";
import { FadeIn } from "../components/home/FadeIn";
import { housePlanFor, useHousePlan } from "../spatial/plans";
import type { HousePlan } from "../spatial/model";
import { areaLinkStatus, own } from "../spatial/selectors";
import { placementSceneMarkers } from "../spatial/scene";
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
import {
  CardGrid,
  gridColumns,
  gridGap,
  gridUnit,
} from "../components/CardGrid";
import { useResponsiveLayout } from "../components/layout";
import { layout, minTouchTarget, radii, spacing, typography } from "../theme";

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
  // Beside the detail panel Home gets a column, not the window: put attention
  // and the house side by side only where the 1024 px desktop already did.
  const [overviewWidth, setOverviewWidth] = useState<number | null>(null);
  const sideBySide = desktop && (overviewWidth ?? Infinity) >= 720;
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
  const [category, setCategory] = useState<
    "all" | "lights" | "climate" | "security"
  >("all");
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
  const placements = savedPlacements(snapshot, preferences, plan, ready);
  const markers = placements
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
  const categoryDomains: Record<
    "lights" | "climate" | "security",
    Set<string>
  > = {
    lights: new Set(["switch", "light"]),
    climate: new Set(["climate", "fan"]),
    security: new Set(["lock", "camera"]),
  };
  const inCategory = (group: DeviceSummary) =>
    category === "all" ||
    group.members.some((member) =>
      categoryDomains[category].has(member.domain),
    );
  const categoryFiltered = filtered.filter(inCategory);
  const categoryFavorites = favorites.filter(inCategory);
  const favoriteIds = new Set(categoryFavorites.map((group) => group.id));
  const displayed = categoryFiltered.filter(
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
  // A wide window shows every room as one lattice in the same room order: each
  // card already names its room, and no row is left a column short. It follows
  // the window, not the measured column, so opening the panel moves no card.
  const lattice = desktop && isAll;
  const sections: {
    key: string;
    name: string | null;
    items: DeviceSummary[];
  }[] = lattice
    ? displayed.length
      ? [
          {
            key: "all",
            name: categoryFavorites.length ? "Other devices" : null,
            items: [...buckets.values()].flatMap((bucket) => bucket.items),
          },
        ]
      : []
    : [...buckets].map(([key, bucket]) => ({ key, ...bucket }));
  const count = coverage?.visibleCount ?? 0;
  const groupForEntity = new Map(
    summaries.flatMap((group) =>
      group.members.map((member) => [member.entityId, group] as const),
    ),
  );
  const matchesRoom = (group: DeviceSummary, selection: HomeSelection) =>
    selection.kind === "area"
      ? group.roomIds.includes(selection.areaId)
      : selection.kind === "unassigned"
        ? group.roomIds.includes(null)
        : false;
  const roomStats: HomePulseRoom[] = rooms.map((option) => {
    const groups = summaries.filter((group) =>
      matchesRoom(group, option.selection),
    );
    const alerts = attention.filter((entity) => {
      const group = groupForEntity.get(entity.entityId);
      return group ? matchesRoom(group, option.selection) : false;
    }).length;
    return {
      id: JSON.stringify(option.selection),
      name: option.name,
      devices: groups.filter((group) => group.deviceId).length,
      alerts,
    };
  });
  const totalDevices = summaries.filter((group) => group.deviceId).length;
  const statusLine = !ready
    ? snapshot
      ? "Cached observations"
      : "Connect your home"
    : attention.length
      ? `${attention.length} ${attention.length === 1 ? "item needs" : "items need"} attention`
      : "Everything is quiet";
  const lightMembers = summaries
    .flatMap((group) => group.members)
    .filter(
      (member) => member.domain === "switch" || member.domain === "light",
    );
  const lightsOn = lightMembers.filter(
    (member) => member.state === "on",
  ).length;
  const securityGroups = new Set(
    summaries
      .filter((group) =>
        group.members.some((member) =>
          categoryDomains.security.has(member.domain),
        ),
      )
      .map((group) => group.id),
  );
  const securityAlerts = attention.filter((entity) => {
    const group = groupForEntity.get(entity.entityId);
    return !!group && securityGroups.has(group.id);
  }).length;
  const climateMember = summaries
    .flatMap((group) => group.members)
    .find((member) => member.domain === "climate");
  const climateDetail =
    ready && climateMember && snapshot
      ? primaryValue(climateMember, snapshot.config, now)
      : null;
  const quickActions: {
    id: "lights" | "climate" | "security" | "rooms";
    label: string;
    icon: IconName;
    count: number;
    detail: string;
  }[] = [
    {
      id: "lights",
      label: "Lights",
      icon: "toggle-right",
      count: summaries.filter((group) =>
        group.members.some((member) =>
          categoryDomains.lights.has(member.domain),
        ),
      ).length,
      detail: ready ? (lightsOn ? `${lightsOn} on` : "All off") : "—",
    },
    {
      id: "climate",
      label: "Climate",
      icon: "thermometer",
      count: summaries.filter((group) =>
        group.members.some((member) =>
          categoryDomains.climate.has(member.domain),
        ),
      ).length,
      detail: climateDetail ?? "—",
    },
    {
      id: "security",
      label: "Security",
      icon: "shield",
      count: summaries.filter((group) =>
        group.members.some((member) =>
          categoryDomains.security.has(member.domain),
        ),
      ).length,
      detail: ready
        ? securityAlerts
          ? `${securityAlerts} alert${securityAlerts === 1 ? "" : "s"}`
          : "Clear"
        : "—",
    },
    {
      id: "rooms",
      label: "Rooms",
      icon: "grid",
      count: rooms.length,
      detail: `${rooms.length}`,
    },
  ];
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
  // The house and the first card column share one grid: the lead column is one
  // unit of the device grid, the house the rest.
  const leadWidth =
    overviewWidth === null
      ? undefined
      : gridColumns(overviewWidth) >= 3
        ? gridUnit(overviewWidth)
        : (overviewWidth - gridGap) / 2;
  // Before any home is connected: one invitation, and nothing to assess.
  const welcoming = !snapshot && status.kind === "idle";
  const welcome = (
    <Panel style={home.welcome}>
      <View style={home.welcomeCopy}>
        <Label>Welcome home</Label>
        <Heading>One place for your household.</Heading>
        <Body>
          Connect to Home Assistant to see your rooms and devices, or explore a
          simulated home.
        </Body>
      </View>
      <View style={home.welcomeActions}>
        <Button
          title="Connect Home Assistant"
          style={home.welcomeAction}
          onPress={() => router.push("/settings")}
        />
        <Button
          title="Explore demo home"
          secondary
          style={home.welcomeAction}
          onPress={() => {
            void session.connect({ demo: true }).catch(() => undefined);
          }}
        />
      </View>
    </Panel>
  );
  // Four filters across need about 80 px each to keep a label on one line.
  const cramped = !sideBySide && (overviewWidth ?? Infinity) < 330;
  const flagged = !ready || !!attention.length;
  const attentionSection = snapshot && (
    <Panel
      style={[
        home.attention,
        flagged && home.attentionFlagged,
        sideBySide && home.attentionAside,
      ]}
    >
      <View style={styles.row}>
        <View style={home.heading}>
          <Icon
            name={flagged ? "alert-circle" : "info"}
            size={18}
            color={flagged ? colors.warning : colors.muted}
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
        <View>
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
              style={({ pressed, hovered }: Interaction) => [
                home.expand,
                (hovered || pressed) && home.expandActive,
              ]}
            >
              <Text style={home.link}>
                {expandedAttention
                  ? "Show less"
                  : `Show all ${attention.length} attention items`}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Body>
          {count
            ? "No issue detected by the available attention rules."
            : "No visible entities to assess yet."}
        </Body>
      )}
      {ready && count > 0 && coverage && (
        <Text style={home.coverage}>
          Attention rules assessed {coverage.assessedCount} of{" "}
          {coverage.visibleCount} visible entities.
        </Text>
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
          !desktop && home.mobileContent,
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
            <View style={{ gap: 2, flexShrink: 1 }}>
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
              icon="refresh-cw"
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
              style={({ pressed, hovered }: Interaction) => [
                home.settings,
                hovered && home.settingsHovered,
                pressed && home.settingsPressed,
              ]}
            >
              <Icon name="sliders" color={colors.text} />
            </Pressable>
          )}
        </View>
        {!initialized ? (
          <Body>Opening your home…</Body>
        ) : welcoming ? (
          !sideBySide && welcome
        ) : (
          <SessionBanner />
        )}
        {initialized && (
          <>
            <View style={home.titleRow}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={home.homeTitle}>{plan.name}</Text>
                <Text style={home.statusLine}>{statusLine}</Text>
              </View>
              {ready && !!attention.length && (
                <View style={home.alertPill}>
                  <View style={home.alertDot} />
                  <Text style={home.alertPillText}>
                    {attention.length}{" "}
                    {attention.length === 1 ? "ALERT" : "ALERTS"}
                  </Text>
                </View>
              )}
            </View>
            {!desktop && (
              <FadeIn>
                <HomeArchitecture
                  floor={floor}
                  selectedRoomId={room?.id ?? null}
                  markers={markers}
                  onOpen={() => {
                    if (currentScope()) router.push("/house");
                  }}
                />
              </FadeIn>
            )}
          </>
        )}
        {initialized && (
          <View
            testID="home-overview"
            onLayout={(event) =>
              setOverviewWidth(event.nativeEvent.layout.width)
            }
            style={[home.overview, sideBySide && home.wideOverview]}
          >
            {/* Pulse, filters and attention read before the house in both layouts. */}
            <View
              style={[
                home.lead,
                sideBySide &&
                  (leadWidth === undefined
                    ? home.leadFlexible
                    : { width: leadWidth }),
              ]}
            >
              {welcoming && sideBySide && welcome}
              <FadeIn delay={60}>
                <View style={home.cockpitTop}>
                  <HomePulse
                    rooms={roomStats}
                    devices={totalDevices}
                    alerts={ready ? attention.length : 0}
                    ready={ready}
                    cached={!!snapshot}
                  />
                  <View style={[home.quickRow, cramped && home.quickRowWrap]}>
                    {quickActions.map((action) => {
                      const selected = category === action.id;
                      return (
                        <Pressable
                          key={action.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Filter by ${action.label.toLowerCase()}, ${action.count}`}
                          accessibilityState={{ selected }}
                          onPress={() => {
                            if (action.id === "rooms") {
                              setCategory("all");
                              choose({ kind: "all" });
                              return;
                            }
                            const next = action.id;
                            setCategory((current) =>
                              current === next ? "all" : next,
                            );
                          }}
                          style={({ pressed, hovered }: Interaction) => [
                            home.quickTile,
                            cramped && home.quickTileHalf,
                            hovered && home.tileHovered,
                            selected && home.quickTileSelected,
                            pressed && { transform: [{ scale: 0.985 }] },
                          ]}
                        >
                          <View
                            style={[
                              home.quickIcon,
                              selected && {
                                backgroundColor: colors.accentTint,
                              },
                            ]}
                          >
                            <Icon
                              name={action.icon}
                              size={18}
                              color={selected ? colors.accent : colors.muted}
                            />
                          </View>
                          <View>
                            <Text
                              style={[
                                home.quickLabel,
                                selected && { color: colors.accent },
                              ]}
                            >
                              {action.label}
                            </Text>
                            <Text style={home.quickCount}>{action.detail}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </FadeIn>
              {attentionSection}
            </View>
            <View style={sideBySide ? home.houseWide : home.house}>
              <HomePlanOverview
                plan={plan}
                identity={identity}
                sceneMarkers={placementSceneMarkers(placements, floor.id)}
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
              <View style={home.sectionHead}>
                <View
                  nativeID="home-list-title"
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel="Around your home"
                  tabIndex={-1}
                >
                  <Text style={home.title}>Around your home</Text>
                </View>
                <Text style={home.caption}>
                  {category === "all"
                    ? `${displayed.length} ${displayed.length === 1 ? "device" : "devices"}`
                    : `${displayed.length} ${category} ${displayed.length === 1 ? "device" : "devices"}`}
                </Text>
              </View>
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
                  const stat =
                    option.selection.kind === "all"
                      ? {
                          devices: totalDevices,
                          alerts: attention.length,
                        }
                      : (roomStats.find(
                          (item) =>
                            item.id === JSON.stringify(option.selection),
                        ) ?? { devices: 0, alerts: 0 });
                  return (
                    <Pressable
                      key={JSON.stringify(option.selection)}
                      accessibilityRole="tab"
                      accessibilityLabel={option.name}
                      accessibilityState={{ selected }}
                      aria-selected={selected}
                      onPress={() => choose(option.selection)}
                      style={({ pressed, hovered }: Interaction) => [
                        home.roomCard,
                        hovered && home.tileHovered,
                        selected && home.roomCardSelected,
                        pressed && { transform: [{ scale: 0.985 }] },
                      ]}
                    >
                      <View style={home.roomCardTop}>
                        <Text
                          numberOfLines={1}
                          style={[
                            home.roomName,
                            selected && { color: colors.text },
                          ]}
                        >
                          {option.name}
                        </Text>
                        <View
                          style={[
                            home.roomDot,
                            {
                              backgroundColor: stat.alerts
                                ? colors.warning
                                : colors.accent,
                            },
                          ]}
                        />
                      </View>
                      <Text style={home.roomMeta}>
                        {stat.alerts
                          ? `${stat.alerts} ${stat.alerts === 1 ? "alert" : "alerts"}`
                          : `${stat.devices} ${stat.devices === 1 ? "device" : "devices"}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {isAll && !!categoryFavorites.length && (
              <View style={home.group}>
                <View style={home.heading}>
                  <Icon name="star" size={16} color={colors.accent} />
                  <Text accessibilityRole="header" style={home.roomTitle}>
                    Favorites
                  </Text>
                </View>
                {renderGroups(categoryFavorites)}
              </View>
            )}
            {sections.map((section) => (
              <View key={section.key} style={home.group}>
                {section.name !== null && (
                  <Text accessibilityRole="header" style={home.roomTitle}>
                    {section.name}
                  </Text>
                )}
                {renderGroups(section.items)}
              </View>
            ))}
            {!isAll && !categoryFiltered.length && count > 0 && (
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
    padding: layout.gutter,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: spacing.xl,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  desktopContent: {
    maxWidth: 1440,
    padding: layout.gutterWide,
    gap: layout.section,
  },
  mobileContent: { paddingBottom: layout.tabBarClearance },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  homeTitle: { ...typography.display, color: colors.text },
  statusLine: { ...typography.body, color: colors.muted },
  alertPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.warningSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningBorder,
  },
  alertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  alertPillText: { ...typography.eyebrow, color: colors.warning },
  welcome: { gap: spacing.lg, maxWidth: 640 },
  welcomeCopy: { gap: spacing.sm },
  welcomeActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  welcomeAction: { flexGrow: 1, flexBasis: 200 },
  cockpitTop: { gap: gridGap },
  quickRow: { flexDirection: "row", gap: spacing.sm },
  quickRowWrap: { flexWrap: "wrap" },
  quickTileHalf: { flexBasis: "40%" },
  quickTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  tileHovered: {
    backgroundColor: colors.raised,
    borderColor: colors.borderStrong,
  },
  quickTileSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    ...typography.secondary,
    color: colors.text,
    fontWeight: "600",
  },
  quickCount: {
    ...typography.secondary,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  overview: { gap: gridGap },
  // Attention keeps its reading position before the house on wide screens.
  wideOverview: { flexDirection: "row", alignItems: "stretch" },
  lead: { gap: gridGap, minWidth: 0 },
  leadFlexible: { flex: 1 },
  house: { minWidth: 0 },
  houseWide: { flex: 2, minWidth: 0 },
  attention: { gap: spacing.sm },
  attentionFlagged: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  // Beside the house the lead column ends where the house does.
  attentionAside: { flexGrow: 1 },
  section: { gap: gridGap },
  sectionHead: { gap: 2 },
  group: { gap: spacing.md },
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsHovered: {
    backgroundColor: colors.raised,
    borderColor: colors.borderStrong,
  },
  settingsPressed: { backgroundColor: colors.hover },
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
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    backgroundColor: "rgba(240,179,94,0.14)",
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  expand: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.control,
  },
  expandActive: { backgroundColor: "rgba(255,255,255,0.04)" },
  link: { ...typography.secondary, color: colors.accent, fontWeight: "600" },
  title: { ...typography.headline, color: colors.text },
  caption: { ...typography.secondary, color: colors.muted },
  coverage: { ...typography.caption, color: colors.muted, marginTop: "auto" },
  filters: { gap: spacing.sm, paddingRight: 2 },
  roomCard: {
    width: 148,
    minHeight: 80,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "space-between",
  },
  roomCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  roomCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  roomName: {
    ...typography.body,
    color: colors.muted,
    fontWeight: "600",
    flex: 1,
  },
  roomDot: { width: 6, height: 6, borderRadius: 3 },
  roomMeta: { ...typography.secondary, color: colors.muted },
  // A room, or Favorites: the title of one group of cards.
  roomTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  footer: {
    ...typography.secondary,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
