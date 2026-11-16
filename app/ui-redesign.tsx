import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { PrototypeHome } from "../src/prototypes/ui-redesign/PrototypeHome";

/**
 * Isolated design-review harness. It is not linked from production navigation,
 * never opens a Home Assistant session and is only rendered when
 * EXPO_PUBLIC_UI_REDESIGN=1. Remove this route after the direction is approved.
 */
export default function UiRedesignPreview() {
  const { concept } = useLocalSearchParams<{ concept?: string }>();
  const enabled = process.env.EXPO_PUBLIC_UI_REDESIGN === "1";
  if (!enabled)
    return (
      <View style={styles.off}>
        <Text style={styles.offText}>Design preview disabled.</Text>
      </View>
    );
  const selected = concept === "b" || concept === "c" ? concept : "a";
  return (
    <View style={styles.host}>
      <Stack.Screen options={{ headerShown: false }} />
      <PrototypeHome concept={selected} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: "#06090F" },
  off: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0F19",
  },
  offText: { color: "#F3F5FB", fontSize: 15 },
});
