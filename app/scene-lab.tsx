import { Redirect } from "expo-router";
import { SceneLabScreen } from "../src/screens/SceneLabScreen";
import { buildFeatures } from "../src/config/build";

export default function SceneLabRoute() {
  return buildFeatures.spatial3d ? (
    <SceneLabScreen />
  ) : (
    <Redirect href="/house" />
  );
}
