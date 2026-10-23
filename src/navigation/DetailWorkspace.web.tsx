import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { useIsFocused } from "expo-router";
import {
  CommonActions,
  StackActions,
  type NavigationHelpers,
  type ParamListBase,
  type StackNavigationState,
} from "expo-router/react-navigation";
import { HomeScreen } from "../screens/HomeScreen";
import { restoreReadingFocus } from "../components/readingFocus";
import { DetailPane } from "../components/details/DetailPane";
import { detailLayout, escapeAction, focusOriginOf } from "./detailNavigation";
import { publishWorkspacePanel } from "./workspacePanel";

const HomeInWorkspace = createContext(false);
export const useHomeInWorkspace = () => use(HomeInWorkspace);

const visible = (node: Element | null | undefined): node is HTMLElement =>
  !!node &&
  node.isConnected &&
  node.getClientRects().length > 0 &&
  !node.closest('[inert], [aria-hidden="true"]');

/** A bounded UI key for the control that opened a detail: a card id or a plan marker. */
function captureOrigin() {
  const active = document.activeElement;
  const card = focusOriginOf(active?.closest('[id^="detail-origin-"]')?.id);
  if (card) return `#${CSS.escape(card)}`;
  const marker = active
    ?.closest('[data-testid^="plan-marker-"]')
    ?.getAttribute("data-testid");
  return marker && marker.length <= 512
    ? `[data-testid="${CSS.escape(marker)}"]`
    : null;
}
// The confirmation's own cancel control. SwitchControl is frozen, so the panel
// activates that control as a user would instead of reaching into its state.
const pendingCancel = (pane: ParentNode) =>
  [...pane.querySelectorAll('[role="button"]')].find(
    (node) => node.textContent?.trim() === "Cancel permission" && visible(node),
  ) as HTMLElement | undefined;

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
  const pane = useRef<View>(null);
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
  const focused = state.routes[state.index];
  const open = focused?.name !== "index";
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
  // A second workspace can sit above /house; only the visible one speaks.
  const shown = useIsFocused();
  useLayoutEffect(() => {
    if (shown) publishWorkspacePanel({ paneled, open: paneled && open });
  }, [shown, paneled, open]);
  const close = useCallback(
    () => navigation.dispatch(StackActions.popTo("index")),
    [navigation],
  );
  const origin = useRef<string | null>(null);
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const opened = open && !wasOpen.current;
    const closed = !open && wasOpen.current;
    wasOpen.current = open;
    if (opened) origin.current = captureOrigin();
    if (!closed || !paneled) return;
    const selector = origin.current;
    origin.current = null;
    // Back to the origin while it is still shown, otherwise to the list title.
    return restoreReadingFocus(() => {
      const node = selector ? document.querySelector(selector) : null;
      const target = visible(node)
        ? node
        : document.getElementById("home-list-title");
      return (visible(target) ? target : null) as unknown as View | null;
    });
  }, [open, paneled]);
  // Every detail the panel shows, opened or stepped back to, focuses its title.
  useLayoutEffect(() => {
    if (!paneled || !open) return;
    return restoreReadingFocus(() => {
      const node = pane.current as unknown as HTMLElement | null;
      const title = node
        ? [...node.querySelectorAll('[data-testid="detail-title"]')].find(
            visible,
          )
        : undefined;
      return (title ?? null) as unknown as View | null;
    });
  }, [paneled, open, focused?.key]);
  useEffect(() => {
    if (!paneled || !open || !shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target instanceof Element ? event.target : null;
      const node = pane.current as unknown as HTMLElement | null;
      const cancel = node ? pendingCancel(node) : undefined;
      const action = escapeAction({
        handled: event.defaultPrevented,
        inScene: !!target?.closest("[data-s01-scene]"),
        editing: !!target?.closest(
          'input, textarea, select, [contenteditable="true"]',
        ),
        confirmation: !!cancel,
        open: true,
      });
      if (action === "none") return;
      event.preventDefault();
      if (action === "cancelConfirmation") cancel?.click();
      else close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paneled, open, shown, close]);
  return (
    <View
      ref={host}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, flexDirection: "row", minWidth: 0 }}
    >
      {layout && (
        <HomeInWorkspace value={paneled}>
          {panel && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <HomeScreen />
            </View>
          )}
          <View
            ref={pane}
            style={
              !panel
                ? { flex: 1, minWidth: 0 }
                : open
                  ? { width: panel.width, minHeight: 0 }
                  : { display: "none" }
            }
          >
            <DetailPane
              framed={paneled}
              width={panel?.width ?? 0}
              canGoBack={state.index >= 2}
              onBack={() => navigation.dispatch(StackActions.pop())}
              onClose={close}
            >
              {children}
            </DetailPane>
          </View>
        </HomeInWorkspace>
      )}
    </View>
  );
}
