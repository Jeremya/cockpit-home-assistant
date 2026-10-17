import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCockpit } from "../core/store";
import { isVisible } from "../core/selectors";
import { getCondition } from "../core/policy";
import type { EntityRecord } from "../core/types";
import type { HousePlan, PlanPoint } from "../spatial/model";
import { useHousePlan } from "../spatial/plans";
import {
  placementEntity,
  placementGeometryIssue,
  placementIssueLabel,
  savedPlacements,
} from "../spatial/placements";
import { removePlacement, savePlacement } from "../spatial/placementActions";
import { FloorPlanView } from "../components/FloorPlanView";
import { entityAppearance } from "../components/EntityIcon";
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";

type PlacementParams = { key?: string; floor?: string; room?: string };
export function PlacementScreen() {
  const { plan, identity } = useHousePlan();
  const params = useLocalSearchParams<PlacementParams>();
  return (
    <PlacementEditor
      key={`${identity}:${params.key ?? ""}`}
      plan={plan}
      identity={identity}
      params={params}
    />
  );
}
function PlacementEditor({
  plan,
  identity,
  params,
}: {
  plan: HousePlan;
  identity: string;
  params: PlacementParams;
}) {
  const { snapshot, preferences, profileId, preferencesLoadedFor, status } =
    useCockpit();
  const ready = status.kind === "ready";
  const editable = !!profileId && profileId === preferencesLoadedFor;
  const entries = savedPlacements(snapshot, preferences, plan, ready);
  const requested =
    typeof params.key === "string"
      ? placementEntity(snapshot, preferences, params.key)
      : null;
  const initial = entries.find((entry) => entry.key === requested?.key);
  const initialFloor =
    plan.floors.find(
      (f) => f.id === (initial?.placement.floorId ?? params.floor),
    ) ?? plan.floors[0]!;
  const initialRoom =
    initialFloor.rooms.find(
      (r) => r.id === (initial?.placement.roomId ?? params.room),
    )?.id ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    requested?.key ?? null,
  );
  const [floorId, setFloorId] = useState(initialFloor.id);
  const [roomId, setRoomId] = useState<string | null>(initialRoom);
  const [point, setPoint] = useState<PlanPoint | null>(
    initial && !placementGeometryIssue(plan, initial.placement)
      ? initial.placement.position
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const floor = plan.floors.find((f) => f.id === floorId) ?? plan.floors[0]!;
  const selected = selectedKey
    ? placementEntity(snapshot, preferences, selectedKey)
    : null;
  const selectedVisible = selected && isVisible(selected, preferences);
  const draft = point ? { floorId: floor.id, roomId, position: point } : null;
  const issue = draft ? placementGeometryIssue(plan, draft) : null;
  const eligible = Object.values(snapshot?.entities ?? {})
    .filter(
      (entity) =>
        isVisible(entity, preferences) &&
        entity.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const choose = (entity: EntityRecord) => {
    const existing = entries.find((entry) => entry.key === entity.key);
    if (existing) {
      const target =
        plan.floors.find((f) => f.id === existing.placement.floorId) ?? floor;
      setFloorId(target.id);
      setRoomId(
        target.rooms.find((r) => r.id === existing.placement.roomId)?.id ??
          null,
      );
      setPoint(
        placementGeometryIssue(plan, existing.placement)
          ? null
          : existing.placement.position,
      );
    } else setPoint(null);
    setSelectedKey(entity.key);
    setError(null);
  };
  const finish = () =>
    router.canGoBack() ? router.back() : router.replace("/house");
  const save = () => {
    if (!selectedKey || !draft) return;
    const failure = savePlacement(identity, selectedKey, draft);
    if (failure) setError(failure);
    else finish();
  };
  const remove = (key: string) => {
    const failure = removePlacement(identity, key);
    setError(failure);
    if (!failure && key === selected?.key) setPoint(null);
  };
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Label>{plan.name}</Label>
      <Title>Place device</Title>
      <Body>
        Choose a device or reading, then tap its position on the plan. Save to
        keep it. Placement does not change its Home Assistant room.
      </Body>
      {!editable && (
        <Body>Preferences for this profile are not loaded yet.</Body>
      )}
      {!ready && (
        <Body>
          {snapshot
            ? "Using cached observations. You can still edit saved positions."
            : "Connect to see available devices and readings. Saved positions are kept."}
        </Body>
      )}
      {selectedKey ? (
        <Panel>
          <Label>Selected</Label>
          <Text style={styles.sectionTitle}>
            {selected?.name ?? "Unavailable entity"}
          </Text>
          {!selectedVisible && (
            <Body>
              This entity is no longer visible in current observations. Its
              saved placement is kept; choose another entity to place.
            </Body>
          )}
          <Button
            title="Choose another device or reading"
            secondary
            onPress={() => {
              setSelectedKey(null);
              setPoint(null);
              setQuery("");
              setError(null);
            }}
          />
        </Panel>
      ) : (
        <Panel>
          <Label>What would you like to place?</Label>
          <TextInput
            accessibilityLabel="Search devices and readings"
            placeholder="Search devices and readings"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
          />
          {eligible.map((entity) => (
            <Pressable
              key={entity.key}
              accessibilityRole="button"
              accessibilityLabel={`Place ${entity.name}`}
              disabled={!editable}
              onPress={() => choose(entity)}
              style={{ paddingVertical: 14, minHeight: 48 }}
            >
              <Text style={{ color: colors.text }}>{entity.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {entity.domain} ·{" "}
                {entries.some((entry) => entry.key === entity.key)
                  ? "Already placed"
                  : "Not placed"}
              </Text>
            </Pressable>
          ))}
          {!eligible.length && (
            <Body>
              {query
                ? "No matching visible entities."
                : "No visible entities available yet."}
            </Body>
          )}
        </Panel>
      )}
      {selectedKey && (
        <>
          <Label>Floor</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {plan.floors.map((item) => (
              <Choice
                key={item.id}
                name={item.name}
                selected={floor.id === item.id}
                onPress={() => {
                  setFloorId(item.id);
                  setRoomId(null);
                  setPoint(null);
                  setError(null);
                }}
              />
            ))}
          </View>
          <Label>Keep the position within</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Choice
              name="Whole floor"
              selected={roomId === null}
              onPress={() => {
                setRoomId(null);
                setPoint(null);
                setError(null);
              }}
            />
            {floor.rooms.map((room) => (
              <Choice
                key={room.id}
                name={room.name}
                selected={roomId === room.id}
                onPress={() => {
                  setRoomId(room.id);
                  setPoint(null);
                  setError(null);
                }}
              />
            ))}
          </View>
          <Panel style={{ padding: 8 }}>
            <FloorPlanView
              floor={floor}
              selectedRoom={roomId}
              onSelectRoom={() => undefined}
              markers={
                point && selected
                  ? [
                      {
                        key: selected.key,
                        name: selected.name,
                        position: point,
                        ...entityAppearance(selected, ready),
                        condition: getCondition(selected, ready),
                        stateLabel: "Unsaved position",
                      },
                    ]
                  : []
              }
              onPickPoint={(position) => {
                if (!position) {
                  setPoint(null);
                  setError("Tap inside the floor, outside the empty margins.");
                  return;
                }
                const problem = placementGeometryIssue(plan, {
                  floorId: floor.id,
                  roomId,
                  position,
                });
                if (problem) {
                  setPoint(null);
                  setError(placementIssueLabel[problem]);
                  return;
                }
                setPoint(position);
                setError(null);
              }}
            />
            <Body>
              {point
                ? "Position selected. Tap again to adjust, then save."
                : "Tap the plan to choose a position."}
            </Body>
          </Panel>
          {issue && (
            <Text accessibilityRole="alert" style={styles.error}>
              {placementIssueLabel[issue]}
            </Text>
          )}
          <Button
            title="Save position"
            disabled={!editable || !selectedVisible || !point || !!issue}
            onPress={save}
          />
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button title="Cancel placement" secondary onPress={finish} />
      {!!entries.length && (
        <Panel>
          <Label>Saved placements</Label>
          {entries.map((entry) => (
            <View key={entry.key} style={{ gap: 8, paddingVertical: 10 }}>
              <Text style={{ color: colors.text }}>
                {entry.entity?.name ?? "Unavailable saved entity"}
              </Text>
              <Body>
                {entry.issues.length
                  ? entry.issues
                      .map((reason) => placementIssueLabel[reason])
                      .join(" · ")
                  : plan.floors.find((f) => f.id === entry.placement.floorId)
                      ?.name}
              </Body>
              {entry.entity && !entry.issues.includes("entity_hidden") && (
                <Button
                  title={`Reposition ${entry.entity.name}`}
                  secondary
                  disabled={!editable}
                  onPress={() => choose(entry.entity!)}
                />
              )}
              <Button
                title={`Remove placement: ${entry.entity?.name ?? entry.storedKey}`}
                secondary
                disabled={!editable}
                onPress={() => remove(entry.key)}
              />
            </View>
          ))}
        </Panel>
      )}
    </ScrollView>
  );
}
function Choice({
  name,
  selected,
  onPress,
}: {
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        minHeight: 48,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSurface : colors.raised,
      }}
    >
      <Text style={{ color: colors.text }}>{name}</Text>
    </Pressable>
  );
}
