import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useHousePlan } from "../spatial/plans";
import { colors } from "./ui";
import { Icon } from "./EntityIcon";
import { FloorPlanView } from "./FloorPlanView";

export function HousePlanCard() {
  const { plan } = useHousePlan();
  const { width, fontScale } = useWindowDimensions();
  const spaces = plan.floors.reduce(
    (count, floor) => count + floor.rooms.length,
    0,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${plan.name} floor plan`}
      onPress={() => router.push("/house")}
      style={({ pressed }) => [card.container, pressed && { opacity: 0.7 }]}
    >
      {width >= 380 && fontScale <= 1.3 ? (
        <View pointerEvents="none" style={{ width: 112 }}>
          <FloorPlanView
            floor={plan.floors[0]!}
            height={118}
            showLabels={false}
            selectedRoom={null}
            onSelectRoom={() => undefined}
          />
        </View>
      ) : (
        <View style={card.icon}>
          <Icon name="layers" size={25} color={colors.accent} />
        </View>
      )}
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={card.title}>{plan.name}</Text>
        <Text style={card.subtitle}>
          {plan.floors.length} floors · {spaces} spaces
        </Text>
        <Text style={card.link}>Explore your floor plan</Text>
      </View>
      <Icon name="chevron-right" color={colors.accent} />
    </Pressable>
  );
}
const card = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: "#3a5374",
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#98c2ff14",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  link: { color: colors.accent, fontSize: 12, lineHeight: 18, marginTop: 3 },
});
