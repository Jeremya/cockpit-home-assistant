import { Text, View } from "react-native";
import { Body, Label, styles } from "../ui";
import { spacing } from "../../theme";

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
/** Where the reading sits, its name and what it is: one header for every detail. */
export function DetailHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {!!eyebrow && <Label>{eyebrow}</Label>}
      <DetailTitle>{title}</DetailTitle>
      {!!description && <Body>{description}</Body>}
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
  return <DetailHeader title={title} description={body} />;
}
export const notConnected = {
  title: "Not connected",
  body: "Connect to your home to see this detail. A link opens only in the home it belongs to.",
};
