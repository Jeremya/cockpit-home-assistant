import { HomeScreen } from "../../src/screens/HomeScreen";
import { useHomeInWorkspace } from "../../src/navigation/DetailWorkspace";

/** Home is the list route on native; on web the workspace renders it in both presentations. */
export default function HomeRoute() {
  return useHomeInWorkspace() ? null : <HomeScreen />;
}
