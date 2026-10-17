import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { session } from "../src/services/runtime";
import { colors } from "../src/components/ui";
export default function RootLayout() {
  useEffect(() => {
    void session.bootstrap();
    const listener = AppState.addEventListener("change", (state) => {
      void session
        .setForeground(state === "active")
        .catch(() =>
          session.notice("Could not refresh after returning to the app."),
        );
    });
    return () => listener.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
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
        <Stack.Screen name="settings" options={{ title: "Connection" }} />
        <Stack.Screen name="house" options={{ title: "Floor plan" }} />
        <Stack.Screen name="house-links" options={{ title: "Link rooms" }} />
        <Stack.Screen name="house-place" options={{ title: "Place device" }} />
        <Stack.Screen name="device/[key]" options={{ title: "Device" }} />
        <Stack.Screen
          name="appliance/[id]"
          options={{ title: "Device readings" }}
        />
        <Stack.Screen name="entities" options={{ title: "Your entities" }} />
        <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
        <Stack.Screen name="scene-lab" options={{ title: "Scene lab" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
