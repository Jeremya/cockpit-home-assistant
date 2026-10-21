import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { PlanFloor } from "../spatial/model";
import CockpitScene from "../web/CockpitScene";
import {
  sanitizeMarkers,
  toSceneFloor,
  type SceneErrorCode,
  type SceneMetrics,
} from "../web/sceneModel";
import { FloorPlanView, type FloorPlanMarker } from "./FloorPlanView";
import { Body, Button, colors } from "./ui";
import { useRendererActivity } from "./rendererActivity";
import { buildFeatures } from "../config/build";

export const SCENE_WATCHDOG_MS = 10_000;
const PREVIEW_WALL_HEIGHT = 0.6;
export type SceneFailure = SceneErrorCode | "watchdog";
const failureText: Record<SceneFailure, string> = {
  watchdog: "The 3D view did not start in time.",
  webgl_unavailable: "This device's web view does not provide WebGL.",
  init_failed: "The 3D view could not be built.",
  context_lost: "The graphics context was lost.",
  runtime_error: "The 3D view stopped after an error.",
};
class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export interface CockpitSceneViewProps {
  floor: PlanFloor;
  markers: readonly unknown[];
  selectedRoomId: string | null;
  onRoomPress: (roomId: string) => void;
  onMarkerPress: (key: string) => void;
  height?: number;
  visible?: boolean;
  /** Retain the host/failure while releasing the expensive renderer. */
  mountRenderer?: boolean;
  simulate?: "context_loss" | null;
  onMetrics?: (metrics: SceneMetrics) => void;
  onRetry?: () => void;
  fallbackMarkers?: FloorPlanMarker[];
  resetKey?: number;
  /** Optional page-session ownership, used by production web routes. */
  failure?: SceneFailure | null;
  onFailure?: (code: SceneFailure) => void;
}

/** The host owns failure; an individual renderer mount owns readiness/watchdog.
 * Native retains S02 suspension. Web releases on route blur/document hiding.
 */
export function CockpitSceneView(props: CockpitSceneViewProps) {
  const { mountRenderer = true, height = 380, onRetry } = props;
  const {
    mount: activeRoute,
    visible: inViewport,
    setHost,
  } = useRendererActivity();
  const [localFailure, setFailure] = useState<SceneFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failure = props.failure === undefined ? localFailure : props.failure;
  const failed = (code: SceneFailure) => {
    setFailure(code);
    props.onFailure?.(code);
  };
  return (
    <View ref={setHost} style={{ gap: 10 }}>
      {buildFeatures.spatial3d && mountRenderer && activeRoute && !failure ? (
        <SceneAttempt
          key={attempt}
          {...props}
          visible={props.visible !== false && inViewport}
          onFailure={failed}
        />
      ) : (
        <PlanFallback {...props} height={height} />
      )}
      {failure && (
        <>
          <Text style={{ color: colors.warning, fontWeight: "600" }}>
            3D view unavailable
          </Text>
          <Body>
            {failureText[failure]} The 2D plan and room list still work.
          </Body>
          {buildFeatures.spatial3d && (
            <Button
              title="Retry 3D view"
              secondary
              onPress={() => {
                onRetry?.();
                setFailure(null);
                setAttempt((value) => value + 1);
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
function PlanFallback({
  floor,
  selectedRoomId,
  onRoomPress,
  onMarkerPress,
  height = 380,
  fallbackMarkers = [],
}: CockpitSceneViewProps) {
  return (
    <FloorPlanView
      floor={floor}
      selectedRoom={selectedRoomId}
      onSelectRoom={onRoomPress}
      onMarkerPress={onMarkerPress}
      markers={fallbackMarkers}
      height={height}
    />
  );
}

/** A destroyed instance can neither deliver events nor revive its successor. */
function SceneAttempt(
  props: CockpitSceneViewProps & { onFailure: (code: SceneFailure) => void },
) {
  const {
    floor,
    markers,
    selectedRoomId,
    height = 380,
    visible = true,
    simulate = null,
    resetKey = 0,
  } = props;
  const [ready, setReady] = useState(false);
  const alive = useRef(false);
  const phase = useRef<"loading" | "ready" | "failed">("loading");
  const started = useRef(0);
  const hostReady = useRef<number | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  useLayoutEffect(() => {
    alive.current = true;
    started.current = performance.now();
    return () => {
      alive.current = false;
    };
  }, []);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (next) =>
      setActive(next === "active"),
    );
    return () => listener.remove();
  }, []);
  const interactive = useRef(false);
  useLayoutEffect(() => {
    interactive.current = visible && focused && active;
  }, [visible, focused, active]);
  const fail = useCallback((code: SceneFailure) => {
    if (!alive.current || phase.current === "failed") return;
    phase.current = "failed";
    latest.current.onFailure(code);
  }, []);
  useEffect(() => {
    if (ready || !visible || !focused || !active) return;
    const timer = setTimeout(() => fail("watchdog"), SCENE_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [ready, visible, focused, active, fail]);
  const sceneFloor = useMemo(() => toSceneFloor(floor), [floor]);
  const sceneMarkers = useMemo(
    () => sanitizeMarkers(markers, floor.id),
    [markers, floor.id],
  );
  const latestMarkers = useRef(sceneMarkers);
  useLayoutEffect(() => {
    latestMarkers.current = sceneMarkers;
  });
  const bridge = useMemo(() => {
    const live = () =>
      alive.current &&
      phase.current !== "failed" &&
      latest.current.floor.id === floor.id;
    return {
      onRoomPress: async (id: string) => {
        if (
          live() &&
          interactive.current &&
          phase.current === "ready" &&
          latest.current.floor.rooms.some((room) => room.id === id)
        )
          latest.current.onRoomPress(id);
      },
      onMarkerPress: async (key: string) => {
        if (
          live() &&
          interactive.current &&
          phase.current === "ready" &&
          latestMarkers.current.some((marker) => marker.key === key)
        )
          latest.current.onMarkerPress(key);
      },
      onSceneReady: async () => {
        if (alive.current && phase.current === "loading") {
          phase.current = "ready";
          hostReady.current = Math.round(performance.now() - started.current);
          setReady(true);
        }
      },
      onSceneError: async (code: SceneErrorCode) => {
        if (alive.current) fail(code);
      },
      onMetrics: async (metrics: SceneMetrics) => {
        if (live())
          latest.current.onMetrics?.({
            ...metrics,
            hostReadyMs: hostReady.current,
          });
      },
    };
  }, [floor.id, fail]);
  // A fallback remains interactive until the first rendered frame. The loading
  // canvas still has real dimensions but cannot intercept taps/focus.
  return (
    <View style={{ height, borderRadius: 16, overflow: "hidden" }}>
      <View
        pointerEvents={ready ? "auto" : "none"}
        accessibilityElementsHidden={!ready}
        importantForAccessibility={ready ? "auto" : "no-hide-descendants"}
        aria-hidden={!ready}
        style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0 }}
      >
        <SceneBoundary onError={() => fail("init_failed")}>
          <CockpitScene
            floor={sceneFloor}
            markers={sceneMarkers}
            selectedRoomId={selectedRoomId}
            resetKey={resetKey}
            visible={visible && focused && active}
            wallHeight={PREVIEW_WALL_HEIGHT}
            simulate={simulate}
            {...bridge}
            dom={{
              style: { flex: 1 },
              scrollEnabled: false,
              bounces: false,
              nestedScrollEnabled: true,
              webviewDebuggingEnabled:
                __DEV__ || process.env.EXPO_PUBLIC_S01_PROOF === "1",
            }}
          />
        </SceneBoundary>
      </View>
      {!ready && <PlanFallback {...props} />}
    </View>
  );
}
