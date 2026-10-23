import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../EntityIcon";
import { colors } from "../ui";
import { minTouchTarget, radii, spacing, typography } from "../../theme";

/** The desktop panel's frame: a step back inside the panel, a named exit and
 * one bounded body. It is a region beside Home, never a modal. Unframed, it
 * keeps the same nesting so crossing the breakpoint never remounts the detail. */
export function DetailPane({
  framed = true,
  width,
  canGoBack,
  onBack,
  onClose,
  children,
}: PropsWithChildren<{
  framed?: boolean;
  width: number;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
}>) {
  return (
    <View
      testID={framed ? "detail-panel" : undefined}
      role={framed ? "region" : undefined}
      aria-label={framed ? "Details" : undefined}
      style={framed ? [pane.container, { width }] : pane.body}
    >
      {framed && (
        <View style={pane.header}>
          {canGoBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to previous detail"
              onPress={onBack}
              style={({ pressed }) => [pane.action, pressed && pane.pressed]}
            >
              <Icon name="chevron-left" size={18} color={colors.text} />
              <Text style={pane.label}>Back</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close details"
            onPress={onClose}
            style={({ pressed }) => [pane.action, pressed && pane.pressed]}
          >
            <Icon name="x" size={18} color={colors.text} />
            <Text style={pane.label}>Close</Text>
          </Pressable>
        </View>
      )}
      <View style={pane.body}>{children}</View>
    </View>
  );
}
const pane = StyleSheet.create({
  container: {
    flex: 1,
    borderLeftWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  action: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
  },
  pressed: { opacity: 0.6 },
  label: { ...typography.secondary, color: colors.text, fontWeight: "600" },
  // The only scroll container is the route adapter inside this bounded body.
  body: { flex: 1, minHeight: 0 },
});
