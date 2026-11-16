import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import type { EntityRecord } from "../../../core/types";
import {
  clearCameraCache,
  fetchCameraImage,
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
};

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
