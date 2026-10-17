import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCockpit } from "../core/store";
import type { Area } from "../core/types";
import type { HousePlan } from "../spatial/model";
import { session } from "../services/runtime";
import { housePlanFor, useHousePlan } from "../spatial/plans";
import {
  areaLinkStatus,
  entitiesByPlanRoom,
  own,
  setAreaLink,
  type AreaLinkStatus,
} from "../spatial/selectors";
import { Icon } from "../components/EntityIcon";
import { Body, Label, Panel, Title, colors, styles } from "../components/ui";

/** P03: link each plan room to an existing HA area, by explicit choice only. */
export function PlanLinksScreen() {
  const { plan, identity } = useHousePlan();
  // A new profile or plan starts with every picker closed.
  return <PlanLinks key={identity} plan={plan} identity={identity} />;
}
function PlanLinks({ plan, identity }: { plan: HousePlan; identity: string }) {
  const snapshot = useCockpit((state) => state.snapshot);
  const preferences = useCockpit((state) => state.preferences);
  const ready = useCockpit(
    (state) =>
      !!state.profileId && state.preferencesLoadedFor === state.profileId,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const links = preferences.spatial.areaLinks;
  const areas = Object.values(snapshot?.areas ?? {}).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const duplicateNames = new Set(
    areas
      .map((area) => area.name)
      .filter((name, i, names) => names.indexOf(name) !== i),
  );
  const areaLabel = (area: Area) =>
    duplicateNames.has(area.name) ? `${area.name} (${area.id})` : area.name;
  const counts = snapshot
    ? entitiesByPlanRoom(snapshot, preferences, plan).byRoom
    : {};
  const roomOfArea = (areaId: string) => {
    for (const floor of plan.floors)
      for (const room of floor.rooms)
        if (own(links, room.id) === areaId) return { floor, room };
    return null;
  };
  const choose = (roomId: string, areaId: string | null) => {
    setEditing(null);
    // Refuse a choice made from a picker whose profile, plan, room or area is gone.
    const latest = useCockpit.getState();
    const current = housePlanFor(latest);
    const stale =
      current.identity !== identity ||
      !current.plan.floors.some((f) => f.rooms.some((r) => r.id === roomId)) ||
      (areaId !== null &&
        !(latest.snapshot && own(latest.snapshot.areas, areaId)));
    if (stale) {
      session.notice(
        "The link was not saved: the plan or its Home Assistant areas changed. Choose again.",
      );
      return;
    }
    const saved = session.updatePreferences((p) => ({
      ...p,
      spatial: {
        ...p.spatial,
        areaLinks: setAreaLink(p.spatial.areaLinks, roomId, areaId),
      },
    }));
    if (!saved)
      session.notice(
        "The link was not saved: preferences for this profile are not loaded.",
      );
  };
  const metadata = snapshot?.metadata.areas;
  const linkedCount = plan.floors
    .flatMap((floor) => floor.rooms)
    .filter((room) => own(links, room.id)).length;
  const roomCount = plan.floors.reduce((n, f) => n + f.rooms.length, 0);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ gap: 8 }}>
        <Label>{plan.name}</Label>
        <Title>Link rooms</Title>
        <Body>
          Choose the Home Assistant area that matches each room of the plan.
          Maurice never guesses: unlinked rooms stay empty and their devices
          stay in the Home list. {linkedCount} of {roomCount} rooms linked.
        </Body>
      </View>
      {!snapshot ? (
        <Panel>
          <Body>
            Connect to Home Assistant to choose areas. Existing links are kept.
          </Body>
        </Panel>
      ) : metadata?.kind === "stale" ? (
        <Panel>
          <Body>
            Home Assistant area names could not be loaded ({metadata.reason}).
            Existing links are kept and shown as not verified.
          </Body>
        </Panel>
      ) : (
        !areas.length && (
          <Panel>
            <Body>
              Home Assistant has no areas yet. In Home Assistant, open Settings
              → Areas, labels & zones, create your rooms and assign devices to
              them, then come back here.
            </Body>
          </Panel>
        )
      )}
      {!ready && <Body>Preferences for this profile are not loaded yet.</Body>}
      {plan.floors.map((floor) => (
        <View key={floor.id} style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>{floor.name}</Text>
          {floor.rooms.map((room) => {
            const status = areaLinkStatus(room.id, links, snapshot);
            const open = editing === room.id;
            return (
              <View key={room.id} style={links_.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${room.name}, ${floor.name}`}
                  accessibilityHint={describe(
                    status,
                    own(counts, room.id)?.length,
                  )}
                  accessibilityState={{ expanded: open, disabled: !ready }}
                  disabled={!ready}
                  onPress={() => setEditing(open ? null : room.id)}
                  style={links_.row}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={links_.room}>{room.name}</Text>
                    <Text
                      style={[
                        links_.caption,
                        status.kind === "missing" && { color: colors.warning },
                      ]}
                    >
                      {floor.name} ·{" "}
                      {describe(status, own(counts, room.id)?.length)}
                    </Text>
                  </View>
                  <Icon
                    name={open ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {open && (
                  <View accessibilityRole="radiogroup" style={{ gap: 6 }}>
                    <Option
                      label="Unlinked"
                      selected={status.kind === "unlinked"}
                      onPress={() => choose(room.id, null)}
                    />
                    {areas.map((area) => {
                      const owner = roomOfArea(area.id);
                      const moves = owner && owner.room.id !== room.id;
                      return (
                        <Option
                          key={area.id}
                          label={areaLabel(area)}
                          caption={
                            moves
                              ? `Moves the link from ${owner.room.name} · ${owner.floor.name}`
                              : undefined
                          }
                          selected={own(links, room.id) === area.id}
                          onPress={() => choose(room.id, area.id)}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

function describe(status: AreaLinkStatus, entities = 0) {
  switch (status.kind) {
    case "unlinked":
      return "Unlinked";
    case "linked":
      return `${status.area.name}${status.verified ? "" : " (cached, not verified)"} · ${entities} ${entities === 1 ? "entity" : "entities"}`;
    case "missing":
      return "Linked area was removed from Home Assistant";
    case "unverified":
      return `Linked to ${status.areaId} (not verified)`;
  }
}

function Option({
  label,
  caption,
  selected,
  onPress,
}: {
  label: string;
  caption?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[links_.option, selected && links_.selected]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={links_.optionText}>{label}</Text>
        {caption && <Text style={links_.caption}>{caption}</Text>}
      </View>
      {selected && <Icon name="check" size={16} color={colors.accent} />}
    </Pressable>
  );
}

const links_ = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  room: { color: colors.text, fontSize: 15, fontWeight: "500" },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  selected: { backgroundColor: colors.accentSurface },
  optionText: { color: colors.text, fontSize: 14 },
});
