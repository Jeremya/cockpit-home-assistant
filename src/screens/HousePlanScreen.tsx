import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useCockpit } from "../core/store";
import { housePlanFor, useHousePlan } from "../spatial/plans";
import { savedPlacements } from "../spatial/placements";
import { primaryValue } from "../core/presentation";
import { openReading } from "../services/deviceNavigation";
import { openPlacement } from "../spatial/navigation";
import { placementSceneMarkers } from "../spatial/scene";
import { areaLinkStatus, entitiesByPlanRoom, own } from "../spatial/selectors";
import type { HousePlan, RoomKind } from "../spatial/model";
import { FloorPlanView } from "../components/FloorPlanView";
import { restoreReadingFocus } from "../components/readingFocus";
import { CockpitSceneView } from "../components/CockpitSceneView";
import { buildFeatures } from "../config/build";
import {
  entityAppearance,
  Icon,
  type IconName,
} from "../components/EntityIcon";
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";

const roomIcons: Record<RoomKind, IconName> = {
  living: "coffee",
  bedroom: "moon",
  kitchen: "grid",
  bathroom: "droplet",
  storage: "box",
  circulation: "corner-up-right",
};
export function HousePlanScreen() {
  const { plan, defaultChanged, identity } = useHousePlan();
  return (
    <HousePlanContent
      key={identity}
      plan={plan}
      defaultChanged={defaultChanged}
      identity={identity}
    />
  );
}
function HousePlanContent({
  plan,
  defaultChanged,
  identity,
}: {
  plan: HousePlan;
  defaultChanged: boolean;
  identity: string;
}) {
  const [floorId, setFloorId] = useState(plan.floors[0]!.id);
  const [roomId, setRoomId] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const roomHeading = useRef<View>(null);
  const detailY = useRef<number | null>(null);
  const revealRequested = useRef<string | null>(null);
  const readingTargets = useRef(new Map<string, View>());
  const returnTarget = useRef<{
    id: string;
    key: string;
    floorId: string;
    view: "2d" | "3d";
  } | null>(null);
  const routeFocused = useRef(true);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [resetKey, setResetKey] = useState(0);
  const profileId = useCockpit((state) => state.profileId);
  const floor =
    plan.floors.find((item) => item.id === floorId) ?? plan.floors[0]!;
  const room = floor.rooms.find((item) => item.id === roomId);
  const current = useRef({ floorId: floor.id, roomId, view, mounted: true });
  useLayoutEffect(() => {
    current.current = { floorId: floor.id, roomId, view, mounted: true };
  });
  useLayoutEffect(
    () => () => {
      current.current.mounted = false;
    },
    [],
  );
  useFocusEffect(
    useCallback(() => {
      routeFocused.current = true;
      const pending = returnTarget.current;
      if (!pending)
        return () => {
          routeFocused.current = false;
        };
      returnTarget.current = null;
      let cancelled = false;
      const target = () => {
        const latest = useCockpit.getState();
        const currentPlan = housePlanFor(latest);
        if (
          cancelled ||
          !routeFocused.current ||
          !current.current.mounted ||
          currentPlan.identity !== identity ||
          current.current.floorId !== pending.floorId ||
          current.current.view !== pending.view ||
          !savedPlacements(
            latest.snapshot,
            latest.preferences,
            currentPlan.plan,
            latest.status.kind === "ready",
          ).some(
            (entry) =>
              entry.key === pending.key &&
              entry.placement.floorId === pending.floorId &&
              !entry.issues.length,
          )
        )
          return undefined;
        return readingTargets.current.get(pending.id);
      };
      const cancelFocus = restoreReadingFocus(target);
      return () => {
        routeFocused.current = false;
        cancelled = true;
        cancelFocus();
      };
    }, [identity]),
  );
  const currentFloor = () =>
    current.current.mounted &&
    routeFocused.current &&
    current.current.floorId === floor.id &&
    housePlanFor(useCockpit.getState()).identity === identity;
  const revealDetails = (id: string) => {
    if (
      revealRequested.current !== id ||
      detailY.current === null ||
      !currentFloor()
    )
      return;
    revealRequested.current = null;
    scroll.current?.scrollTo({
      y: Math.max(0, detailY.current - 12),
      animated: false,
    });
    if (Platform.OS === "web") roomHeading.current?.focus();
    else
      void AccessibilityInfo.isScreenReaderEnabled()
        .then((enabled) => {
          if (
            enabled &&
            currentFloor() &&
            current.current.view === view &&
            current.current.roomId === id &&
            roomHeading.current
          )
            AccessibilityInfo.sendAccessibilityEvent(
              roomHeading.current,
              "focus",
            );
        })
        .catch(() => undefined);
  };
  const selectRoom = (id: string, fromList = false) => {
    if (currentFloor() && floor.rooms.some((item) => item.id === id)) {
      if (fromList) revealRequested.current = id;
      setRoomId(id);
      if (fromList && roomId === id) revealDetails(id);
    }
  };
  // Track viewport intersection, updating React only when visibility changes.
  const viewport = useRef({
    y: 0,
    height: 0,
    sceneY: 0,
    frameY: 0,
    frameHeight: 0,
  });
  const [sceneVisible, setSceneVisible] = useState(false);
  const updateVisibility = () => {
    const { y, height, sceneY, frameY, frameHeight } = viewport.current;
    setSceneVisible(
      height > 0 &&
        frameHeight > 0 &&
        sceneY + frameY < y + height &&
        sceneY + frameY + frameHeight > y,
    );
  };
  const snapshot = useCockpit((state) => state.snapshot);
  const preferences = useCockpit((state) => state.preferences);
  const ready = useCockpit((state) => state.status.kind === "ready");
  const editable = useCockpit(
    (state) =>
      !!state.profileId && state.profileId === state.preferencesLoadedFor,
  );
  const placements = savedPlacements(snapshot, preferences, plan, ready);
  const onFloor = placements.filter(
    (entry) => entry.placement.floorId === floor.id && !entry.issues.length,
  );
  const markers = onFloor.map((entry) => ({
    key: entry.key,
    name: entry.entity!.name,
    position: entry.placement.position,
    condition: entry.condition,
    ...entityAppearance(entry.entity!, ready),
    stateLabel: `${primaryValue(entry.entity!, snapshot!.config)}${ready ? "" : " · Cached"}`,
  }));
  const readingRef = (id: string, node: View | null) => {
    if (node) readingTargets.current.set(id, node);
    else readingTargets.current.delete(id);
  };
  const open = (key: string, origin = "list") => {
    if (currentFloor()) {
      returnTarget.current = {
        id: `${origin}:${key}`,
        key,
        floorId: floor.id,
        view,
      };
      openPlacement(profileId, identity, floor.id, key);
    }
  };
  const links = preferences.spatial.areaLinks;
  const byRoom = snapshot
    ? entitiesByPlanRoom(snapshot, preferences, plan).byRoom
    : {};
  const linked = plan.floors
    .flatMap((item) => item.rooms)
    .filter((item) => own(links, item.id)).length;
  const status = room ? areaLinkStatus(room.id, links, snapshot) : null;
  const roomEntities = (room && snapshot ? (own(byRoom, room.id) ?? []) : [])
    .map((id) => snapshot!.entities[id]!)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentContainerStyle={[styles.content, planStyles.content]}
      testID="house-scroll"
      onLayout={(event) => {
        viewport.current.height = event.nativeEvent.layout.height;
        updateVisibility();
      }}
      onScroll={(event) => {
        viewport.current.y = event.nativeEvent.contentOffset.y;
        updateVisibility();
      }}
      scrollEventThrottle={16}
    >
      <View style={{ gap: 8 }}>
        <Label>
          {plan.source === "sample" ? "Sample floor plan" : "Your floor plan"}
        </Label>
        <Title>{plan.name}</Title>
        <Body>
          {plan.floors.length} floors ·{" "}
          {plan.source === "reference_image"
            ? "Traced from your reference plan"
            : "Illustrative layout"}
        </Body>
      </View>
      {defaultChanged && (
        <Panel>
          <Body>
            A newer default plan is available. Your saved plan is kept; reset it
            from Diagnostics to use the new one.
          </Body>
        </Panel>
      )}
      <View style={planStyles.floorTabs} accessibilityRole="tablist">
        {plan.floors.map((item) => {
          const selected = item.id === floor.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.name}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => {
                revealRequested.current = null;
                detailY.current = null;
                setFloorId(item.id);
                setRoomId(null);
              }}
              style={[planStyles.floorTab, selected && planStyles.selectedTab]}
            >
              <Icon
                name="layers"
                size={16}
                color={selected ? colors.accent : colors.muted}
              />
              <Text
                style={[
                  planStyles.floorText,
                  selected && { color: colors.text },
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={planStyles.floorTabs}
        accessibilityRole="tablist"
        accessibilityLabel="Plan view"
      >
        {(buildFeatures.spatial3d
          ? (["2d", "3d"] as const)
          : (["2d"] as const)
        ).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityLabel={item === "2d" ? "2D plan" : "3D view"}
            accessibilityState={{ selected: view === item }}
            onPress={() => setView(item)}
            style={[
              planStyles.floorTab,
              view === item && planStyles.selectedTab,
            ]}
          >
            <Icon
              name={item === "2d" ? "map" : "box"}
              color={view === item ? colors.accent : colors.muted}
              size={18}
            />
            <Text
              style={[
                planStyles.floorText,
                view === item && { color: colors.text },
              ]}
            >
              {item === "2d" ? "2D plan" : "3D view"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        testID="spatial-preview"
        onLayout={(event) => {
          viewport.current.sceneY = event.nativeEvent.layout.y;
          updateVisibility();
        }}
      >
        <Panel style={{ padding: 10, gap: 10 }}>
          <View style={[styles.row, { paddingHorizontal: 10, paddingTop: 8 }]}>
            <Text style={planStyles.floorName}>{floor.name}</Text>
            <Text style={planStyles.caption}>{floor.rooms.length} spaces</Text>
          </View>
          <View
            testID="scene-viewport"
            onLayout={(event) => {
              viewport.current.frameY = event.nativeEvent.layout.y;
              viewport.current.frameHeight = event.nativeEvent.layout.height;
              updateVisibility();
            }}
          >
            {buildFeatures.spatial3d && view === "3d" ? (
              <CockpitSceneView
                floor={floor}
                markers={placementSceneMarkers(placements, floor.id)}
                fallbackMarkers={markers}
                selectedRoomId={room?.id ?? null}
                resetKey={resetKey}
                visible={sceneVisible}
                onRoomPress={(id) => {
                  if (current.current.view === "3d") selectRoom(id);
                }}
                onMarkerPress={(key) => {
                  if (current.current.view === "3d") open(key);
                }}
              />
            ) : (
              <FloorPlanView
                floor={floor}
                selectedRoom={room?.id ?? null}
                onSelectRoom={selectRoom}
                markers={markers}
                onMarkerPress={(key) => open(key, "marker")}
                onMarkerRef={(key, node) => readingRef(`marker:${key}`, node)}
              />
            )}
          </View>
          <Text style={planStyles.hint}>
            {view === "3d"
              ? "Drag to orbit · Pinch to zoom · Tap a room or marker"
              : "Tap a room to explore. Room and device names are also listed below."}
          </Text>
          {(view === "3d" || room) && (
            <Button
              title="Show whole floor"
              secondary
              onPress={() => {
                setRoomId(null);
                setResetKey((value) => value + 1);
              }}
            />
          )}
        </Panel>
      </View>
      <Button
        title={
          linked
            ? `Rooms linked to Home Assistant: ${linked}`
            : "Link rooms to Home Assistant"
        }
        secondary
        onPress={() => router.push("/house-links")}
      />
      <Button
        title="Place device"
        secondary
        disabled={!editable}
        onPress={() =>
          router.push({
            pathname: "/house-place",
            params: { floor: floor.id, ...(room ? { room: room.id } : {}) },
          })
        }
      />
      {room && (
        <View
          key={room.id}
          testID="plan-room-detail"
          onLayout={({ nativeEvent }) => {
            if (!currentFloor() || current.current.roomId !== room.id) return;
            detailY.current = nativeEvent.layout.y;
            revealDetails(room.id);
          }}
        >
          <Panel style={{ borderColor: "#638bb9" }}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 8 }}>
                <Label>{floor.name}</Label>
                <View
                  ref={roomHeading}
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={room.name}
                  tabIndex={-1}
                >
                  <Text style={planStyles.roomName}>{room.name}</Text>
                </View>
              </View>
              <Icon
                name={roomIcons[room.kind]}
                color={colors.accent}
                size={25}
              />
            </View>
            {room.dimensions && (
              <Text style={planStyles.dimensions}>{room.dimensions}</Text>
            )}
            <Body>
              {room.dimensions
                ? "Dimensions shown on the supplied plan."
                : "No dimensions supplied for this space."}
            </Body>
            {status?.kind === "linked" ? (
              <View style={{ gap: 8 }}>
                <Text style={planStyles.caption}>
                  Home Assistant area: {status.area.name}
                  {status.verified ? "" : " (cached, not verified)"}. Markers
                  follow saved positions; this list follows HA room assignments.
                </Text>
                {roomEntities.length ? (
                  roomEntities.map((entity) => (
                    <Pressable
                      key={entity.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${entity.name}`}
                      onPress={() => {
                        if (currentFloor() && profileId)
                          openReading(profileId, entity.key);
                      }}
                      style={planStyles.deviceRow}
                    >
                      <Text style={planStyles.roomLabel}>{entity.name}</Text>
                      <Icon
                        name="chevron-right"
                        size={16}
                        color={colors.muted}
                      />
                    </Pressable>
                  ))
                ) : (
                  <Text style={planStyles.caption}>
                    No visible entities in this area.
                  </Text>
                )}
              </View>
            ) : (
              <Text style={planStyles.caption}>
                {status?.kind === "missing"
                  ? "Its Home Assistant area was removed. Choose another in Link rooms."
                  : status?.kind === "unverified"
                    ? "Linked to a Home Assistant area that cannot be verified right now."
                    : "Not linked to a Home Assistant area."}
              </Text>
            )}
          </Panel>
        </View>
      )}
      {!!onFloor.length && (
        <Panel>
          <Label>Placed on this floor</Label>
          {onFloor.map((entry) => (
            <View key={entry.key} style={styles.row}>
              <Pressable
                ref={(node) => readingRef(`list:${entry.key}`, node)}
                accessibilityRole="button"
                accessibilityLabel={`Open placed ${entry.entity!.name}`}
                onPress={() => open(entry.key)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Text style={planStyles.roomLabel}>{entry.entity!.name}</Text>
                <Text style={planStyles.caption}>
                  {
                    markers.find((marker) => marker.key === entry.key)!
                      .stateLabel
                  }
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reposition ${entry.entity!.name}`}
                disabled={!editable}
                onPress={() =>
                  router.push({
                    pathname: "/house-place",
                    params: { key: entry.key },
                  })
                }
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="move" color={colors.accent} />
              </Pressable>
            </View>
          ))}
        </Panel>
      )}
      {placements.some((entry) => entry.issues.length) && (
        <Body>
          Some saved placements cannot be shown. They are kept in Diagnostics
          and Manage placements.
        </Body>
      )}
      {!!placements.length && (
        <Button
          title="Manage placements"
          secondary
          onPress={() => router.push("/house-place")}
        />
      )}
      <View style={{ gap: 10 }}>
        <Text style={styles.sectionTitle}>Spaces on this floor</Text>
        {floor.rooms.map((item) => {
          const selected = item.id === room?.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Explore ${item.name}`}
              accessibilityState={{ selected }}
              aria-pressed={selected}
              onPress={() => selectRoom(item.id, true)}
              style={[planStyles.roomRow, selected && planStyles.selectedRow]}
            >
              <Icon
                name={roomIcons[item.kind]}
                color={selected ? colors.accent : colors.muted}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={planStyles.roomLabel}>{item.name}</Text>
                {(item.dimensions || own(byRoom, item.id)) && (
                  <Text style={planStyles.caption}>
                    {[
                      item.dimensions,
                      entityCount(own(byRoom, item.id)?.length),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
              </View>
              <Icon
                name={selected ? "check" : "chevron-right"}
                size={16}
                color={selected ? colors.accent : colors.muted}
              />
            </Pressable>
          );
        })}
      </View>
      <Body>
        Layout and scale are approximate.{" "}
        {plan.source === "reference_image"
          ? "Room outlines follow your image; "
          : ""}
        heights and device positions are not measured.
      </Body>
    </ScrollView>
  );
}
// Room lists count readings; the U03 Home summaries separately count physical devices.
const entityCount = (n?: number) =>
  n ? `${n} ${n === 1 ? "entity" : "entities"}` : undefined;
const planStyles = StyleSheet.create({
  content: { maxWidth: 800, width: "100%", alignSelf: "center", gap: 22 },
  floorTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  floorTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  selectedTab: {
    backgroundColor: colors.accentSurface,
    borderColor: "#638bb9",
  },
  floorText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  floorName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  hint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingBottom: 8,
  },
  roomName: { color: colors.text, fontSize: 23, fontWeight: "600" },
  dimensions: { color: colors.accent, fontSize: 23, fontWeight: "400" },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  selectedRow: {
    backgroundColor: colors.accentSurface,
    borderColor: "#638bb9",
  },
  roomLabel: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
  },
});
