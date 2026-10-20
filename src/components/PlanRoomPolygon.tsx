import { Polygon } from "react-native-svg";

export interface PlanRoomPolygonProps {
  id: string;
  points: string;
  fill: string;
  stroke: string;
  onSelect: () => void;
}

export function PlanRoomPolygon({
  id,
  onSelect,
  ...props
}: PlanRoomPolygonProps) {
  return (
    <Polygon
      {...props}
      testID={`plan-room-${id}`}
      strokeWidth={2}
      strokeLinejoin="round"
      onPress={onSelect}
    />
  );
}
