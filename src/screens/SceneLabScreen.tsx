import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useHousePlan } from "../spatial/plans";
import type { PlanFloor } from "../spatial/model";
import { CockpitSceneView } from "../components/CockpitSceneView";
import {
  Body,
  Button,
  Label,
  Panel,
  Title,
  colors,
  styles,
} from "../components/ui";
import type { SceneMetrics } from "../web/sceneModel";

/**
 * S01 feasibility lab (development builds only). Fixture markers are fake and sit on
 * room label points; they are not device placements and never trigger service calls.
 */
const fixtureConditions = ["attention", "normal", "active", "alert"] as const;
const fixtureIcons = ["lock", "climate", "fan", "sensor"] as const;
function fixtureMarkers(floor: PlanFloor) {
  return floor.rooms.slice(0, 4).map((room, index) => ({
    key: `fixture:${room.id}`,
    floorId: floor.id,
    position: room.label,
    icon: fixtureIcons[index]!,
    label: `Fixture ${index + 1}`,
    condition: fixtureConditions[index]!,
  }));
}

export function SceneLabScreen() {
  const { plan } = useHousePlan();
  const [floorId, setFloorId] = useState(plan.floors[0]!.id);
  const floor =
    plan.floors.find((item) => item.id === floorId) ?? plan.floors[0]!;
  const [roomId, setRoomId] = useState<string | null>(null);
  const [marker, setMarker] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [simulate, setSimulate] = useState<"context_loss" | null>(null);
  const [mounted, setMounted] = useState(true);
  const [metrics, setMetrics] = useState<SceneMetrics | null>(null);
  // The React Compiler memoizes these; markers stay stable while the floor is unchanged.
  const markers = fixtureMarkers(floor);
  const onRoomPress = (id: string) => {
    setRoomId(id);
    setMarker(null);
  };
  const onMarkerPress = (key: string) => setMarker(key);
  const room = floor.rooms.find((item) => item.id === roomId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Label>S01 feasibility lab</Label>
      <Title>3D scene</Title>
      <Body>
        Fixture markers only. Drag to orbit, pinch to zoom, tap a room or
        marker.
      </Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {plan.floors.map((item) => (
          <Button
            key={item.id}
            title={item.id === floor.id ? `• ${item.name}` : item.name}
            secondary={item.id !== floor.id}
            onPress={() => {
              setFloorId(item.id);
              setRoomId(null);
              setMarker(null);
            }}
          />
        ))}
      </View>
      {mounted ? (
        <CockpitSceneView
          floor={floor}
          markers={markers}
          selectedRoomId={roomId}
          onRoomPress={onRoomPress}
          onMarkerPress={onMarkerPress}
          visible={visible}
          simulate={simulate}
          onMetrics={setMetrics}
        />
      ) : (
        <Body>Scene unmounted.</Body>
      )}
      <Panel>
        <Text
          style={{ color: colors.text, fontSize: 16 }}
          testID="lab-selection"
        >
          Selected: {room ? room.name : "none"}
          {marker ? ` · marker ${marker}` : ""}
        </Text>
        <Text
          style={{ color: colors.muted, fontFamily: "monospace" }}
          testID="lab-metrics"
        >
          {metrics
            ? [
                `ready ${metrics.readyMs ?? "—"} ms`,
                `interaction ${metrics.interaction.frames} frames / ${metrics.interaction.durationMs.toFixed(0)} ms = ${metrics.interaction.fps.toFixed(1)} fps`,
                `idle ${metrics.idleFrames} · hidden ${metrics.hiddenFrames} · total ${metrics.totalFrames}`,
                `rebuilds ${metrics.rebuilds} · geometries ${metrics.memory.geometries} · textures ${metrics.memory.textures}`,
                `context losses ${metrics.contextLosses}`,
              ].join("\n")
            : "no metrics yet"}
        </Text>
      </Panel>
      <View style={{ gap: 8 }}>
        <Button
          title={visible ? "Hide scene (visible=false)" : "Show scene"}
          secondary
          onPress={() => setVisible((value) => !value)}
        />
        <Button
          title="Simulate context loss"
          secondary
          onPress={() =>
            setSimulate((value) => (value ? null : "context_loss"))
          }
        />
        <Button
          title={mounted ? "Unmount scene" : "Mount scene"}
          secondary
          onPress={() => setMounted((value) => !value)}
        />
      </View>
      <View style={{ height: 400 }} />
    </ScrollView>
  );
}
