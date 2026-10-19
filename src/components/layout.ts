import { Platform, useWindowDimensions } from "react-native";

/** A wide browser gets a workspace; native navigation keeps its existing shape. */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  return { desktop: Platform.OS === "web" && width >= 1024, width, height };
}
