import { Stack } from "expo-router";
import { colors } from "../../src/components/ui";
import { stackHeaderLeft } from "../../src/components/stackHeader";
import { DetailWorkspace } from "../../src/navigation/DetailWorkspace";
import { useWorkspacePanel } from "../../src/navigation/workspacePanel";

// A direct detail link keeps Home underneath as the list that closing returns to.
export const unstable_settings = { initialRouteName: "index" };

export default function WorkspaceLayout() {
  // The panel draws its own Back and Close; the Stack header serves routes only.
  const { paneled } = useWorkspacePanel();
  return (
    <Stack
      layout={(props) => <DetailWorkspace {...props} />}
      screenOptions={{
        headerShown: !paneled,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerLeft: stackHeaderLeft,
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
