import { HomeScreen } from "../../src/screens/HomeScreen";
import { useHomeInWorkspace } from "../../src/navigation/DetailWorkspace";

/** Home is the list route, unless the desktop workspace already shows it beside the panel. */
export default function HomeRoute() {
  return useHomeInWorkspace() ? null : <HomeScreen />;
}
