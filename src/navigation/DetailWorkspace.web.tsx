import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, Text, View } from "react-native";
import {
  CommonActions,
  StackActions,
  type NavigationHelpers,
  type ParamListBase,
  type StackNavigationState,
} from "expo-router/react-navigation";
import { HomeScreen } from "../screens/HomeScreen";
import { restoreReadingFocus } from "../components/readingFocus";
import { colors } from "../components/ui";
import { detailLayout, focusOriginOf } from "./detailNavigation";

const HomeInWorkspace = createContext(false);
export const useHomeInWorkspace = () => use(HomeInWorkspace);

/** The detail Stack's layout: Home stays mounted beside it while the panel fits.
 * Details remain real Stack entries, so the router alone owns URL and history. */
export function DetailWorkspace({
  state,
  navigation,
  children,
}: {
  state: StackNavigationState<ParamListBase>;
  navigation: NavigationHelpers<ParamListBase>;
  children: ReactNode;
}) {
  const host = useRef<View>(null);
  const [width, setWidth] = useState<number | null>(null);
  // Measure before the first paint so Home mounts once, in its final place.
  useLayoutEffect(() => {
    const node = host.current as unknown as HTMLElement | null;
    if (node) setWidth(node.getBoundingClientRect().width);
  }, []);
  const layout =
    width === null
      ? null
      : detailLayout(width, {
          web: true,
          hostsHome: state.routes[0]?.name === "index",
        });
  const panel = layout?.kind === "panel" ? layout : null;
  const paneled = panel !== null;
  const open = state.routes[state.index]?.name !== "index";
  const base = state.routes[0];
  const anchored =
    base?.name === "index" && Object.keys(base.params ?? {}).length > 0;
  // A direct link anchors Home with the detail's path params; the list takes none.
  useEffect(() => {
    if (anchored && base)
      navigation.dispatch({
        ...CommonActions.replaceParams({}),
        source: base.key,
        target: state.key,
      });
  }, [anchored, base, navigation, state.key]);
  const origin = useRef<string | null>(null);
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const opened = open && !wasOpen.current;
    const closed = !open && wasOpen.current;
    wasOpen.current = open;
    if (opened)
      origin.current = focusOriginOf(
        document.activeElement?.closest('[id^="detail-origin-"]')?.id,
      );
    if (!closed || !paneled) return;
    const id = origin.current;
    origin.current = null;
    // A removed origin falls back to the main region rather than the body.
    return restoreReadingFocus(
      () =>
        ((id && document.getElementById(id)) ??
          document.getElementById("maurice-content")) as unknown as View,
    );
  }, [open, paneled]);
  return (
    <View
      ref={host}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, flexDirection: "row", minWidth: 0 }}
    >
      {layout && (
        <HomeInWorkspace value={!!panel}>
          {panel && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <HomeScreen />
            </View>
          )}
          <View
            testID={panel ? "detail-panel" : undefined}
            style={
              !panel
                ? { flex: 1, minWidth: 0 }
                : open
                  ? {
                      width: panel.width,
                      borderLeftWidth: 1,
                      borderColor: colors.border,
                    }
                  : { display: "none" }
            }
          >
            {panel && open && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={() => navigation.dispatch(StackActions.popTo("index"))}
                style={{ minHeight: 48, justifyContent: "center", padding: 12 }}
              >
                <Text style={{ color: colors.accent }}>Close details</Text>
              </Pressable>
            )}
            {children}
          </View>
        </HomeInWorkspace>
      )}
    </View>
  );
}
