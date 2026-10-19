import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Ellipse, G, Line, Polygon, Rect } from "react-native-svg";
import type {
  FurnitureKind,
  PlanFloor,
  PlanFurniture,
  PlanPoint,
  RoomKind,
} from "../spatial/model";
import type { Condition } from "../core/types";
import {
  floorViewBox,
  planToSvg,
  pressLocation,
  screenToPlan,
} from "../spatial/viewport";
import { layoutPlanLabels } from "../spatial/planLabels";
import { Icon, type IconName } from "./EntityIcon";
import { colors } from "./ui";

export interface FloorPlanMarker {
  key: string;
  name: string;
  position: PlanPoint;
  icon: IconName;
  tint: string;
  condition: Condition;
  stateLabel: string;
}

const roomColors: Record<RoomKind, string> = {
  living: "#243b40",
  kitchen: "#3e3430",
  bedroom: "#333149",
  bathroom: "#243e50",
  storage: "#333846",
  circulation: "#242d3b",
};

// Quiet line-art footprints: furniture orients the eye but never competes with rooms or state.
const furnitureStyles: Record<
  FurnitureKind,
  { fill: string; stroke: string; dash?: string; radius: number }
> = {
  rug: {
    fill: "rgba(214,222,235,0.04)",
    stroke: "rgba(214,222,235,0.28)",
    dash: "2.5 2",
    radius: 1.5,
  },
  seating: {
    fill: "rgba(214,222,235,0.16)",
    stroke: "rgba(214,222,235,0.5)",
    radius: 4,
  },
  table: {
    fill: "rgba(214,222,235,0.1)",
    stroke: "rgba(214,222,235,0.45)",
    radius: 2,
  },
  counter: {
    fill: "rgba(214,222,235,0.12)",
    stroke: "rgba(214,222,235,0.3)",
    radius: 1,
  },
  storage: {
    fill: "rgba(214,222,235,0.08)",
    stroke: "rgba(214,222,235,0.3)",
    radius: 1,
  },
  appliance: {
    fill: "rgba(214,222,235,0.05)",
    stroke: "rgba(214,222,235,0.42)",
    radius: 1.5,
  },
  fixture: {
    fill: "rgba(246,178,107,0.1)",
    stroke: "rgba(246,178,107,0.45)",
    radius: 1.5,
  },
  plant: {
    fill: "rgba(95,212,168,0.18)",
    stroke: "rgba(95,212,168,0.5)",
    radius: 0,
  },
};
const furnitureOrder = (item: PlanFurniture) =>
  item.kind === "rug" ? 0 : item.kind === "counter" ? 1 : 2;

export function FloorPlanView({
  floor,
  selectedRoom,
  onSelectRoom,
  height: viewHeight = 360,
  showLabels = true,
  markers = [],
  onMarkerPress,
  onMarkerRef,
  onPickPoint,
}: {
  floor: PlanFloor;
  selectedRoom: string | null;
  onSelectRoom: (id: string) => void;
  height?: number;
  showLabels?: boolean;
  markers?: FloorPlanMarker[];
  onMarkerPress?: (key: string) => void;
  onMarkerRef?: (key: string, node: View | null) => void;
  onPickPoint?: (point: PlanPoint | null) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { fontScale } = useWindowDimensions();
  const labels = layoutPlanLabels(floor, markers, size, fontScale);
  const box = floorViewBox(floor);
  const { unit, width, height } = box;
  const x = (point: PlanPoint) => planToSvg(point, box).x;
  const y = (point: PlanPoint) => planToSvg(point, box).y;
  const points = (polygon: PlanPoint[]) =>
    polygon.map((p) => `${x(p)},${y(p)}`).join(" ");
  return (
    <View
      testID="plan-frame"
      style={{ width: "100%", height: viewHeight }}
      onLayout={({ nativeEvent }) =>
        setSize({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height,
        })
      }
    >
      <Svg
        width="100%"
        height={viewHeight}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        accessible={false}
        aria-hidden
        importantForAccessibility="no-hide-descendants"
      >
        <Polygon
          points={points(floor.outline)}
          fill={colors.raised}
          stroke={colors.muted}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {floor.rooms.map((room) => (
          <Polygon
            key={room.id}
            testID={`plan-room-${room.id}`}
            points={points(room.polygon)}
            fill={selectedRoom === room.id ? "#34547a" : roomColors[room.kind]}
            stroke={selectedRoom === room.id ? colors.accent : "transparent"}
            strokeWidth={2}
            strokeLinejoin="round"
            onPress={() => onSelectRoom(room.id)}
          />
        ))}
        <G pointerEvents="none">
          {[...(floor.furniture ?? [])]
            .sort((a, b) => furnitureOrder(a) - furnitureOrder(b))
            .map((item) => {
              const style = furnitureStyles[item.kind];
              const cx = x(item.center);
              const cy = y(item.center);
              const w = item.width * unit;
              const h = item.depth * unit;
              const shared = {
                fill: style.fill,
                stroke: style.stroke,
                strokeWidth: 0.8,
                strokeDasharray: style.dash,
                transform: item.rotation
                  ? `rotate(${-item.rotation} ${cx} ${cy})`
                  : undefined,
              };
              return item.shape === "ellipse" ? (
                <Ellipse
                  key={item.id}
                  cx={cx}
                  cy={cy}
                  rx={w / 2}
                  ry={h / 2}
                  {...shared}
                />
              ) : (
                <Rect
                  key={item.id}
                  x={cx - w / 2}
                  y={cy - h / 2}
                  width={w}
                  height={h}
                  rx={Math.min(style.radius, w / 2, h / 2)}
                  {...shared}
                />
              );
            })}
          {floor.lines.map((line, index) => (
            <Line
              key={index}
              x1={x(line.from)}
              y1={y(line.from)}
              x2={x(line.to)}
              y2={y(line.to)}
              stroke={
                line.kind === "window"
                  ? colors.comfort
                  : line.kind === "step"
                    ? "#69758a"
                    : "#bbc3d0"
              }
              strokeWidth={
                line.kind === "step" ? 0.8 : line.kind === "window" ? 2 : 2.5
              }
              strokeLinecap="round"
            />
          ))}
        </G>
      </Svg>
      {showLabels &&
        labels.rooms.map(({ id, rect }) => (
          <View
            key={id}
            testID={`plan-room-label-${id}`}
            pointerEvents="none"
            accessible={false}
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              justifyContent: "center",
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                textAlign: "center",
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "500",
                color: selectedRoom === id ? colors.text : "#c8d0df",
              }}
            >
              {floor.rooms.find((room) => room.id === id)!.shortName}
            </Text>
          </View>
        ))}
      {markers.map((marker) => {
        const layout = labels.markers.get(marker.key);
        if (!layout) return null;
        const { target, caption } = layout;
        const content = (
          <>
            <View style={[markerStyles.dot, { borderColor: marker.tint }]}>
              <Icon name={marker.icon} color={marker.tint} size={20} />
            </View>
            {caption && (
              <View
                testID={`plan-marker-label-${marker.key}`}
                pointerEvents="none"
                style={[
                  markerStyles.label,
                  {
                    left: caption.x - target.x,
                    top: caption.y - target.y,
                    width: caption.width,
                    height: caption.height,
                  },
                ]}
              >
                <Text numberOfLines={1} style={markerStyles.labelText}>
                  {marker.name}
                </Text>
                <Text numberOfLines={1} style={markerStyles.labelText}>
                  {marker.stateLabel}
                </Text>
              </View>
            )}
          </>
        );
        const style = {
          position: "absolute" as const,
          left: target.x,
          top: target.y,
          width: target.width,
          height: target.height,
        };
        return onMarkerPress && !onPickPoint ? (
          <Pressable
            key={marker.key}
            ref={(node) => onMarkerRef?.(marker.key, node)}
            testID={`plan-marker-${marker.key}`}
            style={style}
            accessibilityRole="button"
            accessibilityLabel={`${marker.name}, ${marker.stateLabel}`}
            accessibilityHint="Open observed state and device details"
            onPress={() => onMarkerPress(marker.key)}
          >
            {content}
          </Pressable>
        ) : (
          <View key={marker.key} style={style} pointerEvents="none">
            {content}
          </View>
        );
      })}
      {onPickPoint && (
        <Pressable
          testID="plan-placement-surface"
          accessibilityRole="button"
          accessibilityLabel="Choose position on floor plan"
          accessibilityHint="Tap a point inside the floor and the selected room. Save to keep the position."
          style={StyleSheet.absoluteFill}
          onPress={(event) => {
            const point = pressLocation(event);
            onPickPoint(point ? screenToPlan(point, box, size) : null);
          }}
        />
      )}
    </View>
  );
}

const markerStyles = StyleSheet.create({
  dot: {
    width: 44,
    height: 44,
    margin: 2,
    borderRadius: 22,
    borderWidth: 2,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    position: "absolute",
    backgroundColor: colors.background,
    borderRadius: 5,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  labelText: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
    color: colors.text,
  },
});
