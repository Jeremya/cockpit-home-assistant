import { useEffect } from "react";
import { AppState, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { session } from "../src/services/runtime";
import { colors } from "../src/components/ui";
import { AppShell } from "../src/components/AppShell";
import { HomeViewProvider } from "../src/spatial/HomeViewProvider";
import { MainTabBar } from "../src/components/MainTabBar";
import { stackHeaderLeft } from "../src/components/stackHeader";
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
      <AppShell>
        <HomeViewProvider>
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                headerLeft: stackHeaderLeft,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen
                name="(workspace)"
                options={{ title: "Home", headerShown: false }}
              />
              <Stack.Screen name="settings" options={{ title: "Connection" }} />
              <Stack.Screen name="house" options={{ title: "Floor plan" }} />
              <Stack.Screen
                name="house-links"
                options={{ title: "Link rooms" }}
              />
              <Stack.Screen
                name="house-place"
                options={{ title: "Place device" }}
              />
              <Stack.Screen
                name="entities"
                options={{ title: "Your entities" }}
              />
              <Stack.Screen
                name="diagnostics"
                options={{ title: "Diagnostics" }}
              />
              <Stack.Screen name="scene-lab" options={{ title: "Scene lab" }} />
              <Stack.Screen
                name="auth-callback"
                options={{ title: "Signing in", headerShown: false }}
              />
            </Stack>
            <MainTabBar />
          </View>
        </HomeViewProvider>
      </AppShell>
    </SafeAreaProvider>
  );
}
