import { Text, View } from "react-native";
import { Body, styles } from "../ui";
import { detailGap } from "./layout";

/** The detail's one heading; the panel moves focus here when a detail opens. */
export function DetailTitle({ children }: { children: string }) {
  return (
    <View
      testID="detail-title"
      accessible
      accessibilityRole="header"
      accessibilityLabel={children}
      tabIndex={-1}
    >
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}
/** A target that cannot be shown: never a hint of another home's data. */
export function DetailMessage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={{ gap: detailGap }}>
      <DetailTitle>{title}</DetailTitle>
      <Body>{body}</Body>
    </View>
  );
}
export const notConnected = {
  title: "Not connected",
  body: "Connect to your home to see this detail. A link opens only in the home it belongs to.",
};
