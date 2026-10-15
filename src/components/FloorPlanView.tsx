import Svg, {
  Ellipse,
  G,
  Line,
  Polygon,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import type {
  FurnitureKind,
  PlanFloor,
  PlanFurniture,
  PlanPoint,
  RoomKind,
} from "../spatial/model";
import { planBounds } from "../spatial/model";
import { colors } from "./ui";

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
}: {
  floor: PlanFloor;
  selectedRoom: string | null;
  onSelectRoom: (id: string) => void;
  height?: number;
  showLabels?: boolean;
}) {
  const bounds = planBounds(floor.outline);
  const unit = 40;
  const x = (point: PlanPoint) => (point.x - bounds.minX) * unit + 14;
  const y = (point: PlanPoint) => (bounds.maxZ - point.z) * unit + 14;
  const points = (polygon: PlanPoint[]) =>
    polygon.map((p) => `${x(p)},${y(p)}`).join(" ");
  const width = (bounds.maxX - bounds.minX) * unit + 28;
  const height = (bounds.maxZ - bounds.minZ) * unit + 28;
  return (
    <Svg
      width="100%"
      height={viewHeight}
      viewBox={`0 0 ${width} ${height}`}
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
        {showLabels &&
          floor.rooms.map((room) => (
            <SvgText
              key={room.id}
              x={x(room.label)}
              y={y(room.label)}
              fill={selectedRoom === room.id ? colors.text : "#c8d0df"}
              fontSize={
                room.kind === "storage" || room.kind === "bathroom" ? 8 : 10
              }
              textAnchor="middle"
              alignmentBaseline="middle"
              fontWeight="500"
              fontFamily="sans-serif"
            >
              {room.shortName}
            </SvgText>
          ))}
      </G>
    </Svg>
  );
}
