import type { PlanRoomPolygonProps } from "./PlanRoomPolygon";

/** Visual hit target; the shared room tabs provide keyboard/screen-reader access. */
export function PlanRoomPolygon({
  id,
  onSelect,
  ...props
}: PlanRoomPolygonProps) {
  return (
    <polygon
      {...props}
      data-testid={`plan-room-${id}`}
      strokeWidth={2}
      strokeLinejoin="round"
      onClick={onSelect}
    />
  );
}
