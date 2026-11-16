import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlanFloor } from "../../spatial/model";
import { FloorPlanView, type FloorPlanMarker } from "../FloorPlanView";
import { Icon } from "../EntityIcon";
import { colors } from "../ui";
import { radii, spacing } from "../../theme";

/**
 * Compact architectural orientation on Home. It is a static SVG preview, not a
 * second 3D renderer: the full scene stays in the plan card / Plan route.
 */
export function HomeArchitecture({
  floor,
  selectedRoomId,
  markers,
  onOpen,
}: {
  floor: PlanFloor;
  selectedRoomId: string | null;
  markers: FloorPlanMarker[];
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${floor.name} architectural preview`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={styles.plan}
      >
        <FloorPlanView
          floor={floor}
          selectedRoom={selectedRoomId}
          onSelectRoom={() => undefined}
          markers={markers}
          height={172}
        />
      </View>
      <View style={styles.caption}>
        <View>
          <Text style={styles.eyebrow}>ARCHITECTURAL PREVIEW</Text>
          <Text style={styles.title}>
            {floor.name} · {floor.rooms.length}{" "}
            {floor.rooms.length === 1 ? "space" : "spaces"}
          </Text>
        </View>
        <View style={styles.link}>
          <Text style={styles.linkText}>Open plan</Text>
          <Icon name="arrow-up-right" size={14} color={colors.accent} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  plan: { height: 172 },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  link: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
});
