import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";
import type { EntityRecord } from "../../core/types";
import { session } from "../../services/runtime";
import {
  cameraCacheKey,
  evictCameraCache,
  fetchCameraImage,
  readCameraCache,
  writeCameraCache,
  type CameraImageError,
  type CameraImageResult,
} from "../../services/cameraImage";

const CAMERA_POLL_MS = 10_000;

export type CameraImageState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "loaded";
      dataUri: string;
      fetchedAt: string;
      capturedAt: string | null;
    }
  | { status: "empty" }
  | { status: "error"; reason: CameraImageError };

function toState(result: CameraImageResult): CameraImageState {
  switch (result.kind) {
    case "image":
      return {
        status: "loaded",
        dataUri: result.dataUri,
        fetchedAt: result.fetchedAt,
        capturedAt: result.capturedAt,
      };
    case "empty":
      return { status: "empty" };
    case "error":
      return { status: "error", reason: result.reason };
  }
}

/**
 * The single consumer of `session.cameraImageRequest`. Polls a camera's latest
 * still image every 10 s only while the screen is focused and the app is
 * foregrounded, never with overlapping requests, and drops results from an
 * obsolete profile/entity. Cache and state hold only the token-free data URI.
 *
 * A refresh that fails — including one that throws — replaces the shown frame
 * with its error and evicts the cached frame, so an older image is never
 * presented as the latest one after a failure.
 */
export function useCameraImage({
  entity,
  profileId,
  ready,
}: {
  entity: EntityRecord;
  profileId: string | null;
  ready: boolean;
}): CameraImageState {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  const isCamera = entity.domain === "camera";
  const enabled = isCamera && !!profileId && ready && focused && appActive;

  // Seed from the in-memory cache (a plain read) so a reopened detail shows its
  // last image immediately; the effect then refreshes it in the background.
  const [result, setResult] = useState<CameraImageResult | null>(() => {
    if (!profileId || !isCamera) return null;
    return readCameraCache(cameraCacheKey(profileId, entity.key)) ?? null;
  });

  useEffect(() => {
    if (!enabled || !profileId) return;
    const cacheKey = cameraCacheKey(profileId, entity.key);
    let cancelled = false;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      let fetched: CameraImageResult | null;
      try {
        const request = session.cameraImageRequest(entity.entityId);
        fetched = request ? await fetchCameraImage(request) : null;
      } catch {
        // `fetchCameraImage` is total by contract. Should it or the session
        // ever throw, the failure is shown like any other instead of leaving
        // "loading" or a previous frame on screen.
        fetched = { kind: "error", reason: "network" };
      }
      inFlight = false;
      if (cancelled || fetched === null) return;
      // The cache only ever seeds the frame of the latest completed retrieval:
      // once one fails, the older frame must not come back as the current one.
      if (fetched.kind === "image") writeCameraCache(cacheKey, fetched);
      else evictCameraCache(cacheKey);
      setResult(fetched);
    };

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, CAMERA_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, profileId, entity.entityId, entity.key]);

  if (!isCamera) return { status: "idle" };
  if (!enabled) {
    return result?.kind === "image" ? toState(result) : { status: "idle" };
  }
  return result === null ? { status: "loading" } : toState(result);
}
