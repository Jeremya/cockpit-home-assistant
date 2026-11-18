import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import type { EntityRecord } from "../../../core/types";
import {
  cameraCacheKey,
  clearCameraCache,
  fetchCameraImage,
  readCameraCache,
  writeCameraCache,
  type CameraImageResult,
} from "../../../services/cameraImage";
import { session } from "../../../services/runtime";
import { useCameraImage } from "../useCameraImage";

jest.mock("expo-router", () => ({
  useIsFocused: () => true,
}));
jest.mock("../../../services/cameraImage", () => ({
  ...jest.requireActual("../../../services/cameraImage"),
  fetchCameraImage: jest.fn(),
}));
jest.mock("../../../services/runtime", () => ({
  session: { cameraImageRequest: jest.fn() },
}));

const mockFetch = fetchCameraImage as jest.Mock;
const mockRequest = session.cameraImageRequest as jest.Mock;
let listeners: Set<(state: AppStateStatus) => void>;

function camera(): EntityRecord {
  return {
    key: "entity:camera.front_door",
    entityId: "camera.front_door",
    domain: "camera",
    state: "idle",
    attributes: {},
    lastChanged: "2026-10-26T12:00:00.000Z",
    lastUpdated: "2026-10-26T12:00:00.000Z",
    deviceId: "demo-door",
    areaId: "entry",
    entityCategory: null,
    hiddenInHA: false,
    disabledInHA: false,
    name: "Front door camera",
  };
}

const imageResult = {
  kind: "image",
  dataUri: "data:image/png;base64,AAAA",
  contentType: "image/png",
  fetchedAt: "2026-10-26T12:00:00.000Z",
  capturedAt: null,
} satisfies CameraImageResult;
const cacheKey = cameraCacheKey("ha:a", camera().key);
const mountCamera = () =>
  renderHook(() =>
    useCameraImage({ entity: camera(), profileId: "ha:a", ready: true }),
  );

beforeEach(() => {
  jest.useFakeTimers();
  clearCameraCache("ha:a");
  AppState.currentState = "active";
  listeners = new Set();
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    });
  mockFetch.mockReset();
  mockRequest.mockReset();
  mockRequest.mockReturnValue({
    uri: "https://ha.example/api/camera_proxy/camera.front_door",
    headers: { Authorization: "Bearer secret-token" },
  });
  mockFetch.mockResolvedValue(imageResult);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("fetches on mount and polls every 10 seconds while enabled", async () => {
  const { result } = renderHook(() =>
    useCameraImage({ entity: camera(), profileId: "ha:a", ready: true }),
  );
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("loaded");

  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("never fetches when the session is not ready", async () => {
  renderHook(() =>
    useCameraImage({ entity: camera(), profileId: "ha:a", ready: false }),
  );
  await act(async () => {});
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20_000);
  });
  expect(mockFetch).not.toHaveBeenCalled();
});

test("never fetches for a non-camera entity", async () => {
  const sensor = { ...camera(), domain: "sensor", entityId: "sensor.x" };
  renderHook(() =>
    useCameraImage({ entity: sensor, profileId: "ha:a", ready: true }),
  );
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
});

test("does not overlap in-flight requests", async () => {
  let resolveFetch!: (value: typeof imageResult) => void;
  mockFetch.mockReturnValue(
    new Promise<typeof imageResult>((resolve) => {
      resolveFetch = resolve;
    }),
  );
  renderHook(() =>
    useCameraImage({ entity: camera(), profileId: "ha:a", ready: true }),
  );
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledTimes(1);

  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveFetch(imageResult);
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("refuses to fetch when the manager has no request for the entity", async () => {
  mockRequest.mockReturnValue(null);
  const { result } = renderHook(() =>
    useCameraImage({ entity: camera(), profileId: "ha:a", ready: true }),
  );
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
  expect(result.current.status).toBe("loading");
});

test("shows an error instead of loading forever when the retrieval rejects", async () => {
  mockFetch.mockRejectedValue(new Error("body read failed"));
  const { result } = mountCamera();
  await act(async () => {});
  expect(result.current).toEqual({ status: "error", reason: "network" });
});

test("shows an error when the session cannot build the request", async () => {
  mockRequest.mockImplementation(() => {
    throw new Error("session torn down");
  });
  const { result } = mountCamera();
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
  expect(result.current).toEqual({ status: "error", reason: "network" });
});

test("replaces the shown frame with the failure when a later refresh rejects", async () => {
  const { result } = mountCamera();
  await act(async () => {});
  expect(result.current.status).toBe("loaded");

  mockFetch.mockRejectedValue(new Error("connection dropped"));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(result.current).toEqual({ status: "error", reason: "network" });
});

test("keeps polling after a rejected refresh and recovers", async () => {
  mockFetch.mockRejectedValueOnce(new Error("connection dropped"));
  const { result } = mountCamera();
  await act(async () => {});
  expect(result.current.status).toBe("error");

  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe("loaded");
});

test("a cached frame gives way to the failure when its refresh rejects", async () => {
  writeCameraCache(cacheKey, imageResult);
  let rejectFetch!: (error: Error) => void;
  mockFetch.mockReturnValue(
    new Promise<CameraImageResult>((_resolve, reject) => {
      rejectFetch = reject;
    }),
  );
  const { result } = mountCamera();
  await act(async () => {});
  expect(result.current.status).toBe("loaded");

  await act(async () => {
    rejectFetch(new Error("connection dropped"));
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(result.current).toEqual({ status: "error", reason: "network" });
});

test("a failed refresh evicts the cached frame so a reopened detail cannot present it as current", async () => {
  const first = mountCamera();
  await act(async () => {});
  expect(first.result.current.status).toBe("loaded");

  mockFetch.mockResolvedValue({ kind: "error", reason: "timeout" });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(first.result.current).toEqual({ status: "error", reason: "timeout" });
  first.unmount();

  // Reopened while the camera still does not answer.
  mockFetch.mockReturnValue(new Promise<CameraImageResult>(() => {}));
  const reopened = mountCamera();
  await act(async () => {});
  expect(reopened.result.current.status).toBe("loading");
});

test("ignores a retrieval that completes after unmount", async () => {
  let resolveFetch!: (value: CameraImageResult) => void;
  mockFetch.mockReturnValue(
    new Promise<CameraImageResult>((resolve) => {
      resolveFetch = resolve;
    }),
  );
  const { result, unmount } = mountCamera();
  await act(async () => {});
  expect(result.current.status).toBe("loading");

  unmount();
  await act(async () => {
    resolveFetch(imageResult);
    await jest.advanceTimersByTimeAsync(20_000);
  });
  expect(result.current.status).toBe("loading");
  // An obsolete mount neither caches its late frame nor keeps polling.
  expect(readCameraCache(cacheKey)).toBeUndefined();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("ignores a rejection that arrives after unmount", async () => {
  writeCameraCache(cacheKey, imageResult);
  let rejectFetch!: (error: Error) => void;
  mockFetch.mockReturnValue(
    new Promise<CameraImageResult>((_resolve, reject) => {
      rejectFetch = reject;
    }),
  );
  const { result, unmount } = mountCamera();
  await act(async () => {});

  unmount();
  await act(async () => {
    rejectFetch(new Error("connection dropped"));
    await jest.advanceTimersByTimeAsync(20_000);
  });
  expect(result.current.status).toBe("loaded");
  // The obsolete mount's failure does not reach the cache either.
  expect(readCameraCache(cacheKey)).toEqual(imageResult);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("background and resume during a retrieval does not start a second request", async () => {
  let resolveFirst!: (value: typeof imageResult) => void;
  mockFetch.mockImplementationOnce(
    () => new Promise((resolve) => (resolveFirst = resolve)),
  );
  const { result } = mountCamera();
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Leave and come back before the first retrieval has settled.
  await act(async () => {
    for (const listener of listeners) listener("background");
  });
  await act(async () => {
    for (const listener of listeners) listener("active");
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // The resumed card applies the shared retrieval's result.
  await act(async () => {
    resolveFirst(imageResult);
  });
  expect(result.current.status).toBe("loaded");
  expect(readCameraCache(cacheKey)).toEqual(imageResult);

  // Once it has settled, polling resumes with a new request.
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test.each([
  ["the session stops being ready", { profileId: "ha:a", ready: false }],
  ["the profile is forgotten", { profileId: null, ready: false }],
] as const)(
  "a retrieval started before %s is never resumed after reconnecting to the same URL",
  async (_case, lost) => {
    let resolveFirst!: (value: typeof imageResult) => void;
    mockFetch.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const newer = { ...imageResult, dataUri: "data:image/png;base64,BBBB" };
    mockFetch.mockResolvedValueOnce(newer);
    const { result, rerender } = renderHook(
      (props: { profileId: string | null; ready: boolean }) =>
        useCameraImage({ entity: camera(), ...props }),
      { initialProps: { profileId: "ha:a" as string | null, ready: true } },
    );
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Forget while the card stays mounted, then reconnect to the same URL.
    rerender(lost);
    clearCameraCache("ha:a");
    rerender({ profileId: "ha:a", ready: true });
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // The retrieval made with the forgotten session settles late: dropped.
    await act(async () => {
      resolveFirst(imageResult);
    });
    expect(result.current).toMatchObject({
      status: "loaded",
      dataUri: newer.dataUri,
    });
    expect(readCameraCache(cacheKey)).toEqual(newer);
  },
);

test("asks the service to verify the declared length on a native platform", async () => {
  mountCamera();
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledWith(expect.anything(), {
    verifyDeclaredLength: true,
  });
});
