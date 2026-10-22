import { Stack } from "expo-router";
import { colors } from "../../src/components/ui";
import { DetailWorkspace } from "../../src/navigation/DetailWorkspace";

// A direct detail link keeps Home underneath as the list that closing returns to.
export const unstable_settings = { initialRouteName: "index" };

export default function WorkspaceLayout() {
  return (
    <Stack
      layout={(props) => <DetailWorkspace {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Home", headerShown: false }}
      />
      <Stack.Screen name="device/[key]" options={{ title: "Device" }} />
      <Stack.Screen
        name="appliance/[id]"
        options={{ title: "Device readings" }}
      />
    </Stack>
  );
}
