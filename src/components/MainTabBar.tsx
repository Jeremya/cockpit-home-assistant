import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./EntityIcon";
import { colors } from "./ui";
import { useResponsiveLayout } from "./layout";
import { mainTabFor, type MainTab } from "./shellNavigation";
import { minTouchTarget } from "../theme";

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
      {destinations.map((destination) => (
        <Pressable
          key={destination.id}
          accessibilityRole="link"
          accessibilityLabel={destination.label}
          accessibilityState={{ selected: active === destination.id }}
          onPress={() => router.push(destination.href as never)}
          style={styles.item}
        >
          <Icon
            name={destination.icon}
            size={20}
            color={active === destination.id ? colors.accent : colors.muted}
          />
          <Text
            style={[
              styles.label,
              active === destination.id && { color: colors.accent },
            ]}
          >
            {destination.label}
          </Text>
        </Pressable>
      ))}
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
    paddingTop: 8,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: { color: colors.muted, fontSize: 10, fontWeight: "600" },
});
