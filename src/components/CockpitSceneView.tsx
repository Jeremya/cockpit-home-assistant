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
  onRetry,
  fallbackMarkers = [],
  resetKey = 0,
}: {
  floor: PlanFloor;
  markers: readonly unknown[];
  selectedRoomId: string | null;
  onRoomPress: (roomId: string) => void;
  onMarkerPress: (key: string) => void;
  height?: number;
  visible?: boolean;
  simulate?: "context_loss" | null;
  onMetrics?: (metrics: SceneMetrics) => void;
  onRetry?: () => void;
  fallbackMarkers?: FloorPlanMarker[];
  resetKey?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "failed"; code: FailureCode }
  >({ kind: "loading" });
  const current = useRef(attempt);
  const mounted = useRef(true);
  const phase = useRef(state.kind);
  const started = useRef(0);
  const hostReady = useRef<number | null>(null);
  const latestFloor = useRef(floor);
  useLayoutEffect(() => {
    started.current = performance.now();
  }, []);
  useLayoutEffect(() => {
    latestFloor.current = floor;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
  const [active, setActive] = useState(AppState.currentState === "active");
  const interactive = useRef(false);
  useLayoutEffect(() => {
    interactive.current = visible && focused && active;
  }, [visible, focused, active]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) =>
      setActive(next === "active"),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (state.kind !== "loading" || !visible || !focused || !active) return;
    const timer = setTimeout(() => {
      if (mounted.current && current.current === attempt) {
        phase.current = "failed";
        setState({ kind: "failed", code: "watchdog" });
      }
    }, SCENE_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [attempt, state.kind, visible, focused, active]);

  const sceneFloor = useMemo(() => toSceneFloor(floor), [floor]);
  const sceneMarkers = useMemo(
    () => sanitizeMarkers(markers, floor.id),
    [markers, floor.id],
  );

  const latestMarkers = useRef(sceneMarkers);
  useLayoutEffect(() => {
    latestMarkers.current = sceneMarkers;
  });

  // Every callback is bound to the attempt that created it; late calls from an
  // obsolete scene (after a retry or remount) are dropped.
  const bridge = useMemo(() => {
    const live = () =>
      mounted.current &&
      current.current === attempt &&
      latestFloor.current.id === floor.id &&
      phase.current !== "failed";
    return {
      onRoomPress: async (roomId: string) => {
        if (
          live() &&
          interactive.current &&
          phase.current === "ready" &&
          latestFloor.current.rooms.some((room) => room.id === roomId)
        )
          onRoomPress(roomId);
      },
      onMarkerPress: async (key: string) => {
        if (
          live() &&
          interactive.current &&
          phase.current === "ready" &&
          latestMarkers.current.some((marker) => marker.key === key)
        )
          onMarkerPress(key);
      },
      onSceneReady: async () => {
        if (live() && phase.current === "loading") {
          phase.current = "ready";
          hostReady.current = Math.round(performance.now() - started.current);
          setState({ kind: "ready" });
        }
      },
      onSceneError: async (code: SceneErrorCode) => {
        if (live()) {
          phase.current = "failed";
          setState({ kind: "failed", code });
        }
      },
      onMetrics: async (metrics: SceneMetrics) => {
        if (live()) onMetrics?.({ ...metrics, hostReadyMs: hostReady.current });
      },
    };
  }, [attempt, onRoomPress, onMarkerPress, onMetrics, floor.id]);

  if (state.kind === "failed")
    return (
      <View style={{ gap: 10 }}>
        <FloorPlanView
          floor={floor}
          selectedRoom={selectedRoomId}
          onSelectRoom={onRoomPress}
          height={height}
          markers={fallbackMarkers}
          onMarkerPress={onMarkerPress}
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
            onRetry?.();
            current.current += 1;
            phase.current = "loading";
            started.current = performance.now();
            hostReady.current = null;
            setAttempt(current.current);
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
          if (mounted.current && current.current === attempt) {
            phase.current = "failed";
            setState({ kind: "failed", code: "init_failed" });
          }
        }}
      >
        <CockpitScene
          key={attempt}
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
  );
}
