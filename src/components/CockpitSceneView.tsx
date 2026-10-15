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
import { FloorPlanView } from "./FloorPlanView";
import { Body, Button, colors } from "./ui";

export const SCENE_WATCHDOG_MS = 10_000;
/** Rendering-only preview; actual story heights are unknown. */
const PREVIEW_WALL_HEIGHT = 0.6;

type FailureCode = SceneErrorCode | "watchdog";
const failureText: Record<FailureCode, string> = {
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

/**
 * Native host for the DOM/Three.js scene. Owns readiness, the watchdog, retries and
 * visibility; the 2D plan stays usable whenever the scene is unavailable.
 */
export function CockpitSceneView({
  floor,
  markers,
  selectedRoomId,
  onRoomPress,
  onMarkerPress,
  height = 380,
  visible = true,
  simulate = null,
  onMetrics,
}: {
  floor: PlanFloor;
  markers: readonly Record<string, unknown>[];
  selectedRoomId: string | null;
  onRoomPress: (roomId: string) => void;
  onMarkerPress: (key: string) => void;
  height?: number;
  visible?: boolean;
  simulate?: "context_loss" | null;
  onMetrics?: (metrics: SceneMetrics) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "failed"; code: FailureCode }
  >({ kind: "loading" });
  const current = useRef(attempt);
  useLayoutEffect(() => {
    current.current = attempt;
  }, [attempt]);

  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) =>
      setActive(next === "active"),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (state.kind !== "loading") return;
    const timer = setTimeout(() => {
      if (current.current === attempt)
        setState({ kind: "failed", code: "watchdog" });
    }, SCENE_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [attempt, state.kind]);

  const sceneFloor = useMemo(() => toSceneFloor(floor), [floor]);
  const sceneMarkers = useMemo(
    () => sanitizeMarkers(markers, floor.id),
    [markers, floor.id],
  );

  // Every callback is bound to the attempt that created it; late calls from an
  // obsolete scene (after a retry or remount) are dropped.
  const bridge = useMemo(() => {
    const live = () => current.current === attempt;
    return {
      onRoomPress: async (roomId: string) => {
        if (live()) onRoomPress(roomId);
      },
      onMarkerPress: async (key: string) => {
        if (live()) onMarkerPress(key);
      },
      onSceneReady: async () => {
        if (live())
          setState((s) => (s.kind === "loading" ? { kind: "ready" } : s));
      },
      onSceneError: async (code: SceneErrorCode) => {
        if (live()) setState({ kind: "failed", code });
      },
      onMetrics: async (metrics: SceneMetrics) => {
        if (live()) onMetrics?.(metrics);
      },
    };
  }, [attempt, onRoomPress, onMarkerPress, onMetrics]);

  if (state.kind === "failed")
    return (
      <View style={{ gap: 10 }}>
        <FloorPlanView
          floor={floor}
          selectedRoom={selectedRoomId}
          onSelectRoom={onRoomPress}
          height={height}
        />
        <Text style={{ color: colors.warning, fontWeight: "600" }}>
          3D view unavailable
        </Text>
        <Body>
          {failureText[state.code]} The 2D plan and room list still work.
        </Body>
        <Button
          title="Retry 3D view"
          secondary
          onPress={() => {
            setAttempt((value) => value + 1);
            setState({ kind: "loading" });
          }}
        />
      </View>
    );

  return (
    <View style={{ height, borderRadius: 16, overflow: "hidden" }}>
      <SceneBoundary
        key={attempt}
        onError={() => {
          if (current.current === attempt)
            setState({ kind: "failed", code: "init_failed" });
        }}
      >
        <CockpitScene
          key={attempt}
          floor={sceneFloor}
          markers={sceneMarkers}
          selectedRoomId={selectedRoomId}
          visible={visible && focused && active}
          wallHeight={PREVIEW_WALL_HEIGHT}
          simulate={simulate}
          {...bridge}
          dom={{ style: { flex: 1 }, scrollEnabled: false, bounces: false }}
        />
      </SceneBoundary>
    </View>
  );
}
