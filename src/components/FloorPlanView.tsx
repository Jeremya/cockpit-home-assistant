import { useId, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { PlanFloor, PlanPoint } from "../spatial/model";
import type { Condition } from "../core/types";
import {
  floorViewBox,
  planToSvg,
  pressLocation,
  screenToPlan,
} from "../spatial/viewport";
import { layoutPlanLabels } from "../spatial/planLabels";
import {
  captionAlignment,
  furnitureLayer,
  furnitureRadius,
  planFrameAspect,
  planFrameHeight,
  planFrames,
  planGridPath,
  planPalette,
  planStageExtent,
  planStrokes,
  roomFill,
  roomTones,
  wallJoints,
  withAlpha,
  type PlanDensity,
  type PlanFrameLimits,
} from "../spatial/planStyle";
import { Icon, type IconName } from "./EntityIcon";
import { colors } from "./ui";
import { PlanRoomPolygon } from "./PlanRoomPolygon";

export interface FloorPlanMarker {
  key: string;
  name: string;
  position: PlanPoint;
  icon: IconName;
  tint: string;
  condition: Condition;
  stateLabel: string;
}

/**
 * The 2D plan as one architectural drawing: a near-black stage, a tonal floor
 * plate, a heavy shell over lighter partitions and a lit selected room. Only
 * gradients and plain shapes are used, so native and web draw the same thing.
 */
export function FloorPlanView({
  floor,
  selectedRoom,
  onSelectRoom,
  height: fixedHeight,
  sizing = planFrames.editor,
  density = "regular",
  stageRadius = 16,
  showLabels = true,
  markers = [],
  onMarkerPress,
  onMarkerRef,
  onPickPoint,
}: {
  floor: PlanFloor;
  selectedRoom: string | null;
  onSelectRoom: (id: string) => void;
  /** A fixed stage height. Without it the stage follows the floor's shape. */
  height?: number;
  sizing?: PlanFrameLimits;
  /** Compact keeps the same drawing with lighter lines and smaller names. */
  density?: PlanDensity;
  stageRadius?: number;
  showLabels?: boolean;
  markers?: FloorPlanMarker[];
  onMarkerPress?: (key: string) => void;
  onMarkerRef?: (key: string, node: View | null) => void;
  onPickPoint?: (point: PlanPoint | null) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { fontScale } = useWindowDimensions();
  // Hidden routes keep their SVG mounted: paint servers need their own ids.
  const paint = useId().replace(/[^A-Za-z0-9]/g, "");
  const labels = layoutPlanLabels(floor, markers, size, fontScale);
  const box = floorViewBox(floor);
  const { unit, width, height } = box;
  const x = (point: PlanPoint) => planToSvg(point, box).x;
  const y = (point: PlanPoint) => planToSvg(point, box).y;
  const points = (polygon: PlanPoint[]) =>
    polygon.map((p) => `${x(p)},${y(p)}`).join(" ");
  const strokes = planStrokes(density, box, size);
  const extent = planStageExtent(box, size);
  const tones = roomTones(floor.rooms, selectedRoom);
  const lit = floor.rooms.find((room) => tones.get(room.id) === "lit");
  const frameHeight = fixedHeight ?? planFrameHeight(box, size.width, sizing);
  const compact = density === "compact";
  const grid = planGridPath(box, size);
  const gridLines = !!grid && (
    <Path
      d={grid}
      fill="none"
      stroke={planPalette.grid.color}
      strokeOpacity={planPalette.grid.opacity}
      strokeWidth={strokes.hairline}
    />
  );
  return (
    <View
      testID="plan-frame"
      style={[
        stage.frame,
        { borderRadius: stageRadius },
        // The same rule twice: declared for the first frame, computed once the
        // width is measured so both platforms settle on one height.
        frameHeight === null
          ? {
              aspectRatio: planFrameAspect(box, sizing),
              minHeight: sizing.minHeight,
              maxHeight: sizing.maxHeight,
            }
          : { height: frameHeight },
      ]}
      onLayout={({ nativeEvent }) =>
        setSize({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height,
        })
      }
    >
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        {...(Platform.OS === "web"
          ? {}
          : {
              accessible: false,
              importantForAccessibility: "no-hide-descendants" as const,
            })}
      >
        <Defs>
          <RadialGradient
            id={`${paint}-ambient`}
            gradientUnits="userSpaceOnUse"
            cx={width / 2}
            cy={height / 2}
            r={Math.max(width, height) * 0.72}
          >
            <Stop
              offset="0"
              stopColor={planPalette.ambient.color}
              stopOpacity={planPalette.ambient.opacity}
            />
            <Stop
              offset="1"
              stopColor={planPalette.ambient.color}
              stopOpacity={0}
            />
          </RadialGradient>
          {lit && (
            <RadialGradient
              id={`${paint}-lit`}
              gradientUnits="userSpaceOnUse"
              cx={x(lit.label)}
              cy={y(lit.label)}
              r={Math.max(
                ...lit.polygon.map((point) =>
                  Math.hypot(x(point) - x(lit.label), y(point) - y(lit.label)),
                ),
              )}
            >
              <Stop
                offset="0"
                stopColor={planPalette.litPool.color}
                stopOpacity={planPalette.litPool.opacity}
              />
              <Stop
                offset="1"
                stopColor={planPalette.litPool.color}
                stopOpacity={0}
              />
            </RadialGradient>
          )}
        </Defs>
        <Rect
          x={extent.x}
          y={extent.y}
          width={extent.width}
          height={extent.height}
          fill={`url(#${paint}-ambient)`}
        />
        {/* Under the floor and again over it: fainter indoors than on the stage. */}
        {gridLines}
        <Polygon points={points(floor.outline)} fill={planPalette.plate} />
        {floor.rooms.map((room) => (
          <PlanRoomPolygon
            key={room.id}
            id={room.id}
            points={points(room.polygon)}
            fill={roomFill(room.kind, tones.get(room.id))}
            stroke="transparent"
            onSelect={() => onSelectRoom(room.id)}
          />
        ))}
        <G pointerEvents="none">
          {lit && (
            <Polygon points={points(lit.polygon)} fill={`url(#${paint}-lit)`} />
          )}
          {gridLines}
          {floor.rooms.map((room) => (
            <Polygon
              key={room.id}
              points={points(room.polygon)}
              fill="none"
              stroke={planPalette.threshold.color}
              strokeOpacity={planPalette.threshold.opacity}
              strokeWidth={strokes.hairline}
              strokeLinejoin="miter"
            />
          ))}
          {[...(floor.furniture ?? [])]
            .sort((a, b) => furnitureLayer(a.kind) - furnitureLayer(b.kind))
            .map((item) => {
              const cx = x(item.center);
              const cy = y(item.center);
              const w = item.width * unit;
              const h = item.depth * unit;
              const rug = item.kind === "rug";
              const shared = {
                fill: planPalette.furnitureFill.color,
                fillOpacity: rug ? 0 : planPalette.furnitureFill.opacity,
                stroke: planPalette.furnitureStroke.color,
                strokeOpacity: planPalette.furnitureStroke.opacity,
                strokeWidth: strokes.hairline,
                strokeDasharray: rug
                  ? `${strokes.hairline * 3} ${strokes.hairline * 3}`
                  : undefined,
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
                  rx={Math.min(furnitureRadius[item.kind], w / 2, h / 2)}
                  {...shared}
                />
              );
            })}
          {floor.lines.map((line, index) =>
            line.kind === "window" ? null : (
              <Line
                key={index}
                x1={x(line.from)}
                y1={y(line.from)}
                x2={x(line.to)}
                y2={y(line.to)}
                stroke={planPalette.wall.color}
                strokeWidth={
                  line.kind === "step" ? strokes.hairline : strokes.partition
                }
                // Flat ends: an opening keeps exactly the width the model gives it.
                strokeLinecap="butt"
              />
            ),
          )}
          {wallJoints(floor.lines).map((point, index) => (
            <Circle
              key={index}
              cx={x(point)}
              cy={y(point)}
              r={strokes.partition / 2}
              fill={planPalette.wall.color}
            />
          ))}
          <Polygon
            points={points(floor.outline)}
            fill="none"
            stroke={planPalette.wall.color}
            strokeWidth={strokes.shell}
            strokeLinejoin="miter"
          />
          {lit &&
            // Stacked strokes fade like a glow without filters, which native lacks.
            [...haloSteps, [0, 1] as const].map(([spread, strokeOpacity]) => (
              <Polygon
                key={spread}
                points={points(lit.polygon)}
                fill="none"
                stroke={planPalette.selection.color}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokes.select + strokes.halo * spread}
                strokeLinejoin="round"
              />
            ))}
          {floor.lines.map((line, index) =>
            line.kind !== "window" ? null : (
              // Glazing set into whatever it interrupts, a lit outline included:
              // a dark reveal the width of the wall, then one thin pane.
              <G key={index}>
                <Line
                  x1={x(line.from)}
                  y1={y(line.from)}
                  x2={x(line.to)}
                  y2={y(line.to)}
                  stroke={planPalette.stage}
                  strokeWidth={strokes.shell + strokes.hairline}
                  strokeLinecap="butt"
                />
                <Line
                  x1={x(line.from)}
                  y1={y(line.from)}
                  x2={x(line.to)}
                  y2={y(line.to)}
                  stroke={planPalette.glass.color}
                  strokeWidth={strokes.glass}
                  strokeLinecap="butt"
                />
              </G>
            ),
          )}
        </G>
      </Svg>
      <View
        pointerEvents="none"
        style={[stage.edge, { borderRadius: stageRadius }]}
      />
      {showLabels &&
        labels.rooms.map(({ id, rect }) => {
          const tone = planPalette.label[tones.get(id) ?? "rest"];
          return (
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
              }}
            >
              {/* The backing may bleed past the reserved rectangle; the text never does. */}
              <View pointerEvents="none" style={label.bleed}>
                <View
                  pointerEvents="none"
                  style={[
                    label.backing,
                    compact && label.backingCompact,
                    {
                      backgroundColor: withAlpha(
                        tone.backing.color,
                        tone.backing.opacity,
                      ),
                      borderColor: tone.edge,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={2}
                    style={[
                      label.text,
                      compact && label.textCompact,
                      tone === planPalette.label.lit && label.textLit,
                      { color: tone.text },
                    ]}
                  >
                    {floor.rooms.find((room) => room.id === id)!.shortName}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      {markers.map((marker) => {
        const layout = labels.markers.get(marker.key);
        if (!layout) return null;
        const { point, target, caption } = layout;
        const content = (
          <>
            <View style={[markerStyles.dot, { borderColor: marker.tint }]}>
              <Icon name={marker.icon} color={marker.tint} size={20} />
            </View>
            {caption && (
              <View
                testID={`plan-marker-label-${marker.key}`}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: caption.x - target.x,
                  top: caption.y - target.y,
                  width: caption.width,
                  height: caption.height,
                }}
              >
                <View
                  style={[
                    markerStyles.bleed,
                    { alignItems: captionAlignment(caption, point.x) },
                  ]}
                >
                  <View style={markerStyles.label}>
                    <Text
                      numberOfLines={1}
                      style={[markerStyles.labelText, markerStyles.labelName]}
                    >
                      {marker.name}
                    </Text>
                    <Text numberOfLines={1} style={markerStyles.labelText}>
                      {marker.stateLabel}
                    </Text>
                  </View>
                </View>
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

/** Share of the halo width, and the opacity each ring adds. */
const haloSteps = [
  [1, 0.035],
  [0.7, 0.045],
  [0.45, 0.06],
  [0.25, 0.08],
  [0.1, 0.1],
] as const;
const stage = StyleSheet.create({
  // No border or padding here: the frame's own box is the projection surface.
  frame: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: planPalette.stage,
  },
  edge: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: planPalette.stageEdge,
  },
});
const label = StyleSheet.create({
  bleed: {
    position: "absolute",
    left: -6,
    right: -6,
    top: -3,
    bottom: -3,
    alignItems: "center",
    justifyContent: "center",
  },
  backing: {
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backingCompact: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 7 },
  text: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  textCompact: { fontSize: 11, lineHeight: 14 },
  textLit: { fontWeight: "700" },
});
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
  // The reserved rectangle keeps its collision-checked size; the backing hugs
  // the text and bleeds less than its own padding, so a caption reserved at
  // the stage edge can lose a sliver of backing but never a letter.
  bleed: { position: "absolute", left: -3, right: -3, top: 0, bottom: 0 },
  label: {
    maxWidth: "100%",
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: withAlpha(
      planPalette.label.rest.backing.color,
      planPalette.label.rest.backing.opacity,
    ),
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: planPalette.label.rest.edge,
  },
  labelText: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
    color: colors.text,
  },
  labelName: { fontWeight: "600" },
});
