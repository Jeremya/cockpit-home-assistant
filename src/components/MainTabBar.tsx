import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./EntityIcon";
import { colors, type Interaction } from "./ui";
import { useResponsiveLayout } from "./layout";
import { mainTabFor, type MainTab } from "./shellNavigation";
import { minTouchTarget, radii, spacing, typography } from "../theme";

const destinations: {
  id: MainTab;
  href: string;
  label: string;
  icon: IconName;
}[] = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "rooms", href: "/entities", label: "Rooms", icon: "grid" },
  { id: "plan", href: "/house", label: "Plan", icon: "layers" },
  { id: "settings", href: "/settings", label: "Settings", icon: "sliders" },
];

/** Compact primary navigation. Detail, auth, diagnostics and lab routes keep Back. */
export function MainTabBar() {
  const path = usePathname();
  const active = mainTabFor(path);
  const { desktop } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  if (desktop || !active) return null;
  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(12, insets.bottom) }]}
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation mobile"
    >
      {destinations.map((destination) => {
        const selected = active === destination.id;
        return (
          <Pressable
            key={destination.id}
            accessibilityRole="link"
            accessibilityLabel={destination.label}
            accessibilityState={{ selected }}
            onPress={() => router.push(destination.href as never)}
            style={styles.item}
          >
            {({ pressed, hovered }: Interaction) => (
              <>
                {/* The pill marks the current place by shape as well as colour. */}
                <View
                  style={[
                    styles.well,
                    selected && styles.wellSelected,
                    !selected && (hovered || pressed) && styles.wellActive,
                  ]}
                >
                  <Icon
                    name={destination.icon}
                    size={20}
                    color={selected ? colors.accent : colors.muted}
                  />
                </View>
                <Text style={[styles.label, selected && styles.labelSelected]}>
                  {destination.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  well: {
    width: 56,
    height: 30,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  wellSelected: { backgroundColor: colors.accentTint },
  wellActive: { backgroundColor: colors.raised },
  label: {
    ...typography.eyebrow,
    textTransform: "none",
    letterSpacing: 0.2,
    color: colors.muted,
    fontWeight: "600",
  },
  labelSelected: { color: colors.accent, fontWeight: "700" },
});
