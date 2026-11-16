import type { PropsWithChildren } from "react";
import {
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "../theme";
export { colors } from "../theme";

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
  accessibilityExpanded,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityExpanded?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={
        accessibilityExpanded === undefined
          ? undefined
          : { expanded: accessibilityExpanded }
      }
      aria-expanded={accessibilityExpanded}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 22,
    paddingBottom: 48,
    gap: 20,
    ...Platform.select({
      web: { width: "100%", maxWidth: 1200, alignSelf: "center" },
    } as const),
  },
  label: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1,
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
    borderRadius: 16,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 15,
    color: colors.text,
    backgroundColor: colors.background,
    fontSize: 15,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
});
