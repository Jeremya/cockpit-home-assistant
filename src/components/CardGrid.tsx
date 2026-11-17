import {
  Children,
  type PropsWithChildren,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Platform, View } from "react-native";
import { layout } from "../theme";

/** One gutter for the device grid and for the Home columns above it. */
export const gridGap = layout.stack;
const minColumn = 320;

/** One to three columns from a measured content width. */
export function gridColumns(width: number) {
  return Math.max(
    1,
    Math.min(3, Math.floor((width + gridGap) / (minColumn + gridGap))),
  );
}
/** The width of one column of that grid. */
export function gridUnit(width: number) {
  const columns = gridColumns(width);
  // Rounded down so a full row never wraps on a fractional pixel.
  return Math.floor(((width - gridGap * (columns - 1)) / columns) * 100) / 100;
}

/** Columns follow the measured content width, whatever the platform or rail.
 * Cells in a row share its height, so cards end on one line. */
export function CardGrid({ children }: PropsWithChildren) {
  const grid = useRef<View>(null);
  const [width, setWidth] = useState(0);
  // On web, measure before the first paint: a grid mounted by a filter change
  // otherwise shows one full-width column for a frame, then jumps to columns.
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const node = grid.current as unknown as HTMLElement | null;
    if (node) setWidth(node.getBoundingClientRect().width);
  }, []);
  const columns = gridColumns(width);
  return (
    <View
      ref={grid}
      testID="device-grid"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "stretch",
        gap: gridGap,
        minWidth: 0,
      }}
    >
      {Children.map(children, (child) =>
        child ? (
          <View
            testID="device-grid-cell"
            style={{
              width: columns === 1 ? "100%" : gridUnit(width),
              minWidth: 0,
            }}
          >
            {child}
          </View>
        ) : null,
      )}
    </View>
  );
}
