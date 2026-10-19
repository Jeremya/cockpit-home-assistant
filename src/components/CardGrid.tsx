import { Children, type PropsWithChildren, useState } from "react";
import { View } from "react-native";
import { useResponsiveLayout } from "./layout";

/** Measure the actual content width, including when a desktop rail is present. */
export function CardGrid({ children }: PropsWithChildren) {
  const { desktop } = useResponsiveLayout();
  const [width, setWidth] = useState(0);
  const gap = 14;
  const columns = desktop
    ? Math.max(1, Math.min(3, Math.floor((width + gap) / (320 + gap))))
    : 1;
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
