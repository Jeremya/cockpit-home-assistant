import { Children, type PropsWithChildren, useState } from "react";
import { View } from "react-native";
import { spacing } from "../theme";

/** Columns follow the measured content width, whatever the platform or rail. */
export function CardGrid({ children }: PropsWithChildren) {
  const [width, setWidth] = useState(0);
  const gap = spacing.md;
  const columns = Math.max(
    1,
    Math.min(3, Math.floor((width + gap) / (320 + gap))),
  );
  return (
    <View
      testID="device-grid"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap, minWidth: 0 }}
    >
      {Children.map(children, (child) =>
        child ? (
          <View
            testID="device-grid-cell"
            style={{
              width:
                columns === 1
                  ? "100%"
                  : (width - gap * (columns - 1)) / columns,
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
